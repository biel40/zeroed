import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AnimationClip } from 'three';
import { describe, expect, it } from 'vitest';
import { resolveClip, ZOMBIE_VARIANTS, type ZombieVariantId } from '../src/zombies/ZombieVisual';
import type { ZombieState } from '../src/zombies/Zombie';

const GLB_DIR = fileURLToPath(new URL('../public/assets/zombies', import.meta.url));
const GLB_FILES: Record<ZombieVariantId, string> = {
  walker: 'zombie_walker.glb',
  hulk: 'zombie_hulk.glb',
};

/** Reads animation clip names straight from the GLB JSON chunk. */
function clipNames(path: string): string[] {
  const buffer = readFileSync(path);
  expect(buffer.subarray(0, 4).toString('ascii')).toBe('glTF');
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8')) as {
    animations?: Array<{ name?: string }>;
  };
  return (json.animations ?? []).map((a) => a.name ?? '');
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

  for (const variant of Object.keys(GLB_FILES) as ZombieVariantId[]) {
    it(`${variant} ships clips for ${REQUIRED.join('/')}`, () => {
      const names = clipNames(`${GLB_DIR}/${GLB_FILES[variant]}`);
      expect(names.length).toBeGreaterThan(0);
      const clips = names.map((name) => ({ name }) as unknown as AnimationClip);
      for (const state of REQUIRED) {
        const clip = resolveClip(clips, ZOMBIE_VARIANTS[variant].clips[state]);
        expect(clip, `${variant} missing a "${state}" clip (has: ${names.join(', ')})`).not.toBeNull();
      }
    });
  }
});
