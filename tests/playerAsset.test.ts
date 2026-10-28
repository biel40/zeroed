import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findClip, REMOTE_SOLDIER_MODEL_URL, type ClipRole } from '../src/rendering/RemotePlayerAvatar';
import { createRemoteAvatar, type RemoteAvatarMotion } from '../src/rendering/RemotePlayerAvatar';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

interface GltfJson {
  readonly animations?: ReadonlyArray<{ readonly name?: string }>;
  readonly skins?: ReadonlyArray<{ readonly joints: readonly number[] }>;
  readonly nodes?: ReadonlyArray<{ readonly name?: string }>;
  readonly meshes?: readonly unknown[];
}

const path = `public/${REMOTE_SOLDIER_MODEL_URL}`;

/** Reads only the JSON chunk of a binary glTF; enough to verify names without a WebGL loader. */
function readGlbJson(file: string): GltfJson {
  const bytes = readFileSync(file);
  expect(bytes.readUInt32LE(0)).toBe(0x46546c67); // 'glTF'
  const jsonLength = bytes.readUInt32LE(12);
  expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a); // 'JSON'
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as GltfJson;
}

describe.skipIf(!existsSync(path))('remote soldier asset contract', () => {
  it('animates the real skeleton through low postures and restores standing without accumulated transforms', async () => {
    // Keep geometry, skin and clips; omit textures so this deterministic test needs no browser image decoder.
    const bytes = readFileSync(path);
    const jsonLength = bytes.readUInt32LE(12);
    const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8')) as { materials: unknown[] };
    json.materials = json.materials.map(() => ({}));
    const text = JSON.stringify(json);
    const chunk = Buffer.from(text.padEnd(Math.ceil(Buffer.byteLength(text) / 4) * 4, ' '));
    const header = Buffer.alloc(20);
    bytes.copy(header, 0, 0, 20);
    header.writeUInt32LE(20 + chunk.length + bytes.length - 20 - jsonLength, 8);
    header.writeUInt32LE(chunk.length, 12);
    const glb = Buffer.concat([header, chunk, bytes.subarray(20 + jsonLength)]);
    const loaded = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), '');
    const sourceTracks = loaded.animations.flatMap((clip) => clip.tracks.map((track) => Array.from(track.values)));
    const avatar = createRemoteAvatar({ scene: loaded.scene, clips: loaded.animations }, false);
    expect(avatar.isSkinned).toBe(true);
    expect(loaded.animations.flatMap((clip) => clip.tracks.map((track) => Array.from(track.values)))).toEqual(sourceTracks);
    const motion: RemoteAvatarMotion = { speed: 0, forwardSpeed: 0, pitch: 0,
      aiming: false, reloading: false, alive: true, life: 'alive', reviving: false, stance: 'standing' };
    const settle = (): number => {
      for (let i = 0; i < 120; i++) avatar.update(1 / 60, motion);
      avatar.group.updateMatrixWorld(true);
      return avatar.group.getObjectByName('Head')!.getWorldPosition(new THREE.Vector3()).y;
    };
    const standingY = settle();
    motion.stance = 'crouched';
    avatar.update(1 / 60, motion);
    avatar.group.updateMatrixWorld(true);
    expect(standingY - avatar.group.getObjectByName('Head')!.getWorldPosition(new THREE.Vector3()).y).toBeLessThan(0.02);
    expect(settle()).toBeLessThan(standingY - 0.35);
    motion.stance = 'prone';
    expect(settle()).toBeLessThan(0.65);
    const rifle = avatar.group.getObjectByName('teammate-rifle')!;
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rifle.getWorldQuaternion(new THREE.Quaternion()));
    expect(Math.abs(forward.y)).toBeLessThan(0.1);
    expect(forward.z).toBeLessThan(-0.9);
    motion.stance = 'standing';
    expect(settle()).toBeCloseTo(standingY, 2);
    motion.life = 'downed';
    settle();
    motion.life = 'alive';
    expect(settle()).toBeCloseTo(standingY, 2);
    avatar.dispose();
  });
  it('is a skinned humanoid with the required locomotion clips', () => {
    const gltf = readGlbJson(path);
    const clips = (gltf.animations ?? []).map((animation, index) => ({ name: animation.name ?? `clip${index}` }));
    const joints = (gltf.skins ?? []).flatMap((skin) => skin.joints.map((joint) => gltf.nodes?.[joint]?.name ?? ''));
    const roles: ClipRole[] = ['idle', 'walk', 'run', 'aim', 'fire', 'reload', 'death'];
    const resolved = Object.fromEntries(roles.map((role) => [role, findClip(clips, role)?.name ?? null]));
    expect(gltf.skins?.length ?? 0).toBeGreaterThan(0);
    expect(joints.some((name) => /head/i.test(name))).toBe(true);
    expect(joints.some((name) => /spine|chest|torso|abdomen/i.test(name))).toBe(true);
    expect(resolved.idle).not.toBeNull();
    expect(resolved.walk).not.toBeNull();
    for (const name of ['CrouchIdle', 'CrouchWalk', 'ProneIdle', 'ProneCrawl']) {
      expect(clips.some((clip) => clip.name === name)).toBe(true);
    }
  });
});
