import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AnimationMixer, Box3, Color, SkinnedMesh, Texture, Vector3,
  type AnimationClip, type BufferGeometry, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { ZOMBIE_BASE_HP, ZOMBIE_MODEL_POOL_CAPACITIES, ZOMBIE_TYPE_CONFIGS, roundConfig } from '../src/zombies/ZombieConfig';
import { ZOMBIE_POOL_MODELS, ZombieManager, zombiePoolSource } from '../src/zombies/ZombieManager';
import { ZombieVisual, ZOMBIE_MODELS, type ZombieModelSource } from '../src/zombies/ZombieVisual';
import { STATION33_ZOMBIE_EYES, STATION33_ZOMBIE_SKINS } from '../src/zombies/maps/Station33Config';
import { createSkinnedWalkerSource, dressZombieSources } from '../src/zombies/skins/ZombieSkinBuilder';
import { MANSION_ZOMBIE_SKINS } from '../src/zombies/maps/BurnedMansionConfig';
import { LA_SEU_ZOMBIE_SKIN_SHARES } from '../src/zombies/maps/LaSeuConfig';
import { ZOMBIE_SKINS, type ZombieSkinDefinition, type ZombieSkinId } from '../src/zombies/skins/ZombieSkinCatalog';
import { walkerBandAt, walkerSkinRegion } from '../src/zombies/skins/ZombieSkinRegions';
import { Zombie } from '../src/zombies/Zombie';

const WALKER_GLB = fileURLToPath(new URL('../public/assets/zombies/zombie_walker.glb', import.meta.url));
const SKIN_IDS = Object.keys(ZOMBIE_SKINS) as ZombieSkinId[];
/** The La Seu clergy, dressed in long draped vestments. */
const CLERGY_SKINS: ReadonlySet<ZombieSkinId> = new Set(
  LA_SEU_ZOMBIE_SKIN_SHARES.flatMap((share) => (share.skin ? [share.skin] : [])),
);

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
      expect(triangles - plainTriangles).toBeLessThan(CLERGY_SKINS.has(skinId) ? 1300 : 400);

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
        if (!CLERGY_SKINS.has(skinId)) expect(weights.getX(vertex)).toBe(1);
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

describe('La Seu clergy', async () => {
  const walker = await loadWalker();
  const plainVertices = (skinnedMeshOf(walker).geometry.index?.count ?? 0);
  const clergy = [...CLERGY_SKINS];

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
    const mesh = skinnedMeshOf(createSkinnedWalkerSource(walker, 'penitentMonk'));
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

  it('knocks the mitre and the biretta off on a head hit, with everything sewn onto them', () => {
    for (const skinId of ['corruptedBishop', 'fallenCardinal'] as const) {
      const mesh = skinnedMeshOf(createSkinnedWalkerSource(walker, skinId));
      const hatStart = mesh.geometry.userData.hatStart as number;
      expect(hatStart).toBeGreaterThan(plainVertices);
      const head = mesh.skeleton.bones.findIndex((bone) => bone.name === 'Head');
      const indices = mesh.geometry.getAttribute('skinIndex');
      for (let vertex = hatStart; vertex < indices.count; vertex++) expect(indices.getX(vertex)).toBe(head);
    }
    // Monks and priests have nothing to lose: the cowl stays on.
    for (const skinId of ['penitentMonk', 'condemnedPriestGreen'] as const) {
      expect(skinnedMeshOf(createSkinnedWalkerSource(walker, skinId)).geometry.userData.hatStart).toBeUndefined();
    }
  });

  it('gives each clergy rank its own silhouette and palette', () => {
    const silhouette = (skinId: ZombieSkinId): { top: number; color: Color } => {
      const geometry = skinnedMeshOf(createSkinnedWalkerSource(walker, skinId)).geometry;
      const position = geometry.getAttribute('position');
      const color = geometry.getAttribute('color');
      let top = -Infinity;
      const mean = new Color(0, 0, 0);
      for (let vertex = plainVertices; vertex < position.count; vertex++) {
        top = Math.max(top, position.getY(vertex));
        mean.r += color.getX(vertex); mean.g += color.getY(vertex); mean.b += color.getZ(vertex);
      }
      return { top, color: mean.multiplyScalar(1 / (position.count - plainVertices)) };
    };
    const bishop = silhouette('corruptedBishop');
    const ranks = (['fallenCardinal', 'penitentMonk', 'condemnedPriestGreen'] as const).map(silhouette);
    // The mitre towers over every other head.
    for (const rank of ranks) expect(bishop.top).toBeGreaterThan(rank.top);
    const looks = [bishop, ...ranks];
    for (let a = 0; a < looks.length; a++) {
      for (let b = a + 1; b < looks.length; b++) {
        const { r, g, bl } = { r: looks[a].color.r - looks[b].color.r, g: looks[a].color.g - looks[b].color.g, bl: looks[a].color.b - looks[b].color.b };
        expect(Math.hypot(r, g, bl), `${a} vs ${b}`).toBeGreaterThan(0.05);
      }
    }
  });

  it('stains the clergy clothes but leaves the uniforms of other maps clean', () => {
    const shirtColors = (skinId: ZombieSkinId): number => {
      const geometry = skinnedMeshOf(createSkinnedWalkerSource(walker, skinId)).geometry;
      const colors = geometry.getAttribute('color');
      const uvs = geometry.getAttribute('uv');
      const seen = new Set<string>();
      for (let vertex = 0; vertex < plainVertices; vertex++) {
        if (walkerBandAt(uvs.getX(vertex), uvs.getY(vertex)) !== 'shirt') continue;
        seen.add(`${colors.getX(vertex).toFixed(3)},${colors.getY(vertex).toFixed(3)},${colors.getZ(vertex).toFixed(3)}`);
      }
      return seen.size;
    };
    expect(shirtColors('fieldOfficer')).toBe(1);
    expect(shirtColors('condemnedPriestViolet')).toBeGreaterThan(5);
  });

  it('dresses the La Seu horde with one weighted look per share across the walker reserve', () => {
    const dressed = dressZombieSources({ walker, brute: null }, { skinShares: LA_SEU_ZOMBIE_SKIN_SHARES });
    const looks = dressed.walker as readonly ZombieModelSource[];
    expect(looks).toHaveLength(ZOMBIE_MODEL_POOL_CAPACITIES.walker);
    expect(new Set(looks).size).toBe(LA_SEU_ZOMBIE_SKIN_SHARES.length);
    const civilians = looks.find((look) => look.spawnWeight === 55)!;
    expect(civilians.scene).toBe(walker.scene);
    expect(looks.filter((look) => look.scene === createSkinnedWalkerSource(walker, 'corruptedBishop').scene)).toHaveLength(1);
  });

  it('spawns La Seu looks by weight without touching zombie stats', () => {
    let state = 11;
    const rng = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    const sources = dressZombieSources({ walker, brute: null }, { skinShares: LA_SEU_ZOMBIE_SKIN_SHARES });
    const manager = new ZombieManager(rng, sources, false);
    manager.registerColliders([]);
    const lookOf = new Map<BufferGeometry, ZombieSkinId | null>(LA_SEU_ZOMBIE_SKIN_SHARES.map((share) => [
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
    const total = LA_SEU_ZOMBIE_SKIN_SHARES.reduce((sum, share) => sum + share.weight, 0);
    for (const share of LA_SEU_ZOMBIE_SKIN_SHARES) {
      expect(Math.abs((counts.get(share.skin) ?? 0) / spawns - share.weight / total), String(share.skin)).toBeLessThan(0.06);
      expect(counts.get(share.skin) ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('map skins', () => {
  it('dresses the Station 33 horde in every uniform and civilian look, none of them burnt', () => {
    const unburnt = SKIN_IDS.filter((skinId) => !(ZOMBIE_SKINS[skinId] as ZombieSkinDefinition).burns && !CLERGY_SKINS.has(skinId));
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
