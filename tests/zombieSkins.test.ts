import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Box3, Color, SkinnedMesh, Texture, Vector3, type BufferGeometry, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { ZOMBIE_POOL_MODELS, zombiePoolSource } from '../src/zombies/ZombieManager';
import { ZombieVisual, ZOMBIE_MODELS, type ZombieModelSource } from '../src/zombies/ZombieVisual';
import { STATION33_ZOMBIE_EYES, STATION33_ZOMBIE_SKINS } from '../src/zombies/maps/Station33Config';
import { createSkinnedWalkerSource, dressZombieSources } from '../src/zombies/skins/ZombieSkinBuilder';
import { MANSION_ZOMBIE_SKINS } from '../src/zombies/maps/BurnedMansionConfig';
import { ZOMBIE_SKINS, type ZombieSkinDefinition, type ZombieSkinId } from '../src/zombies/skins/ZombieSkinCatalog';
import { walkerBandAt, walkerSkinRegion } from '../src/zombies/skins/ZombieSkinRegions';
import { Zombie } from '../src/zombies/Zombie';

const WALKER_GLB = fileURLToPath(new URL('../public/assets/zombies/zombie_walker.glb', import.meta.url));
const SKIN_IDS = Object.keys(ZOMBIE_SKINS) as ZombieSkinId[];

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
      // Hats and belts stay a small fraction of the 2116-triangle body.
      else expect(triangles - plainTriangles).toBeGreaterThan(0);
      expect(triangles - plainTriangles).toBeLessThan(400);

      const weights = geometry.getAttribute('skinWeight');
      const indices = geometry.getAttribute('skinIndex');
      for (let vertex = plainTriangles * 3; vertex < weights.count; vertex++) {
        // Accessories are rigid: all of their weight on one existing bone.
        expect(weights.getX(vertex)).toBe(1);
        expect(indices.getX(vertex)).toBeLessThan(boneCount);
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

describe('map skins', () => {
  it('dresses the Station 33 horde in every uniform and civilian look, none of them burnt', () => {
    const unburnt = SKIN_IDS.filter((skinId) => !(ZOMBIE_SKINS[skinId] as ZombieSkinDefinition).burns);
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
