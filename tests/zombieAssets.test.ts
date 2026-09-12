import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Box3, SkinnedMesh, Texture, Vector3, type AnimationClip } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { ZOMBIE_MANIFEST } from '../src/assets/AssetManager';
import { ZOMBIE_TYPE_CONFIGS, type ZombieModelId } from '../src/zombies/ZombieConfig';
import { resolveClip, ZombieVisual, ZOMBIE_MODELS } from '../src/zombies/ZombieVisual';
import type { ZombieState } from '../src/zombies/Zombie';

const GLB_DIR = fileURLToPath(new URL('../public/assets/zombies', import.meta.url));
const GLB_FILES: Record<ZombieModelId, string> = {
  walker: 'zombie_walker.glb',
  brute: 'zombie_brute.glb',
};

/** Reads metadata straight from the GLB JSON chunk. */
function gltfJson(path: string): {
  animations?: Array<{ name?: string }>;
  nodes?: Array<{ name?: string }>;
  materials?: Array<{ name?: string }>;
  meshes?: Array<{ primitives?: unknown[] }>;
  skins?: unknown[];
} {
  const buffer = readFileSync(path);
  expect(buffer.subarray(0, 4).toString('ascii')).toBe('glTF');
  const jsonLength = buffer.readUInt32LE(12);
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8'));
}

describe('resolveClip', () => {
  const clips = [
    { name: 'Zombie|ZombieWalk' },
    { name: 'CharacterArmature|Death' },
    { name: 'Idle' },
  ] as unknown as AnimationClip[];

  it('matches exact names and pipe-suffixed names, case-insensitive', () => {
    expect(resolveClip(clips, ['zombiewalk'])?.name).toBe('Zombie|ZombieWalk');
    expect(resolveClip(clips, ['Death'])?.name).toBe('CharacterArmature|Death');
    expect(resolveClip(clips, ['idle'])?.name).toBe('Idle');
  });

  it('honors candidate priority and returns null when nothing matches', () => {
    expect(resolveClip(clips, ['Missing', 'Idle'])?.name).toBe('Idle');
    expect(resolveClip(clips, ['Missing', 'AlsoMissing'])).toBeNull();
  });
});

describe('zombie GLB assets', () => {
  // The state machine needs at least these states animated per variant.
  const REQUIRED: ZombieState[] = ['spawn', 'walk', 'attack'];

  for (const modelId of Object.keys(GLB_FILES) as ZombieModelId[]) {
    it(`${modelId} ships clips for ${REQUIRED.join('/')}`, () => {
      const json = gltfJson(`${GLB_DIR}/${GLB_FILES[modelId]}`);
      const names = (json.animations ?? []).map((animation) => animation.name ?? '');
      expect(names.length).toBeGreaterThan(0);
      const clips = names.map((name) => ({ name }) as unknown as AnimationClip);
      for (const state of REQUIRED) {
        const clip = resolveClip(clips, ZOMBIE_MODELS[modelId].clips[state]);
        expect(clip, `${modelId} missing a "${state}" clip (has: ${names.join(', ')})`).not.toBeNull();
      }
    });
  }

  it('ships a purpose-built Brute hierarchy instead of walker geometry', () => {
    const json = gltfJson(`${GLB_DIR}/${GLB_FILES.brute}`);
    const nodes = new Set((json.nodes ?? []).map((node) => node.name));
    expect(nodes).toContain('BruteBelly');
    expect(nodes).toContain('BruteSpinePlate');
    expect(nodes).toContain('BruteBackMass');
    expect(nodes).toContain('BruteNeck');
    expect(nodes).toContain('BruteFistL');
    expect(nodes).toContain('BruteFistR');
    expect(nodes).toContain('BruteTempleScar');
    expect(nodes).toContain('BruteTrapL');
    expect(nodes).toContain('BruteKnuckleR3');
  });

  it('ships the original textured low-poly walker selected as the visual reference', () => {
    const json = gltfJson(`${GLB_DIR}/${GLB_FILES.walker}`);
    const nodes = new Set((json.nodes ?? []).map((node) => node.name));
    const materials = new Set((json.materials ?? []).map((material) => material.name));
    expect(nodes).toContain('Zombie_Cylinder');
    expect(nodes).toContain('Head');
    expect(nodes).toContain('LeftForeArm');
    expect(materials).toEqual(new Set(['Material']));
    expect(json.skins).toHaveLength(1);
    expect(json.meshes).toHaveLength(1);
    expect(json.meshes?.[0].primitives).toHaveLength(1);
  });

  it('loads the walker as one articulated body through the production GLTF loader', async () => {
    const buffer = readFileSync(`${GLB_DIR}/${GLB_FILES.walker}`);
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const loader = new GLTFLoader().register(() => ({ name: 'headless-texture', loadTexture: async () => new Texture() }));
    const gltf = await loader.parseAsync(data, '');
    const skinnedParts: SkinnedMesh[] = [];
    gltf.scene.traverse((object) => {
      if (object instanceof SkinnedMesh) skinnedParts.push(object);
    });
    expect(gltf.scene.getObjectByName('Zombie_Cylinder')).toBeDefined();
    expect(skinnedParts).toHaveLength(1);
    expect(skinnedParts[0].skeleton.bones.map((bone) => bone.name)).toContain('Head');
    expect((skinnedParts[0].geometry.index?.count ?? 0) / 3).toBe(2116);
    expect(buffer.byteLength).toBeLessThan(700_000);
  });

  it('loads the Brute binary through the production GLTF loader', async () => {
    const buffer = readFileSync(`${GLB_DIR}/${GLB_FILES.brute}`);
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const gltf = await new Promise<{ scene: { getObjectByName(name: string): unknown }; animations: AnimationClip[] }>(
      (resolve, reject) => new GLTFLoader().parse(data, '', resolve, reject),
    );
    expect(gltf.scene.getObjectByName('BruteBelly')).toBeTruthy();
    expect(gltf.animations.map((clip) => clip.name)).toEqual([
      'BruteRise', 'BruteWalk', 'BruteSmash', 'BruteHit', 'BruteDeath',
    ]);
  });

  it('normalizes and animates the restored walker without losing its rig or freezing when stationary', async () => {
    const buffer = readFileSync(`${GLB_DIR}/${GLB_FILES.walker}`);
    const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const loader = new GLTFLoader().register(() => ({ name: 'headless-texture', loadTexture: async () => new Texture() }));
    const gltf = await loader.parseAsync(data, '');
    const visual = new ZombieVisual('walker', { scene: gltf.scene, clips: gltf.animations }, ZOMBIE_MODELS.walker.tints[0], false);
    visual.root.updateMatrixWorld(true);
    expect(new Box3().setFromObject(visual.root).getSize(new Vector3()).y).toBeCloseTo(1.78, 2);
    expect(ZOMBIE_MODELS.walker.walkReferenceSpeed).toBe(1.35);
    const foot = visual.root.getObjectByName('LeftFoot')!;
    const initialPose = foot.quaternion.clone();
    visual.setState('walk');
    visual.update(0.5, ZOMBIE_MODELS.walker.walkReferenceSpeed);
    expect(foot.quaternion.equals(initialPose)).toBe(false);
    const pausedPose = foot.quaternion.clone();
    visual.update(0.5, 0);
    expect(foot.quaternion.equals(pausedPose)).toBe(false);
    expect(resolveClip(gltf.animations, ZOMBIE_MODELS.walker.clips.attack)?.duration).toBeGreaterThan(5);
    visual.setZombieType('shiny');
    visual.update(0.3, ZOMBIE_MODELS.walker.walkReferenceSpeed);
    visual.root.updateMatrixWorld(true);
    const stars = visual.root.getObjectByName('shiny-stars')!.getWorldPosition(new Vector3());
    const torso = visual.torsoAnchor.getWorldPosition(new Vector3());
    expect(stars.x).toBeCloseTo(torso.x, 5);
    expect(stars.z).toBeCloseTo(torso.z, 5);
  });
});

describe('type/model contract', () => {
  it('maps gameplay types to independently pooled model assets', () => {
    expect(Object.keys(ZOMBIE_MODELS)).toEqual(['walker', 'brute']);
    expect(ZOMBIE_MANIFEST.map((entry) => entry.id)).toEqual(['walker', 'brute']);
    expect(ZOMBIE_TYPE_CONFIGS.normal.modelId).toBe('walker');
    expect(ZOMBIE_TYPE_CONFIGS.shiny.modelId).toBe('walker');
    expect(ZOMBIE_TYPE_CONFIGS.brute.modelId).toBe('brute');
  });
});
