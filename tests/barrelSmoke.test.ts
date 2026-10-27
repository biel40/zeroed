import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { BarrelSmoke } from '../src/rendering/BarrelSmoke';
import type { Effects } from '../src/rendering/Effects';

interface Puff {
  readonly point: THREE.Vector3;
  readonly size: number;
  readonly lifetime?: number;
}

function recordingEffects(puffs: Puff[]): Effects {
  return {
    puff: (point: THREE.Vector3, _tint: number, size: number, lifetime?: number) => {
      puffs.push({ point: point.clone(), size, lifetime });
    },
  } as unknown as Effects;
}

const MUZZLE = new THREE.Vector3(0, 1.5, -1);
const RIGHT = new THREE.Vector3(1, 0, 0);

describe('Muzzle smoke', () => {
  it('leaves a single standard puff for ordinary weapons', () => {
    const puffs: Puff[] = [];
    new BarrelSmoke(recordingEffects(puffs)).onShot(MUZZLE, 0, RIGHT, WEAPON_DEFINITIONS.m4a1.muzzleSmoke);
    expect(puffs).toHaveLength(1);
  });

  it('vents the Barrett brake clouds to both sides, clear of the sight line, and lets them linger', () => {
    const smoke = WEAPON_DEFINITIONS.barrett.muzzleSmoke!;
    const puffs: Puff[] = [];
    new BarrelSmoke(recordingEffects(puffs)).onShot(MUZZLE, 0, RIGHT, smoke);
    expect(puffs).toHaveLength(1 + smoke.puffs);
    const vented = puffs.slice(1);
    expect(vented.some((puff) => puff.point.x > 0.25)).toBe(true);
    expect(vented.some((puff) => puff.point.x < -0.25)).toBe(true);
    expect(vented.every((puff) => Math.abs(puff.point.x) > 0.25)).toBe(true);
    expect(vented.every((puff) => puff.lifetime === smoke.life)).toBe(true);
    expect(puffs[0].size).toBeGreaterThan(0.26);
  });
});
