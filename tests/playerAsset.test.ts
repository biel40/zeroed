import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findClip, REMOTE_SOLDIER_MODEL_URL, type ClipRole } from '../src/rendering/RemotePlayerAvatar';

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
  });
});
