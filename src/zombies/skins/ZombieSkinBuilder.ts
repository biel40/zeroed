import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ZOMBIE_MODEL_POOL_CAPACITIES, type ZombieModelId } from '../ZombieConfig';
import type { ZombieModelSources } from '../ZombieManager';
import { ZOMBIE_MODELS, type ZombieEyeColors, type ZombieModelSource } from '../ZombieVisual';
import { ZombieBodyFrame } from './ZombieBodyFrame';
import { measure } from './ZombieAccessoryGeometry';
import { ZombieGarmentDrape } from './ZombieGarmentDrape';
import {
  GARMENT_ALPHA_TEST,
  garmentAtlasTexture,
  garmentPatternGain,
  garmentPatternUv,
  walkerPaletteUv,
  type GarmentPattern,
} from './ZombieGarmentPatterns';
import { wornColor } from './ZombieGarmentWear';
import { buildAccessoryParts } from './ZombieSkinAccessories';
import { ZOMBIE_SKINS, type ZombieSkinDefinition, type ZombieSkinId } from './ZombieSkinCatalog';
import { apportionShares, type ZombieFloorLook, type ZombieSkinShare } from './ZombieSkinShares';
import { buildStumpParts, burnAt, charColor, severedBoneRemap, severedTriangles } from './ZombieSkinDamage';
import {
  DRIED_BLOOD_TINT,
  SkullSockets,
  rigJointsOf,
  remainsColor,
  wasteToBones,
  wearsRemains,
  type ZombieRigJoints,
} from './ZombieSkinRemains';
import {
  ACCESSORY_BAND,
  ACCESSORY_UV,
  WALKER_BAND_COLORS,
  walkerBandAt,
  walkerSkinRegion,
  type WalkerPaletteBand,
} from './ZombieSkinRegions';

const WHITE = new THREE.Color(1, 1, 1);

/** Linear color a band of the atlas is painted with. */
function bandColor(band: WalkerPaletteBand): THREE.Color {
  const [r, g, b] = WALKER_BAND_COLORS[band];
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

/**
 * Vertex color that turns a band of the atlas into `target` once the shader
 * multiplies them (both in linear space).
 */
function tintFor(target: number | THREE.Color, band: WalkerPaletteBand): THREE.Color {
  const source = bandColor(band);
  const color = new THREE.Color(target);
  return color.setRGB(color.r / source.r, color.g / source.g, color.b / source.b);
}

/** Vertex color that shows a pattern's main surface at `target` (linear). */
function patternTint(target: number | THREE.Color, pattern: GarmentPattern): THREE.Color {
  return new THREE.Color(target).multiplyScalar(garmentPatternGain(pattern));
}

/**
 * Eyes, mouth and blood keep the asset look even on a burnt body (the blood
 * band has no green to scale, so it could not be retinted anyway).
 */
function canBurn(band: WalkerPaletteBand): boolean {
  return band !== 'eyes' && band !== 'mouth' && band !== 'blood';
}

/**
 * The walker geometry dressed in a skin: atlas regions retinted through a
 * vertex color multiplier, burns and stains painted the same way, severed
 * forearms cut away and accessories (and stumps) appended as triangles
 * weighted to one bone or, for long cloth, draped over the hips and thighs, so the body stays a single skinned draw sharing the original
 * texture. A skeletal skin also wastes the body to its bones, which needs the
 * rig's `joints`. Returns non-indexed geometry.
 */
export function buildSkinnedWalkerGeometry(
  geometry: THREE.BufferGeometry,
  boneNames: readonly string[],
  skin: ZombieSkinDefinition,
  joints?: ZombieRigJoints,
): THREE.BufferGeometry {
  const base = geometry.index ? geometry.toNonIndexed() : geometry;
  const body = new ZombieBodyFrame(base, boneNames, ZOMBIE_MODELS.walker.height);
  const severedLimbs = skin.severedLimbs ?? [];
  const severed = severedTriangles(body, boneNames, severedLimbs);
  const kept: number[] = [];
  for (let triangle = 0; triangle < severed.length; triangle++) {
    if (!severed[triangle]) kept.push(triangle * 3, triangle * 3 + 1, triangle * 3 + 2);
  }
  // Keep detachable hats at the end so a shared attribute view can omit them.
  const parts = [...buildAccessoryParts(skin.accessories, body), ...buildStumpParts(body, boneNames, severedLimbs, severed)]
    .sort((a, b) => Number(a.detachableHat) - Number(b.detachableHat)).map((part) => {
    const placed = part.geometry.clone().applyMatrix4(body.toGeometry);
    placed.computeVertexNormals();
    const pattern = part.pattern && placed.getAttribute('uv') ? part.pattern : null;
    return {
      geometry: placed,
      /** The part in the body frame, where drape and wear are measured. */
      shape: part.geometry,
      color: part.color,
      pattern,
      tint: pattern ? patternTint(part.color, pattern) : tintFor(part.color, ACCESSORY_BAND),
      bone: body.boneIndex(part.bone),
      hat: part.detachableHat,
      draped: part.draped ?? false,
      worn: Boolean(part.fabric && skin.stains),
    };
  });
  const drape = parts.some((part) => part.draped)
    ? new ZombieGarmentDrape(body, base.getAttribute('skinIndex'), base.getAttribute('skinWeight'), measure(body))
    : null;
  // Patterned garments sample the garment atlas, which also carries the walker palette.
  const patterned = parts.some((part) => part.pattern);

  const baseCount = kept.length;
  const total = baseCount + parts.reduce((sum, part) => sum + part.geometry.getAttribute('position').count, 0);
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const skinIndex = new Uint16Array(total * 4);
  const skinWeight = new Float32Array(total * 4);
  const color = new Float32Array(total * 3);

  /** Copies `attribute` from `offset` on; `vertices` picks and orders its source vertices. */
  const write = (
    target: Float32Array | Uint16Array, itemSize: number, offset: number,
    attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, vertices?: readonly number[],
  ): void => {
    const count = vertices?.length ?? attribute.count;
    for (let index = 0; index < count; index++) {
      const vertex = vertices ? vertices[index] : index;
      for (let k = 0; k < itemSize; k++) target[(offset + index) * itemSize + k] = attribute.getComponent(vertex, k);
    }
  };
  write(position, 3, 0, base.getAttribute('position'), kept);
  write(normal, 3, 0, base.getAttribute('normal'), kept);
  write(uv, 2, 0, base.getAttribute('uv'), kept);
  write(skinIndex, 4, 0, base.getAttribute('skinIndex'), kept);
  write(skinWeight, 4, 0, base.getAttribute('skinWeight'), kept);
  const lostBones = severedBoneRemap(boneNames, severedLimbs);
  for (let slot = 0; slot < baseCount * 4; slot++) skinIndex[slot] = lostBones.get(skinIndex[slot]) ?? skinIndex[slot];
  if (skin.remains) {
    if (!joints) throw new Error('Skeletal zombie skins need the rig joints');
    wasteToBones(position, skinIndex, skinWeight, baseCount, boneNames, joints);
  }

  const tints = new Map<string, THREE.Color>();
  const bodyPoint = new THREE.Vector3();
  const burnt = new THREE.Color();
  const aged = new THREE.Color();
  const sockets = skin.remains ? skullSockets(body, kept, uv) : null;
  for (let index = 0; index < baseCount; index++) {
    const vertex = kept[index];
    const band = walkerBandAt(uv[index * 2], uv[index * 2 + 1]);
    const bone = boneNames[body.dominantBone(vertex)];
    const region = walkerSkinRegion(band, bone);
    const hex = region ? skin.regions[region] : undefined;
    const burn = skin.burns && canBurn(band) ? burnAt(body.bodyPoint(vertex, bodyPoint), skin.burns) : 0;
    let tint = WHITE;
    if (skin.remains && wearsRemains(band)) {
      tint = band === 'blood'
        ? DRIED_BLOOD_TINT
        : tintFor(remainsColor(band, bone, body.bodyPoint(vertex, bodyPoint), skin.remains, sockets, aged), band);
    } else if (burn > 0) {
      tint = tintFor(charColor(hex !== undefined ? burnt.set(hex) : burnt.copy(bandColor(band)), burn), band);
    } else if (hex !== undefined && skin.stains) {
      tint = tintFor(wornColor(aged.set(hex), body.bodyPoint(vertex, bodyPoint), skin.stains), band);
    } else if (hex !== undefined) {
      const key = `${band}:${hex}`;
      tint = tints.get(key) ?? tints.set(key, tintFor(hex, band)).get(key)!;
    }
    tint.toArray(color, index * 3);
  }
  if (patterned) {
    for (let index = 0; index < baseCount; index++) walkerPaletteUv(uv[index * 2], uv[index * 2 + 1], uv, index * 2);
  }
  const accessoryUv = new Float32Array(ACCESSORY_UV);
  if (patterned) walkerPaletteUv(ACCESSORY_UV[0], ACCESSORY_UV[1], accessoryUv, 0);

  let offset = baseCount;
  let hatStart = total;
  for (const part of parts) {
    if (part.hat) hatStart = Math.min(hatStart, offset);
    write(position, 3, offset, part.geometry.getAttribute('position'));
    write(normal, 3, offset, part.geometry.getAttribute('normal'));
    const count = part.geometry.getAttribute('position').count;
    const shape = part.shape.getAttribute('position');
    const partUv = part.geometry.getAttribute('uv');
    for (let vertex = offset; vertex < offset + count; vertex++) {
      if (part.pattern) garmentPatternUv(part.pattern, partUv.getX(vertex - offset), partUv.getY(vertex - offset), uv, vertex * 2);
      else uv.set(accessoryUv, vertex * 2);
      bodyPoint.fromBufferAttribute(shape, vertex - offset);
      if (drape && part.draped) {
        drape.weightsAt(bodyPoint, skinIndex, skinWeight, vertex);
      } else {
        skinIndex[vertex * 4] = part.bone;
        skinWeight[vertex * 4] = 1;
      }
      let tint = part.tint;
      if (part.worn && skin.stains) {
        wornColor(aged.set(part.color), bodyPoint, skin.stains);
        tint = part.pattern ? patternTint(aged, part.pattern) : tintFor(aged, ACCESSORY_BAND);
      }
      tint.toArray(color, vertex * 3);
    }
    part.geometry.dispose();
    part.shape.dispose();
    offset += count;
  }
  if (base !== geometry) base.dispose();

  const result = new THREE.BufferGeometry();
  if (hatStart < total) result.userData.hatStart = hatStart;
  if (patterned) result.userData.garmentAtlas = true;
  result.setAttribute('position', new THREE.BufferAttribute(position, 3));
  result.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  result.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  result.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  result.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  result.setAttribute('color', new THREE.BufferAttribute(color, 3));
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}

/** The skull's sockets, placed on the walker's own eyes (the vertices of `kept` sampling the eyes band). */
function skullSockets(body: ZombieBodyFrame, kept: readonly number[], uv: Float32Array): SkullSockets {
  const eyes: THREE.Vector3[] = [];
  kept.forEach((vertex, index) => {
    if (walkerBandAt(uv[index * 2], uv[index * 2 + 1]) === 'eyes') eyes.push(body.bodyPoint(vertex, new THREE.Vector3()));
  });
  return new SkullSockets(eyes);
}

function findSkinnedMesh(root: THREE.Object3D): THREE.SkinnedMesh {
  let found: THREE.SkinnedMesh | null = null;
  root.traverse((object) => {
    if (!found && object instanceof THREE.SkinnedMesh) found = object;
  });
  if (!found) throw new Error('Zombie skins need a skinned walker model');
  return found;
}

/** Built once per loaded walker and skin; runs reuse the same templates. */
const skinnedSources = new WeakMap<ZombieModelSource, Map<ZombieSkinId, ZombieModelSource>>();

/**
 * A walker source wearing `skinId`: same rig and clips, its own geometry and
 * a vertex-colored material. Pooled visuals clone it like any other source.
 */
export function createSkinnedWalkerSource(source: ZombieModelSource, skinId: ZombieSkinId): ZombieModelSource {
  let bySkin = skinnedSources.get(source);
  if (!bySkin) skinnedSources.set(source, bySkin = new Map());
  const cached = bySkin.get(skinId);
  if (cached) return cached;

  const scene = cloneSkeleton(source.scene) as THREE.Group;
  const mesh = findSkinnedMesh(scene);
  // Height normalization measures the body, not a hat on top of it.
  scene.updateMatrixWorld(true);
  mesh.computeBoundingBox();
  const bodyBounds = mesh.boundingBox!.clone();

  mesh.geometry = buildSkinnedWalkerGeometry(
    mesh.geometry,
    mesh.skeleton.bones.map((bone) => bone.name),
    ZOMBIE_SKINS[skinId],
    rigJointsOf(mesh),
  );
  mesh.boundingBox = bodyBounds;
  const garmentAtlas = mesh.geometry.userData.garmentAtlas === true;
  const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => {
    const dressed = material.clone() as THREE.MeshStandardMaterial;
    dressed.vertexColors = true;
    if (garmentAtlas) {
      // Every patterned skin shares one atlas, and with it one texture upload.
      dressed.map = garmentAtlasTexture();
      dressed.alphaTest = GARMENT_ALPHA_TEST;
    }
    return dressed;
  });
  mesh.material = Array.isArray(mesh.material) ? materials : materials[0];

  const skinned = { scene, clips: source.clips };
  bySkin.set(skinId, skinned);
  return skinned;
}

/** How a map dresses its horde (see `ZombieArena.zombieSkins`, `zombieSkinShares`, `zombieFloorLook` and `zombieEyes`). */
export interface ZombieHordeLook {
  readonly skins?: readonly ZombieSkinId[];
  /** Weighted looks; when present they replace `skins`. */
  readonly skinShares?: readonly ZombieSkinShare[];
  /** A floor's own walkers, dressed into a reserve of their own. */
  readonly floorLook?: ZombieFloorLook;
  readonly eyes?: ZombieEyeColors;
  /** See `ZombieModelSource.surfaceDetail`. */
  readonly surfaceDetail?: boolean;
}

/**
 * Walker looks of a weighted horde, one per pooled body: each share is a
 * single source carrying its `spawnWeight` (bodies of a share reuse it, so
 * ZombieLookPicker can tell them apart), apportioned across the reserve.
 */
function weightedWalkerLooks(
  walker: ZombieModelSource,
  shares: readonly ZombieSkinShare[],
  withLook: (source: ZombieModelSource) => ZombieModelSource,
): ZombieModelSource[] {
  const looks = shares.map(({ skin, weight }) => ({
    ...withLook(skin ? createSkinnedWalkerSource(walker, skin) : walker),
    spawnWeight: weight,
  }));
  return apportionShares(shares.map((share) => share.weight), ZOMBIE_MODEL_POOL_CAPACITIES.walker)
    .map((share) => looks[share]);
}

/**
 * Zombie sources dressed for a map: the walker becomes one look per listed
 * skin, dealt in turn across its pool (or rolled per spawn by weight with
 * `skinShares`), and every model takes the map's eye colors and the surface
 * detail flag. A `floorLook` adds a walker reserve of its own
 * (`floorWalkers`). Missing assets (procedural fallback) keep their own look;
 * without a look the sources pass through untouched.
 */
export function dressZombieSources(
  sources: Readonly<Record<ZombieModelId, ZombieModelSource | null>>,
  { skins = [], skinShares = [], floorLook, eyes, surfaceDetail = false }: ZombieHordeLook = {},
): ZombieModelSources {
  if (skins.length === 0 && skinShares.length === 0 && !floorLook && !eyes && !surfaceDetail) return sources;
  const withEyes = (lookEyes: ZombieEyeColors | undefined) => (source: ZombieModelSource): ZombieModelSource =>
    (lookEyes || surfaceDetail ? { ...source, ...(lookEyes && { eyes: lookEyes }), ...(surfaceDetail && { surfaceDetail }) } : source);
  const withLook = withEyes(eyes);
  const dressWalker = (walker: ZombieModelSource): ZombieModelSource | ZombieModelSource[] => {
    if (skinShares.length > 0) return weightedWalkerLooks(walker, skinShares, withLook);
    if (skins.length > 0) return skins.map((skinId) => withLook(createSkinnedWalkerSource(walker, skinId)));
    return withLook(walker);
  };
  const dressed: Partial<Record<ZombieModelId, ZombieModelSource | ZombieModelSource[] | null>> = {};
  for (const modelId of Object.keys(sources) as ZombieModelId[]) {
    const source = sources[modelId];
    dressed[modelId] = !source ? source : modelId === 'walker' ? dressWalker(source) : withLook(source);
  }
  if (!floorLook || !sources.walker) return dressed;
  const looks = weightedWalkerLooks(sources.walker, floorLook.skinShares, withEyes(floorLook.eyes ?? eyes));
  return { ...dressed, floorWalkers: { floor: floorLook.floor, looks } };
}
