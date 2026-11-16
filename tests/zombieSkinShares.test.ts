import { describe, expect, it } from 'vitest';
import type { Zombie } from '../src/zombies/Zombie';
import { ZombiePool } from '../src/zombies/ZombiePool';
import { ZOMBIE_MODEL_POOL_CAPACITIES } from '../src/zombies/ZombieConfig';
import { ZombieLookPicker } from '../src/zombies/ZombieLookPicker';
import type { ZombieModelSource } from '../src/zombies/ZombieVisual';
import { LA_SEU_ZOMBIE_SKIN_SHARES } from '../src/zombies/maps/LaSeuConfig';
import { apportionShares, pickShare } from '../src/zombies/skins/ZombieSkinShares';
import { MANSION_ZOMBIE_SKINS } from '../src/zombies/maps/BurnedMansionConfig';
import { STATION33_ZOMBIE_SKINS } from '../src/zombies/maps/Station33Config';

/** Deterministic LCG in [0, 1). */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function look(spawnWeight?: number): ZombieModelSource {
  return { scene: {} as ZombieModelSource['scene'], clips: [], ...(spawnWeight !== undefined && { spawnWeight }) };
}

describe('skin shares', () => {
  it('picks a share by cumulative weight', () => {
    const weights = [55, 20, 15, 7, 3];
    expect(pickShare(weights, 0)).toBe(0);
    expect(pickShare(weights, 0.5499)).toBe(0);
    expect(pickShare(weights, 0.55)).toBe(1);
    expect(pickShare(weights, 0.9)).toBe(3);
    expect(pickShare(weights, 0.97)).toBe(4);
    expect(pickShare(weights, 0.999999)).toBe(4);
  });

  it('never picks a share without weight', () => {
    expect(pickShare([0, 1, 0], 0)).toBe(1);
    expect(pickShare([0, 1, 0], 0.99)).toBe(1);
  });

  it('apportions bodies by weight and keeps at least one body per share', () => {
    const slots = apportionShares([55, 20, 15, 7, 3], 24);
    expect(slots).toHaveLength(24);
    const counts = [0, 1, 2, 3, 4].map((share) => slots.filter((slot) => slot === share).length);
    expect(counts).toEqual([13, 5, 3, 2, 1]);
    expect(apportionShares([99, 1], 2)).toEqual(expect.arrayContaining([0, 1]));
  });

  it('interleaves the apportioned bodies instead of grouping them', () => {
    const slots = apportionShares([1, 1], 6);
    for (let i = 1; i < slots.length; i++) expect(slots[i]).not.toBe(slots[i - 1]);
  });
});

describe('La Seu horde shares', () => {
  const total = LA_SEU_ZOMBIE_SKIN_SHARES.reduce((sum, share) => sum + share.weight, 0);
  const percentOf = (match: (skin: string | null) => boolean): number =>
    (LA_SEU_ZOMBIE_SKIN_SHARES.filter((share) => match(share.skin)).reduce((sum, share) => sum + share.weight, 0) / total) * 100;

  it('matches the requested appearance distribution', () => {
    expect(percentOf((skin) => skin === null)).toBeCloseTo(55);
    expect(percentOf((skin) => skin === 'penitentMonk')).toBeCloseTo(20);
    expect(percentOf((skin) => skin?.startsWith('condemnedPriest') ?? false)).toBeCloseTo(15);
    expect(percentOf((skin) => skin === 'fallenCardinal')).toBeCloseTo(7);
    expect(percentOf((skin) => skin === 'corruptedBishop')).toBeCloseTo(3);
  });

  it('dresses the priests in three chasuble colors', () => {
    const priests = LA_SEU_ZOMBIE_SKIN_SHARES.filter((share) => share.skin?.startsWith('condemnedPriest'));
    expect(priests).toHaveLength(3);
  });

  it('keeps the other maps on clothes they already wore', () => {
    for (const skins of [STATION33_ZOMBIE_SKINS, MANSION_ZOMBIE_SKINS]) {
      for (const skin of skins) {
        expect(LA_SEU_ZOMBIE_SKIN_SHARES.some((share) => share.skin === skin)).toBe(false);
      }
    }
  });
});

describe('weighted walker looks', () => {
  it('prefers a free body wearing the wanted look and falls back to any free body', () => {
    const looks = [look(3), look(1)];
    const bodies = [0, 0, 1].map((lookIndex) => ({ lookIndex, visual: { modelId: 'walker' } }) as unknown as Zombie & { lookIndex: number });
    const pool = new ZombiePool(bodies.length, (index) => bodies[index]);
    const picker = new ZombieLookPicker();
    bodies.forEach((body) => picker.register(body, looks[body.lookIndex]));

    picker.roll(0.9);
    const rare = pool.acquire('walker', picker.wearsRolledLook);
    expect(rare).toBe(bodies[2]);
    picker.roll(0.9);
    expect([bodies[0], bodies[1]]).toContain(pool.acquire('walker', picker.wearsRolledLook));
  });

  it('spawns each look as often as its weight while bodies are free', () => {
    const weights = LA_SEU_ZOMBIE_SKIN_SHARES.map((share) => share.weight);
    const looks = weights.map((weight) => look(weight));
    const slots = apportionShares(weights, ZOMBIE_MODEL_POOL_CAPACITIES.walker);
    const bodies = slots.map((slot) => ({ slot, visual: { modelId: 'walker' } }) as unknown as Zombie & { slot: number });
    const pool = new ZombiePool(bodies.length, (index) => bodies[index]);
    const picker = new ZombieLookPicker();
    bodies.forEach((body) => picker.register(body, looks[body.slot]));
    const rng = seeded(7);
    const counts = weights.map(() => 0);
    const spawns = 20000;
    for (let i = 0; i < spawns; i++) {
      // A small horde alive at once, as in the early and middle rounds.
      if (pool.activeCount >= 6) pool.releaseAll();
      picker.roll(rng());
      const body = pool.acquire('walker', picker.wearsRolledLook) as Zombie & { slot: number };
      counts[body.slot]++;
    }
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    counts.forEach((count, share) => expect(Math.abs(count / spawns - weights[share] / total)).toBeLessThan(0.015));
  });

  it('stays inactive when no look carries a spawn weight', () => {
    const picker = new ZombieLookPicker();
    const body = { visual: { modelId: 'walker' } } as unknown as Zombie;
    picker.register(body, look());
    expect(picker.weighted).toBe(false);
  });
});
