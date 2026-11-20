import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AnimationMixer, Box3, Color, Matrix4, SkinnedMesh, Texture, Vector3, type BufferAttribute,
  type AnimationClip, type BufferGeometry, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { ZOMBIE_BASE_HP, ZOMBIE_MODEL_POOL_CAPACITIES, ZOMBIE_TYPE_CONFIGS, roundConfig } from '../src/zombies/ZombieConfig';
import { ZOMBIE_POOL_MODELS, ZombieManager, zombiePoolSource } from '../src/zombies/ZombieManager';
import { ZombieVisual, ZOMBIE_MODELS, type ZombieModelSource } from '../src/zombies/ZombieVisual';
import { STATION33_ZOMBIE_EYES, STATION33_ZOMBIE_SKINS } from '../src/zombies/maps/Station33Config';
import { buildSkinnedWalkerGeometry, createSkinnedWalkerSource, dressZombieSources } from '../src/zombies/skins/ZombieSkinBuilder';
import { MANSION_ZOMBIE_SKINS } from '../src/zombies/maps/BurnedMansionConfig';
import { DIE_KATHEDRALE_ZOMBIE_EYES, DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES } from '../src/zombies/maps/DieKathedraleConfig';
import { CATACOMB_FLOOR, CRYPT_ZOMBIE_LOOK } from '../src/zombies/maps/DieKathedraleCatacombsConfig';
import { ZOMBIE_SKINS, type ZombieSkinDefinition, type ZombieSkinId } from '../src/zombies/skins/ZombieSkinCatalog';
import { GARMENT_ALPHA_TEST, garmentAtlasTexture, walkerPaletteUv } from '../src/zombies/skins/ZombieGarmentPatterns';
import { WALKER_BAND_COLORS, walkerBandAt, walkerSkinRegion, type WalkerPaletteBand } from '../src/zombies/skins/ZombieSkinRegions';
import { Zombie } from '../src/zombies/Zombie';

const WALKER_GLB = fileURLToPath(new URL('../public/assets/zombies/zombie_walker.glb', import.meta.url));
const SKIN_IDS = Object.keys(ZOMBIE_SKINS) as ZombieSkinId[];
/** The Die Kathedrale clergy, dressed in long draped vestments. */
const CLERGY_SKINS: ReadonlySet<ZombieSkinId> = new Set(
  DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES.flatMap((share) => (share.skin ? [share.skin] : [])),
);
/** The dead of the Die Kathedrale crypt, wasted to the bone under their shrouds. */
const CRYPT_SKINS: ReadonlySet<ZombieSkinId> = new Set(
  CRYPT_ZOMBIE_LOOK.skinShares.flatMap((share) => (share.skin ? [share.skin] : [])),
);
/** Skins in long draped cloth: the cathedral clergy and the crypt dead. */
const VESTED_SKINS: ReadonlySet<ZombieSkinId> = new Set([...CLERGY_SKINS, ...CRYPT_SKINS]);

async function loadWalker(): Promise<ZombieModelSource> {
  const buffer = readFileSync(WALKER_GLB);
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const loader = new GLTFLoader().register(() => ({ name: 'headless-texture', loadTexture: async () => new Texture() }));
  const gltf = await loader.parseAsync(data, '');
  return { scene: gltf.scene, clips: gltf.animations };
}

function skinnedMeshOf(source: ZombieModelSource): SkinnedMesh {
  const meshes: SkinnedMesh[] = [];
  source.scene.traverse((object) => {
    if (object instanceof SkinnedMesh) meshes.push(object);
  });
  expect(meshes).toHaveLength(1);
  return meshes[0];
}

describe('walker palette regions', () => {
  it('reads the atlas bands the walker is painted with', () => {
    expect(walkerBandAt(4.5 / 32, 2.5 / 32)).toBe('skin');
    expect(walkerBandAt(22.5 / 32, 3.5 / 32)).toBe('eyes');
    expect(walkerBandAt(28.5 / 32, 2.5 / 32)).toBe('mouth');
    expect(walkerBandAt(15.5 / 32, 20.5 / 32)).toBe('shirt');
    expect(walkerBandAt(15.5 / 32, 26.5 / 32)).toBe('pants');
    expect(walkerBandAt(15.5 / 32, 30.5 / 32)).toBe('blood');
  });

  it('dresses limbs and torso but never the face or the blood', () => {
    expect(walkerSkinRegion('shirt', 'Spine2')).toBe('tunic');
    expect(walkerSkinRegion('skin', 'LeftForeArm')).toBe('sleeves');
    expect(walkerSkinRegion('skin', 'RightHandIndex2')).toBe('gloves');
    expect(walkerSkinRegion('pants', 'LeftUpLeg')).toBe('thighs');
    expect(walkerSkinRegion('pants', 'RightLeg')).toBe('shins');
    expect(walkerSkinRegion('wound', 'LeftLeg')).toBe('shins');
    expect(walkerSkinRegion('skin', 'RightToeBase')).toBe('feet');
    expect(walkerSkinRegion('skin', 'Head')).toBeNull();
    expect(walkerSkinRegion('eyes', 'Head')).toBeNull();
    expect(walkerSkinRegion('blood', 'Spine1')).toBeNull();
    expect(walkerSkinRegion('wound', 'Spine1')).toBeNull();
  });
});

describe('walker skins', async () => {
  const walker = await loadWalker();
  const plainGeometry = skinnedMeshOf(walker).geometry;
  const plainTriangles = (plainGeometry.index?.count ?? 0) / 3;
  const boneCount = skinnedMeshOf(walker).skeleton.bones.length;

  for (const skinId of SKIN_IDS) {
    it(`${skinId} stays one skinned draw on the walker rig`, () => {
      const source = createSkinnedWalkerSource(walker, skinId);
      const mesh = skinnedMeshOf(source);
      const geometry: BufferGeometry = mesh.geometry;
      expect(source.clips).toBe(walker.clips);
      expect(Array.isArray(mesh.material)).toBe(false);
      expect((mesh.material as MeshStandardMaterial).vertexColors).toBe(true);
      expect(mesh.skeleton.bones).toHaveLength(boneCount);

      const triangles = geometry.getAttribute('position').count / 3;
      const skin: ZombieSkinDefinition = ZOMBIE_SKINS[skinId];
      for (const name of ['position', 'normal', 'uv', 'skinWeight', 'color']) {
        expect((geometry.getAttribute(name).array as Float32Array).every(Number.isFinite), name).toBe(true);
      }
      // Severed limbs change the body itself; their own test covers them.
      if (skin.severedLimbs?.length) return;

      if (skin.accessories.length === 0) expect(triangles).toBe(plainTriangles);
      // Hats and belts stay a small fraction of the 2116-triangle body; full
      // vestments stay well under the body itself.
      else expect(triangles - plainTriangles).toBeGreaterThan(0);
      expect(triangles - plainTriangles).toBeLessThan(VESTED_SKINS.has(skinId) ? 1700 : 400);

      const weights = geometry.getAttribute('skinWeight');
      const indices = geometry.getAttribute('skinIndex');
      for (let vertex = plainTriangles * 3; vertex < weights.count; vertex++) {
        let total = 0;
        for (let slot = 0; slot < 4; slot++) {
          total += weights.getComponent(vertex, slot);
          if (weights.getComponent(vertex, slot) > 0) expect(indices.getComponent(vertex, slot)).toBeLessThan(boneCount);
        }
        expect(total).toBeCloseTo(1, 5);
        // Uniform accessories are rigid: all of their weight on one bone.
        if (!VESTED_SKINS.has(skinId)) expect(weights.getX(vertex)).toBe(1);
      }
    });
  }

  it('recolors the uniform while the face keeps the asset look', () => {
    const mesh = skinnedMeshOf(createSkinnedWalkerSource(walker, 'fieldOfficer'));
    const colors = mesh.geometry.getAttribute('color');
    const uvs = mesh.geometry.getAttribute('uv');
    let tinted = 0;
    let face = 0;
    for (let vertex = 0; vertex < plainTriangles * 3; vertex++) {
      const white = colors.getX(vertex) === 1 && colors.getY(vertex) === 1 && colors.getZ(vertex) === 1;
      const band = walkerBandAt(uvs.getX(vertex), uvs.getY(vertex));
      if (band === 'eyes' || band === 'mouth') {
        expect(white).toBe(true);
        face++;
      }
      if (band === 'shirt' && !white) tinted++;
    }
    expect(face).toBeGreaterThan(0);
    expect(tinted).toBeGreaterThan(100);
  });

  it('chars patches of the body and face while the eyes and mouth keep the asset look', () => {
    const mesh = skinnedMeshOf(createSkinnedWalkerSource(walker, 'charred'));
    const colors = mesh.geometry.getAttribute('color');
    const uvs = mesh.geometry.getAttribute('uv');
    let charred = 0;
    let charredHead = 0;
    for (let vertex = 0; vertex < plainTriangles * 3; vertex++) {
      const dark = colors.getX(vertex) < 0.5 && colors.getY(vertex) < 0.5 && colors.getZ(vertex) < 0.5;
      const band = walkerBandAt(uvs.getX(vertex), uvs.getY(vertex));
      if (band === 'eyes' || band === 'mouth') expect(colors.getX(vertex)).toBe(1);
      if (!dark) continue;
      charred++;
      if (mesh.skeleton.bones[mesh.geometry.getAttribute('skinIndex').getX(vertex)].name === 'Head') charredHead++;
    }
    expect(charred / (plainTriangles * 3)).toBeGreaterThan(0.15);
    expect(charred / (plainTriangles * 3)).toBeLessThan(0.85);
    expect(charredHead).toBeGreaterThan(0);
  });

  it('cuts a forearm away and closes the elbow flush with the upper arm', () => {
    const plainMesh = skinnedMeshOf(walker);
    const plainIndex = plainMesh.geometry.getAttribute('skinIndex');
    const plainWeight = plainMesh.geometry.getAttribute('skinWeight');
    const plainPosition = plainMesh.geometry.getAttribute('position');
    const leftForearm = (bone: number): boolean => /^Left(ForeArm|Hand)/.test(plainMesh.skeleton.bones[bone].name);
    const leftArm = plainMesh.skeleton.bones.findIndex((bone) => bone.name === 'LeftArm');
    let plainForearm = 0;
    const plainArm = new Box3();
    for (let vertex = 0; vertex < plainIndex.count; vertex++) {
      if (leftForearm(plainIndex.getX(vertex))) plainForearm++;
      for (let slot = 0; slot < 4; slot++) {
        if (plainWeight.getComponent(vertex, slot) > 0 && plainIndex.getComponent(vertex, slot) === leftArm) {
          plainArm.expandByPoint(new Vector3().fromBufferAttribute(plainPosition, vertex));
        }
      }
    }
    expect(plainForearm).toBeGreaterThan(0);

    const mesh = skinnedMeshOf(createSkinnedWalkerSource(walker, 'leftArmStump'));
    const weights = mesh.geometry.getAttribute('skinWeight');
    const indices = mesh.geometry.getAttribute('skinIndex');
    const position = mesh.geometry.getAttribute('position');
    const tolerance = plainArm.getSize(new Vector3()).length() * 0.01;
    let stump = 0;
    for (let vertex = 0; vertex < weights.count; vertex++) {
      // The lost bones no longer drive anything, so the cut cannot drift off its cap.
      for (let slot = 0; slot < 4; slot++) {
        if (weights.getComponent(vertex, slot) > 0) expect(leftForearm(indices.getComponent(vertex, slot))).toBe(false);
      }
      if (weights.getX(vertex) !== 1 || indices.getX(vertex) !== leftArm) continue;
      stump++;
      // The cap closes the cut inside the arm's own silhouette instead of bulging out of it.
      expect(plainArm.distanceToPoint(new Vector3().fromBufferAttribute(position, vertex))).toBeLessThanOrEqual(tolerance);
    }
    expect(stump).toBeGreaterThan(0);
    expect(mesh.geometry.getAttribute('position').count / 3).toBeLessThan(plainTriangles);
  });

  it('keeps the contract height even with a hat on', () => {
    const plain = new ZombieVisual('walker', walker, ZOMBIE_MODELS.walker.tints[0], false);
    const dressed = new ZombieVisual('walker', createSkinnedWalkerSource(walker, 'winterSentry'), ZOMBIE_MODELS.walker.tints[0], false);
    for (const visual of [plain, dressed]) visual.root.updateMatrixWorld(true);
    expect(new Box3().setFromObject(dressed.root).getSize(new Vector3()).y)
      .toBeCloseTo(new Box3().setFromObject(plain.root).getSize(new Vector3()).y, 5);
    expect(dressed.headAnchor.name).toBe('Head');
  });

  it('builds each skin once per loaded walker', () => {
    expect(createSkinnedWalkerSource(walker, 'rifleman')).toBe(createSkinnedWalkerSource(walker, 'rifleman'));
  });

  it('drops the complete hat once on a head hit, independently of the moving body, and restores it on reuse', () => {
    const source = createSkinnedWalkerSource(walker, 'winterVeteran');
    const zombie = new Zombie(new ZombieVisual('walker', source, ZOMBIE_MODELS.walker.tints[0], false));
    zombie.spawn(2, 3, 1000, 1, 3);
    zombie.skipSpawnRise();
    zombie.update(0);
    const mesh = skinnedMeshOf({ scene: zombie.visual.root, clips: [] });
    const original = mesh.geometry;
    zombie.applyDamage(10, false, 2, 0);
    expect(mesh.geometry).toBe(original);
    zombie.applyDamage(10, true, 2, 0);
    expect(mesh.geometry.drawRange.count).toBeLessThan(original.getAttribute('position').count);
    const hat = zombie.group.getObjectByName('fallen-zombie-hat') as Mesh;
    expect(hat.visible).toBe(true);
    zombie.group.updateMatrixWorld(true);
    expect(hat.getWorldPosition(new Vector3()).distanceTo(zombie.visual.headAnchor.getWorldPosition(new Vector3()))).toBeLessThan(0.4);
    const positions = hat.geometry.getAttribute('position').array.slice();
    zombie.applyDamage(10, true, 2, 0);
    expect(hat.geometry.getAttribute('position').array).toEqual(positions);
    zombie.position.x += 5;
    for (let i = 0; i < 240; i++) zombie.update(1 / 60);
    zombie.group.updateMatrixWorld(true);
    expect(hat.getWorldPosition(new Vector3()).x).toBeLessThan(4);
    expect(new Box3().setFromObject(hat).min.y).toBeCloseTo(3.01, 2);
    zombie.spawn(0, 0, 100, 1);
    expect(mesh.geometry).toBe(original);
    expect(hat.visible).toBe(false);
    zombie.dispose();
  });

  it('also drops hats for lethal and replicated head hits without changing another pooled body', () => {
    const source = createSkinnedWalkerSource(walker, 'fieldOfficer');
    const first = new Zombie(new ZombieVisual('walker', source, 0xffffff, false));
    const second = new Zombie(new ZombieVisual('walker', source, 0xffffff, false));
    for (const zombie of [first, second]) { zombie.spawn(0, 0, 100, 1); zombie.skipSpawnRise(); zombie.update(0); }
    first.applyDamage(200, true, 0, -2);
    expect(first.group.getObjectByName('fallen-zombie-hat')?.visible).toBe(true);
    expect(skinnedMeshOf({ scene: second.visual.root, clips: [] }).geometry.drawRange.count).toBe(Infinity);
    second.playReplicatedHit(20, true, 0, -2);
    expect(second.group.getObjectByName('fallen-zombie-hat')?.visible).toBe(true);
    second.spawn(0, 0, 100, 1);
    second.skipSpawnRise();
    second.update(0);
    second.playReplicatedDeath('shatter', 0, -1, true);
    expect(second.group.getObjectByName('fallen-zombie-hat')?.visible).toBe(true);
    first.dispose(); second.dispose();
  });

  it('rests on furniture using the existing map collision boxes', () => {
    const source = createSkinnedWalkerSource(walker, 'helmetTrooper');
    const table = new Box3(new Vector3(-2, 0, -2), new Vector3(2, 0.7, 3));
    const zombie = new Zombie(new ZombieVisual('walker', source, 0xffffff, false), { boxes: [table] });
    zombie.spawn(0, 0, 100, 1);
    zombie.skipSpawnRise();
    zombie.update(0);
    zombie.applyDamage(10, true, 0, -2);
    for (let i = 0; i < 180; i++) zombie.update(1 / 60);
    zombie.group.updateMatrixWorld(true);
    const hat = zombie.group.getObjectByName('fallen-zombie-hat')!;
    expect(new Box3().setFromObject(hat).min.y).toBeCloseTo(0.71, 2);
    zombie.dispose();
  });

  it('deals map looks in turn across the walker reserve and leaves Brutus alone', () => {
    const brute = { scene: walker.scene.clone(), clips: [] };
    const plainSources = { walker, brute };
    expect(dressZombieSources(plainSources)).toBe(plainSources);
    expect(dressZombieSources({ walker: null, brute: null }, { skins: ['rifleman'] })).toEqual({ walker: null, brute: null });

    const dressed = dressZombieSources(plainSources, { skins: ['rifleman', 'evacuee'] });
    const walkerSlots = ZOMBIE_POOL_MODELS.flatMap((modelId, index) => (modelId === 'walker' ? [index] : []));
    expect(zombiePoolSource(dressed, walkerSlots[0])).toBe(createSkinnedWalkerSource(walker, 'rifleman'));
    expect(zombiePoolSource(dressed, walkerSlots[1])).toBe(createSkinnedWalkerSource(walker, 'evacuee'));
    expect(zombiePoolSource(dressed, walkerSlots[2])).toBe(createSkinnedWalkerSource(walker, 'rifleman'));
    expect(zombiePoolSource(dressed, ZOMBIE_POOL_MODELS.indexOf('brute'))).toBe(brute);
  });

  it('gives every model the map eye colors, skinned or not', () => {
    const eyeGlow = (source: ZombieModelSource): number => {
      const visual = new ZombieVisual('walker', source, ZOMBIE_MODELS.walker.tints[0], false);
      const glow = visual.root.getObjectByName('zombie-eye-glow') as Mesh<BufferGeometry, MeshBasicMaterial>;
      return glow.material.color.getHex();
    };
    const sources = { walker, brute: null };
    const amber = new Color(ZOMBIE_MODELS.walker.eyes.glow).getHex();
    const red = new Color(STATION33_ZOMBIE_EYES.glow).getHex();
    expect(eyeGlow(walker)).toBe(amber);

    const redOnly = dressZombieSources(sources, { eyes: STATION33_ZOMBIE_EYES });
    expect(eyeGlow(zombiePoolSource(redOnly, 0)!)).toBe(red);
    const dressedRed = dressZombieSources(sources, { skins: ['fieldOfficer'], eyes: STATION33_ZOMBIE_EYES });
    expect(eyeGlow(zombiePoolSource(dressedRed, 0)!)).toBe(red);
    // The cached skin template itself keeps the model default for other maps.
    expect(eyeGlow(createSkinnedWalkerSource(walker, 'fieldOfficer'))).toBe(amber);
  });
});

describe('Die Kathedrale clergy', async () => {
  const walker = await loadWalker();
  const plainVertices = (skinnedMeshOf(walker).geometry.index?.count ?? 0);
  const clergy = [...VESTED_SKINS];

  /** Skinned vertex positions of a dressed body, world meters; the bind pose without a clip. */
  function posed(visual: ZombieVisual, mixer: AnimationMixer, clip: AnimationClip | null, time = 0): Vector3[] {
    const mesh = visual.skinnedBody!;
    mixer.stopAllAction();
    if (clip) {
      mixer.clipAction(clip).reset().play();
      mixer.setTime(time);
    } else {
      mesh.skeleton.pose();
    }
    visual.root.updateMatrixWorld(true);
    const count = mesh.geometry.getAttribute('position').count;
    return Array.from({ length: count }, (_, vertex) => mesh.getVertexPosition(vertex, new Vector3()).applyMatrix4(mesh.matrixWorld));
  }

  /** Triangle edge lengths of vertices [from, to). */
  function edges(points: readonly Vector3[], from: number, to: number): number[] {
    const lengths: number[] = [];
    for (let vertex = from; vertex + 2 < to; vertex += 3) {
      lengths.push(points[vertex].distanceTo(points[vertex + 1]), points[vertex + 1].distanceTo(points[vertex + 2]), points[vertex + 2].distanceTo(points[vertex]));
    }
    return lengths;
  }

  /** Largest and smallest edge length ratio against the bind pose (edges under 1 cm skipped). */
  function deformation(rest: readonly number[], moved: readonly number[]): { stretch: number; squash: number } {
    let stretch = 1;
    let squash = 1;
    rest.forEach((length, index) => {
      if (length < 0.01) return;
      stretch = Math.max(stretch, moved[index] / length);
      squash = Math.min(squash, moved[index] / length);
    });
    return { stretch, squash };
  }

  for (const skinId of clergy) {
    it(`${skinId} deforms its garments no more than the walker's own body in every clip`, () => {
      const visual = new ZombieVisual('walker', createSkinnedWalkerSource(walker, skinId), 0xffffff, false);
      const mixer = new AnimationMixer(visual.root);
      const rest = posed(visual, mixer, null);
      const total = rest.length;
      const restBody = edges(rest, 0, plainVertices);
      const restCloth = edges(rest, plainVertices, total);
      for (const clip of walker.clips) {
        for (const phase of [0, 0.25, 0.5, 0.75]) {
          const moved = posed(visual, mixer, clip, clip.duration * phase);
          const body = deformation(restBody, edges(moved, 0, plainVertices));
          const cloth = deformation(restCloth, edges(moved, plainVertices, total));
          // Draped cloth opens between the legs without tearing into slivers or crumpling.
          expect(cloth.stretch, `${clip.name} ${phase}`).toBeLessThanOrEqual(Math.max(body.stretch, 2.1));
          expect(cloth.squash, `${clip.name} ${phase}`).toBeGreaterThan(0.35);
        }
      }
      visual.dispose();
    });
  }

  it('hangs long cloth from the hips between both thighs and keeps the torso free of the legs', () => {
    const mesh = skinnedMeshOf(createSkinnedWalkerSource(walker, 'condemnedMonk'));
    const bones = mesh.skeleton.bones.map((bone) => bone.name);
    const position = mesh.geometry.getAttribute('position');
    const indices = mesh.geometry.getAttribute('skinIndex');
    const weights = mesh.geometry.getAttribute('skinWeight');
    const bounds = new Box3();
    for (let vertex = 0; vertex < plainVertices; vertex++) bounds.expandByPoint(new Vector3().fromBufferAttribute(position, vertex));
    const height = bounds.max.y - bounds.min.y;
    let betweenThighs = 0;
    for (let vertex = plainVertices; vertex < position.count; vertex++) {
      const influences = new Map<string, number>();
      for (let slot = 0; slot < 4; slot++) {
        const weight = weights.getComponent(vertex, slot);
        if (weight > 0) influences.set(bones[indices.getComponent(vertex, slot)], weight);
      }
      const y = (position.getY(vertex) - bounds.min.y) / height;
      // Above the waist cloth never follows a leg.
      if (y > 0.65 && !influences.has('Head')) expect(influences.has('LeftUpLeg') || influences.has('RightUpLeg')).toBe(false);
      if ((influences.get('LeftUpLeg') ?? 0) > 0.2 && (influences.get('RightUpLeg') ?? 0) > 0.2) betweenThighs++;
    }
    expect(betweenThighs).toBeGreaterThan(20);
  });

  it('knocks only the bishop\'s mitre off on a head hit, with everything sewn onto it', () => {
    const mesh = skinnedMeshOf(createSkinnedWalkerSource(walker, 'fallenBishop'));
    const hatStart = mesh.geometry.userData.hatStart as number;
    expect(hatStart).toBeGreaterThan(plainVertices);
    const head = mesh.skeleton.bones.findIndex((bone) => bone.name === 'Head');
    const indices = mesh.geometry.getAttribute('skinIndex');
    for (let vertex = hatStart; vertex < indices.count; vertex++) expect(indices.getX(vertex)).toBe(head);
    // Hoods, veils and coifs stay on.
    for (const skinId of ['condemnedMonk', 'profanedPriest', 'undeadNun', 'cathedralGuardian'] as const) {
      expect(skinnedMeshOf(createSkinnedWalkerSource(walker, skinId)).geometry.userData.hatStart).toBeUndefined();
    }
  });

  it('snaps the front horn of the bishop\'s mitre while the back horn keeps its height', () => {
    const plain = skinnedMeshOf(walker);
    const bones = plain.skeleton.bones.map((bone) => bone.name);
    const mitreOf = (broken: boolean): { vertices: number; top: number } => {
      const geometry = buildSkinnedWalkerGeometry(plain.geometry, bones, {
        regions: {}, accessories: [{ kind: 'mitre', cloth: 0xbcae86, orphrey: 0x8f7334, broken }],
      });
      const position = geometry.getAttribute('position');
      const hatStart = geometry.userData.hatStart as number;
      let top = -Infinity;
      for (let vertex = hatStart; vertex < position.count; vertex++) top = Math.max(top, position.getY(vertex));
      return { vertices: position.count - hatStart, top };
    };
    const intact = mitreOf(false);
    const broken = mitreOf(true);
    expect(broken.vertices).toBeLessThan(intact.vertices);
    expect(broken.top).toBeCloseTo(intact.top, 4);
  });

  it('gives each of the five cathedral looks its own silhouette or palette', () => {
    const plainPosition = skinnedMeshOf(walker).geometry;
    const bodyBounds = new Box3().setFromBufferAttribute(plainPosition.getAttribute('position') as BufferAttribute);
    const height = bodyBounds.max.y - bodyBounds.min.y;
    const look = (skinId: ZombieSkinId): { top: number; covered: boolean; color: Color } => {
      const geometry = skinnedMeshOf(createSkinnedWalkerSource(walker, skinId)).geometry;
      const position = geometry.getAttribute('position');
      const color = geometry.getAttribute('color');
      let top = -Infinity;
      const mean = new Color(0, 0, 0);
      for (let vertex = plainVertices; vertex < position.count; vertex++) {
        top = Math.max(top, position.getY(vertex));
        mean.r += color.getX(vertex); mean.g += color.getY(vertex); mean.b += color.getZ(vertex);
      }
      return { top: (top - bodyBounds.min.y) / height, covered: top > bodyBounds.max.y, color: mean.multiplyScalar(1 / (position.count - plainVertices)) };
    };
    const ids = ['condemnedMonk', 'profanedPriest', 'undeadNun', 'cathedralGuardian', 'fallenBishop'] as const;
    const looks = Object.fromEntries(ids.map((id) => [id, look(id)])) as Record<(typeof ids)[number], ReturnType<typeof look>>;
    // Hood, veil, coif and mitre cover the skull; the priest goes bareheaded.
    expect(ids.filter((id) => looks[id].covered)).toEqual(['condemnedMonk', 'undeadNun', 'cathedralGuardian', 'fallenBishop']);
    // The mitre, even broken, towers over every other head.
    for (const id of ids.slice(0, -1)) expect(looks.fallenBishop.top).toBeGreaterThan(looks[id].top + 0.05);
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        const first = looks[ids[a]];
        const second = looks[ids[b]];
        const palette = Math.hypot(first.color.r - second.color.r, first.color.g - second.color.g, first.color.b - second.color.b);
        const outline = Math.abs(first.top - second.top) + Number(first.covered !== second.covered);
        expect(palette + outline, `${ids[a]} vs ${ids[b]}`).toBeGreaterThan(0.05);
      }
    }
  });

  it('frames the nun\'s face in a white wimple and marks the guardian\'s surcoat with a red cross', () => {
    const countColors = (skinId: ZombieSkinId, match: (r: number, g: number, b: number) => boolean): number => {
      const color = skinnedMeshOf(createSkinnedWalkerSource(walker, skinId)).geometry.getAttribute('color');
      let count = 0;
      for (let vertex = plainVertices; vertex < color.count; vertex++) {
        if (match(color.getX(vertex), color.getY(vertex), color.getZ(vertex))) count++;
      }
      return count;
    };
    // Vertex colors multiply the light shirt band, so pale linen stays near or above 0.4.
    const pale = (r: number, g: number, b: number): boolean => Math.min(r, g, b) > 0.4;
    const red = (r: number, g: number, b: number): boolean => r > 0.1 && r > g * 3 && r > b * 3;
    expect(countColors('undeadNun', pale)).toBeGreaterThan(100);
    expect(countColors('cathedralGuardian', red)).toBeGreaterThan(20);
    expect(countColors('condemnedMonk', pale)).toBe(0);
  });

  it('stains the clergy clothes but leaves the uniforms of other maps clean', () => {
    const shirtColors = (skinId: ZombieSkinId): number => {
      const geometry = skinnedMeshOf(createSkinnedWalkerSource(walker, skinId)).geometry;
      const colors = geometry.getAttribute('color');
      // Bands by the walker's own UVs: patterned skins retarget theirs into the garment atlas.
      const uvs = skinnedMeshOf(walker).geometry.toNonIndexed().getAttribute('uv');
      const seen = new Set<string>();
      for (let vertex = 0; vertex < plainVertices; vertex++) {
        if (walkerBandAt(uvs.getX(vertex), uvs.getY(vertex)) !== 'shirt') continue;
        seen.add(`${colors.getX(vertex).toFixed(3)},${colors.getY(vertex).toFixed(3)},${colors.getZ(vertex).toFixed(3)}`);
      }
      return seen.size;
    };
    expect(shirtColors('fieldOfficer')).toBe(1);
    expect(shirtColors('profanedPriest')).toBeGreaterThan(5);
  });

  it('dresses the Die Kathedrale horde with one weighted look per share across the walker reserve', () => {
    const dressed = dressZombieSources({ walker, brute: walker }, {
      skinShares: DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES,
      eyes: DIE_KATHEDRALE_ZOMBIE_EYES,
    });
    const looks = dressed.walker as readonly ZombieModelSource[];
    expect(looks).toHaveLength(ZOMBIE_MODEL_POOL_CAPACITIES.walker);
    expect(new Set(looks).size).toBe(DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES.length);
    // Every body is dressed; even the rarest look owns a body of the reserve.
    expect(looks.some((look) => look.scene === walker.scene)).toBe(false);
    expect(looks.filter((look) => look.scene === createSkinnedWalkerSource(walker, 'fallenBishop').scene).length).toBeGreaterThan(0);
    for (let index = 0; index < ZOMBIE_POOL_MODELS.length; index++) {
      expect(zombiePoolSource(dressed, index)!.eyes).toEqual({ glow: 0x142aff, core: 0x7a9aff });
    }
    expect(walker.eyes).toBeUndefined();
  });

  it('can still weight the plain walker in among the skins', () => {
    const dressed = dressZombieSources({ walker, brute: null }, {
      skinShares: [{ skin: null, weight: 1 }, { skin: 'undeadNun', weight: 1 }],
    });
    const looks = dressed.walker as readonly ZombieModelSource[];
    expect(looks.filter((look) => look.scene === walker.scene)).toHaveLength(ZOMBIE_MODEL_POOL_CAPACITIES.walker / 2);
  });

  it('textures the cathedral garments from the shared atlas and leaves other skins on the walker palette', () => {
    const atlas = garmentAtlasTexture();
    for (const skinId of CLERGY_SKINS) {
      const mesh = skinnedMeshOf(createSkinnedWalkerSource(walker, skinId));
      const material = mesh.material as MeshStandardMaterial;
      expect(material.map, skinId).toBe(atlas);
      expect(material.alphaTest).toBe(GARMENT_ALPHA_TEST);
      const uv = mesh.geometry.getAttribute('uv');
      const palette = new Float32Array(2);
      walkerPaletteUv(1, 1, palette, 0);
      // The body samples the palette copy; most garment texels sample a pattern.
      for (let vertex = 0; vertex < plainVertices; vertex++) {
        expect(uv.getX(vertex)).toBeLessThanOrEqual(palette[0]);
        expect(uv.getY(vertex)).toBeLessThanOrEqual(palette[1]);
      }
      let patterned = 0;
      for (let vertex = plainVertices; vertex < uv.count; vertex++) {
        if (uv.getX(vertex) > palette[0] || uv.getY(vertex) > palette[1]) patterned++;
      }
      expect(patterned / (uv.count - plainVertices), skinId).toBeGreaterThan(0.45);
    }
    const uniform = skinnedMeshOf(createSkinnedWalkerSource(walker, 'fieldOfficer')).material as MeshStandardMaterial;
    expect(uniform.map).not.toBe(atlas);
    expect(uniform.alphaTest).toBe(0);
  });

  it('spawns Die Kathedrale looks by weight without touching zombie stats', () => {
    let state = 11;
    const rng = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const sources = dressZombieSources({ walker, brute: null }, { skinShares: DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES });
    const manager = new ZombieManager(rng, sources, false);
    manager.registerColliders([]);
    const lookOf = new Map<BufferGeometry, ZombieSkinId | null>(DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES.map((share) => [
      skinnedMeshOf(share.skin ? createSkinnedWalkerSource(walker, share.skin) : walker).geometry, share.skin,
    ]));
    const counts = new Map<ZombieSkinId | null, number>();
    const spawns = 600;
    for (let i = 0; i < spawns; i++) {
      expect(manager.spawnZombie(roundConfig(1), 0, 4)).toBe(true);
      const [zombie] = manager.actives;
      expect(zombie.hp).toBe(Math.round(
        ZOMBIE_BASE_HP * roundConfig(1).healthMultiplier * ZOMBIE_TYPE_CONFIGS[zombie.typeId].healthMultiplier,
      ));
      const look = lookOf.get(zombie.visual.skinnedBody!.geometry);
      expect(look).not.toBeUndefined();
      counts.set(look!, (counts.get(look!) ?? 0) + 1);
      manager.reset();
    }
    const total = DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES.reduce((sum, share) => sum + share.weight, 0);
    for (const share of DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES) {
      expect(Math.abs((counts.get(share.skin) ?? 0) / spawns - share.weight / total), String(share.skin)).toBeLessThan(0.06);
      expect(counts.get(share.skin) ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('Die Kathedrale crypt dead', async () => {
  const walker = await loadWalker();
  const plain = skinnedMeshOf(walker);
  const plainGeometry = plain.geometry.index ? plain.geometry.toNonIndexed() : plain.geometry;
  const bodyVertices = plainGeometry.getAttribute('position').count;
  const boneNames = plain.skeleton.bones.map((bone) => bone.name);
  const bind = new Matrix4();
  const joints = plain.skeleton.boneInverses.map((inverse) => new Vector3().setFromMatrixPosition(
    bind.copy(inverse).invert().premultiply(plain.bindMatrixInverse),
  ));
  const crypt = [...CRYPT_SKINS];

  function dominantBone(geometry: BufferGeometry, vertex: number): string {
    const weights = geometry.getAttribute('skinWeight');
    const indices = geometry.getAttribute('skinIndex');
    let best = 0;
    for (let slot = 1; slot < 4; slot++) if (weights.getComponent(vertex, slot) > weights.getComponent(vertex, best)) best = slot;
    return boneNames[indices.getComponent(vertex, best)];
  }

  /** Measure radial spread around the limb's center and length along its bind-pose axis. */
  function limbExtent(geometry: BufferGeometry, bone: string, child: string): { radius: number; length: number } {
    const direction = joints[boneNames.indexOf(child)].clone().sub(joints[boneNames.indexOf(bone)]).normalize();
    const position = geometry.getAttribute('position');
    const point = new Vector3();
    const radialSum = new Vector3();
    let squaredRadius = 0;
    let samples = 0;
    let start = Infinity;
    let end = -Infinity;
    for (let vertex = 0; vertex < bodyVertices; vertex++) {
      if (dominantBone(plainGeometry, vertex) !== bone) continue;
      point.fromBufferAttribute(position, vertex);
      const along = point.dot(direction);
      point.addScaledVector(direction, -along);
      radialSum.add(point);
      squaredRadius += point.lengthSq();
      samples++;
      start = Math.min(start, along);
      end = Math.max(end, along);
    }
    const radialVariance = squaredRadius / samples - radialSum.divideScalar(samples).lengthSq();
    return { radius: Math.sqrt(radialVariance), length: end - start };
  }

  /** Linear color a body vertex shows: its vertex color times the atlas band it samples. */
  function shown(geometry: BufferGeometry, vertex: number): { band: WalkerPaletteBand; color: Color } {
    const uv = plainGeometry.getAttribute('uv');
    const band = walkerBandAt(uv.getX(vertex), uv.getY(vertex));
    const [r, g, b] = WALKER_BAND_COLORS[band];
    const tint = geometry.getAttribute('color');
    const color = new Color().setRGB(r / 255, g / 255, b / 255, 'srgb');
    return { band, color: color.multiply(new Color(tint.getX(vertex), tint.getY(vertex), tint.getZ(vertex))) };
  }

  const luminance = (color: Color): number => 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;

  for (const skinId of crypt) {
    it(`${skinId} narrows limbs while preserving their length and the skull's shape`, () => {
      const geometry = skinnedMeshOf(createSkinnedWalkerSource(walker, skinId)).geometry;
      const limbs = [['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['LeftLeg', 'LeftFoot']] as const;
      for (const [bone, child] of limbs) {
        const original = limbExtent(plainGeometry, bone, child);
        const wasted = limbExtent(geometry, bone, child);
        expect(wasted.radius / original.radius, bone).toBeLessThan(0.7);
        expect(wasted.length / original.length, bone).toBeGreaterThan(0.9);
        expect(wasted.length / original.length, bone).toBeLessThan(1.1);
      }
      const position = geometry.getAttribute('position');
      const original = plainGeometry.getAttribute('position');
      const indices = plainGeometry.getAttribute('skinIndex');
      const weights = plainGeometry.getAttribute('skinWeight');
      const head = boneNames.indexOf('Head');
      let skullVertices = 0;
      for (let vertex = 0; vertex < bodyVertices; vertex++) {
        let headWeight = 0;
        for (let slot = 0; slot < 4; slot++) {
          if (indices.getComponent(vertex, slot) === head) headWeight += weights.getComponent(vertex, slot);
        }
        // Vertices shared with the neck may move to keep the joint continuous.
        if (headWeight < 0.9999) continue;
        skullVertices++;
        for (let axis = 0; axis < 3; axis++) {
          expect(position.getComponent(vertex, axis)).toBeCloseTo(original.getComponent(vertex, axis), 5);
        }
      }
      expect(skullVertices).toBeGreaterThan(0);
    });

    it(`${skinId} shows aged yellowish-grey bone and dark empty sockets, never clean white`, () => {
      const geometry = skinnedMeshOf(createSkinnedWalkerSource(walker, skinId)).geometry;
      const bone = new Color(0, 0, 0);
      let bare = 0;
      let sockets = 0;
      for (let vertex = 0; vertex < bodyVertices; vertex++) {
        const { band, color } = shown(geometry, vertex);
        if (band === 'eyes') {
          expect(luminance(color)).toBeLessThan(0.02);
          sockets++;
        } else if (band === 'skin' && /(Hand|ForeArm)/.test(dominantBone(plainGeometry, vertex))) {
          bone.add(color);
          bare++;
          expect(luminance(color)).toBeLessThan(0.45);
        }
      }
      expect(sockets).toBeGreaterThan(0);
      expect(bare).toBeGreaterThan(50);
      bone.multiplyScalar(1 / bare);
      // Yellowed and greyed by the grave: warmer than it is blue, far from white, still readable.
      expect(bone.r).toBeGreaterThan(bone.b * 1.15);
      expect(luminance(bone)).toBeGreaterThan(0.06);
      expect(luminance(bone)).toBeLessThan(0.3);
    });
  }

  it('dresses a reserve of crypt dead apart from the horde, as large as the walker reserve, with dim sockets for eyes', () => {
    const dressed = dressZombieSources({ walker, brute: null }, {
      skinShares: DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES,
      eyes: DIE_KATHEDRALE_ZOMBIE_EYES,
      floorLook: CRYPT_ZOMBIE_LOOK,
    });
    const cryptScenes = new Set(crypt.map((skinId) => createSkinnedWalkerSource(walker, skinId).scene));
    expect(dressed.floorWalkers?.floor).toBe(CATACOMB_FLOOR);
    const reserve = dressed.floorWalkers!.looks;
    expect(reserve).toHaveLength(ZOMBIE_MODEL_POOL_CAPACITIES.walker);
    expect(reserve.every((look) => cryptScenes.has(look.scene))).toBe(true);
    expect(new Set(reserve.map((look) => look.scene)).size).toBe(crypt.length);
    expect(reserve.every((look) => look.eyes === CRYPT_ZOMBIE_LOOK.eyes)).toBe(true);
    expect(luminance(new Color(CRYPT_ZOMBIE_LOOK.eyes!.core))).toBeLessThan(0.05);
    // The horde upstairs keeps its own looks and eyes.
    const horde = dressed.walker as readonly ZombieModelSource[];
    expect(horde.some((look) => cryptScenes.has(look.scene))).toBe(false);
    expect(horde.every((look) => look.eyes === DIE_KATHEDRALE_ZOMBIE_EYES)).toBe(true);
    // Maps without a crypt build no reserve.
    expect(dressZombieSources({ walker, brute: null }, { skinShares: DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES }).floorWalkers).toBeUndefined();
  });

  it('raises the crypt dead only from crypt spawns, with the stats of any walker, even with the whole horde below', () => {
    let state = 5;
    const rng = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const sources = dressZombieSources({ walker, brute: null }, { skinShares: DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES, floorLook: CRYPT_ZOMBIE_LOOK });
    const spawns = [{ x: 0, z: -20 }, { x: 0, z: -30, floor: CATACOMB_FLOOR }];
    const manager = new ZombieManager(rng, sources, false, spawns);
    manager.registerColliders([]);
    const cryptGeometries = new Set(crypt.map((skinId) => skinnedMeshOf(createSkinnedWalkerSource(walker, skinId)).geometry));
    for (let i = 0; i < 200; i++) {
      expect(manager.spawnZombie(roundConfig(1), 0, 0, 1, i % 2 === 0 ? 0 : CATACOMB_FLOOR)).toBe(true);
      const [zombie] = manager.actives;
      expect(cryptGeometries.has(zombie.visual.skinnedBody!.geometry), `spawn ${i}`).toBe(zombie.floor === CATACOMB_FLOOR);
      expect(zombie.hp).toBe(Math.round(ZOMBIE_BASE_HP * roundConfig(1).healthMultiplier * ZOMBIE_TYPE_CONFIGS[zombie.typeId].healthMultiplier));
      manager.reset();
    }
    // A full horde below still finds a body for every spawn, and each one is a crypt dead.
    for (let i = 0; i < ZOMBIE_MODEL_POOL_CAPACITIES.walker; i++) expect(manager.spawnZombie(roundConfig(1), 0, 0, 1, CATACOMB_FLOOR)).toBe(true);
    expect([...manager.actives].every((zombie) => cryptGeometries.has(zombie.visual.skinnedBody!.geometry))).toBe(true);
    // The population cap holds: the next spawn upstairs waits for a slot like any other.
    expect(manager.spawnZombie(roundConfig(1), 0, 0, 1, 0)).toBe(false);
  });
});

describe('map skins', () => {
  it('dresses the Station 33 horde in every uniform and civilian look, none of them burnt', () => {
    const unburnt = SKIN_IDS.filter((skinId) => !(ZOMBIE_SKINS[skinId] as ZombieSkinDefinition).burns && !VESTED_SKINS.has(skinId));
    expect(new Set(STATION33_ZOMBIE_SKINS)).toEqual(new Set(unburnt));
    expect(STATION33_ZOMBIE_SKINS).toHaveLength(unburnt.length);
  });

  it('dresses the Burned Mansion horde in every burnt look, one-armed bodies included', () => {
    const burnt = SKIN_IDS.filter((skinId) => (ZOMBIE_SKINS[skinId] as ZombieSkinDefinition).burns);
    expect(new Set(MANSION_ZOMBIE_SKINS)).toEqual(new Set(burnt));
    expect(MANSION_ZOMBIE_SKINS.some((skinId) => (ZOMBIE_SKINS[skinId] as ZombieSkinDefinition).severedLimbs?.length)).toBe(true);
  });

  it('gives the Station 33 horde red eyes', () => {
    const glow = new Color(STATION33_ZOMBIE_EYES.glow);
    expect(glow.r).toBeGreaterThan(0.9);
    expect(glow.g).toBeLessThan(0.1);
  });
});
