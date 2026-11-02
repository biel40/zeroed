import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ZombieModelId } from '../ZombieConfig';
import type { ZombieModelSources } from '../ZombieManager';
import { ZOMBIE_MODELS, type ZombieEyeColors, type ZombieModelSource } from '../ZombieVisual';
import { ZombieBodyFrame } from './ZombieBodyFrame';
import { buildAccessoryParts } from './ZombieSkinAccessories';
import { ZOMBIE_SKINS, type ZombieSkinDefinition, type ZombieSkinId } from './ZombieSkinCatalog';
import { buildStumpParts, burnAt, charColor, severedTriangles } from './ZombieSkinDamage';
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

/**
 * Eyes, mouth and blood keep the asset look even on a burnt body (the blood
 * band has no green to scale, so it could not be retinted anyway).
 */
function canBurn(band: WalkerPaletteBand): boolean {
  return band !== 'eyes' && band !== 'mouth' && band !== 'blood';
}

/**
 * The walker geometry dressed in a skin: atlas regions retinted through a
 * vertex color multiplier, burns painted the same way, severed forearms cut
 * away and accessories (and stumps) appended as rigid triangles weighted to
 * one bone, so the body stays a single skinned draw sharing the original
 * texture. Returns non-indexed geometry.
 */
export function buildSkinnedWalkerGeometry(
  geometry: THREE.BufferGeometry,
  boneNames: readonly string[],
  skin: ZombieSkinDefinition,
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
    part.geometry.dispose();
    return { geometry: placed, tint: tintFor(part.color, ACCESSORY_BAND), bone: body.boneIndex(part.bone), hat: part.detachableHat };
  });

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

  const tints = new Map<string, THREE.Color>();
  const bodyPoint = new THREE.Vector3();
  const burnt = new THREE.Color();
  for (let index = 0; index < baseCount; index++) {
    const vertex = kept[index];
    const band = walkerBandAt(uv[index * 2], uv[index * 2 + 1]);
    const region = walkerSkinRegion(band, boneNames[body.dominantBone(vertex)]);
    const hex = region ? skin.regions[region] : undefined;
    const burn = skin.burns && canBurn(band) ? burnAt(body.bodyPoint(vertex, bodyPoint), skin.burns) : 0;
    let tint = WHITE;
    if (burn > 0) {
      tint = tintFor(charColor(hex !== undefined ? burnt.set(hex) : burnt.copy(bandColor(band)), burn), band);
    } else if (hex !== undefined) {
      const key = `${band}:${hex}`;
      tint = tints.get(key) ?? tints.set(key, tintFor(hex, band)).get(key)!;
    }
    tint.toArray(color, index * 3);
  }

  let offset = baseCount;
  let hatStart = total;
  for (const part of parts) {
    if (part.hat) hatStart = Math.min(hatStart, offset);
    write(position, 3, offset, part.geometry.getAttribute('position'));
    write(normal, 3, offset, part.geometry.getAttribute('normal'));
    const count = part.geometry.getAttribute('position').count;
    for (let vertex = offset; vertex < offset + count; vertex++) {
      uv.set(ACCESSORY_UV, vertex * 2);
      skinIndex[vertex * 4] = part.bone;
      skinWeight[vertex * 4] = 1;
      part.tint.toArray(color, vertex * 3);
    }
    part.geometry.dispose();
    offset += count;
  }
  if (base !== geometry) base.dispose();

  const result = new THREE.BufferGeometry();
  if (hatStart < total) result.userData.hatStart = hatStart;
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
  );
  mesh.boundingBox = bodyBounds;
  const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => {
    const dressed = material.clone();
    dressed.vertexColors = true;
    return dressed;
  });
  mesh.material = Array.isArray(mesh.material) ? materials : materials[0];

  const skinned = { scene, clips: source.clips };
  bySkin.set(skinId, skinned);
  return skinned;
}

/** How a map dresses its horde (see `ZombieArena.zombieSkins` and `zombieEyes`). */
export interface ZombieHordeLook {
  readonly skins?: readonly ZombieSkinId[];
  readonly eyes?: ZombieEyeColors;
}

/**
 * Zombie sources dressed for a map: the walker becomes one look per listed
 * skin, dealt in turn across its pool, and every model takes the map's eye
 * colors. Missing assets (procedural fallback) keep their own look; without
 * a look the sources pass through untouched.
 */
export function dressZombieSources(
  sources: Readonly<Record<ZombieModelId, ZombieModelSource | null>>,
  { skins = [], eyes }: ZombieHordeLook = {},
): ZombieModelSources {
  if (skins.length === 0 && !eyes) return sources;
  const withEyes = (source: ZombieModelSource): ZombieModelSource => (eyes ? { ...source, eyes } : source);
  const dressed: ZombieModelSources = {};
  for (const modelId of Object.keys(sources) as ZombieModelId[]) {
    const source = sources[modelId];
    dressed[modelId] = !source
      ? source
      : modelId === 'walker' && skins.length > 0
        ? skins.map((skinId) => withEyes(createSkinnedWalkerSource(source, skinId)))
        : withEyes(source);
  }
  return dressed;
}
