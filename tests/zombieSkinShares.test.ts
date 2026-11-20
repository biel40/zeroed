import { describe, expect, it } from 'vitest';
import type { Zombie } from '../src/zombies/Zombie';
import { ZombiePool } from '../src/zombies/ZombiePool';
import { ZOMBIE_MODEL_POOL_CAPACITIES } from '../src/zombies/ZombieConfig';
import { ZombieLookPicker } from '../src/zombies/ZombieLookPicker';
import type { ZombieModelSource } from '../src/zombies/ZombieVisual';
import { DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES } from '../src/zombies/maps/DieKathedraleConfig';
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

describe('Die Kathedrale horde shares', () => {
  const total = DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES.reduce((sum, share) => sum + share.weight, 0);
  const percentOf = (match: (skin: string | null) => boolean): number =>
    (DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES.filter((share) => match(share.skin)).reduce((sum, share) => sum + share.weight, 0) / total) * 100;

  it('dresses every walker in one of the eleven cathedral looks, the bishop rarest', () => {
    const looks = [
      'condemnedMonk', 'profanedPriest', 'undeadNun', 'cathedralGuardian', 'fallenBishop',
      'cathedralCanon', 'cantor', 'dominicanFriar', 'pilgrim', 'cathedralCustodian', 'abbess',
    ];
    // No plain walker share: the whole horde wears the cathedral's clothes.
    expect(new Set(DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES.map((share) => share.skin))).toEqual(new Set(looks));
    expect(DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES).toHaveLength(looks.length);
    for (const look of looks.filter((id) => id !== 'fallenBishop')) {
      expect(percentOf((skin) => skin === 'fallenBishop')).toBeLessThan(percentOf((skin) => skin === look));
    }
    // No single look dominates the horde.
    for (const look of looks) expect(percentOf((skin) => skin === look)).toBeLessThan(15);
  });

  it('keeps a body of the walker reserve for every look, so each one can spawn', () => {
    const slots = apportionShares(DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES.map((share) => share.weight), ZOMBIE_MODEL_POOL_CAPACITIES.walker);
    DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES.forEach((share, index) => expect(slots.includes(index), String(share.skin)).toBe(true));
  });

  it('keeps the other maps on clothes they already wore', () => {
    for (const skins of [STATION33_ZOMBIE_SKINS, MANSION_ZOMBIE_SKINS]) {
      for (const skin of skins) {
        expect(DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES.some((share) => share.skin === skin)).toBe(false);
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
    const weights = DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES.map((share) => share.weight);
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
    expect(picker.active).toBe(false);
  });
});

describe('floor-bound walker looks', () => {
  const CRYPT = -1;
  type Body = Zombie & { readonly tag: string };
  const body = (tag: string, modelId: 'walker' | 'brute' = 'walker'): Body => ({ tag, visual: { modelId } }) as unknown as Body;

  function crypt(): { pool: ZombiePool; picker: ZombieLookPicker; bodies: Body[] } {
    const horde = [look(2), look(1)];
    const dead = [look(3), look(1)];
    const bodies = [body('horde-a'), body('horde-b'), body('brute', 'brute'), body('crypt-a'), body('crypt-b')];
    const picker = new ZombieLookPicker();
    picker.register(bodies[0], horde[0]);
    picker.register(bodies[1], horde[1]);
    picker.register(bodies[2], null);
    picker.register(bodies[3], dead[0], CRYPT);
    picker.register(bodies[4], dead[1], CRYPT);
    return { pool: new ZombiePool(bodies.length, (index) => bodies[index]), picker, bodies };
  }

  it('dresses a walker by the floor it rises on, never borrowing a body of the other reserve', () => {
    const { pool, picker } = crypt();
    const acquire = (floor: number, roll: number): Body | null => {
      picker.roll(roll, 'walker', floor);
      return pool.acquire('walker', picker.wearsRolledLook, picker.risesOnRolledFloor) as Body | null;
    };
    expect(acquire(CRYPT, 0.1)?.tag).toBe('crypt-a');
    expect(acquire(0, 0.1)?.tag).toBe('horde-a');
    expect(acquire(CRYPT, 0.1)?.tag).toBe('crypt-b');
    // The crypt reserve is spent: a crypt spawn finds no body rather than a horde one.
    expect(acquire(CRYPT, 0.1)).toBeNull();
    expect(acquire(0, 0.1)?.tag).toBe('horde-b');
    expect(acquire(0, 0.1)).toBeNull();
  });

  it('rolls the floor\'s own looks by weight', () => {
    const { pool, picker } = crypt();
    picker.roll(0.9, 'walker', CRYPT);
    expect((pool.acquire('walker', picker.wearsRolledLook, picker.risesOnRolledFloor) as Body).tag).toBe('crypt-b');
  });

  it('leaves models without a floor reserve to their usual bodies on every floor', () => {
    const { pool, picker } = crypt();
    picker.roll(0.5, 'brute', CRYPT);
    expect((pool.acquire('brute', picker.wearsRolledLook, picker.risesOnRolledFloor) as Body).tag).toBe('brute');
  });

  it('is active with a floor reserve even when no look is weighted', () => {
    const picker = new ZombieLookPicker();
    picker.register(body('crypt'), look(), CRYPT);
    expect(picker.active).toBe(true);
  });
});
