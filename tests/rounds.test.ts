import { describe, expect, it } from 'vitest';
import { HEADSHOT_DAMAGE_MULTIPLIER } from '../src/game/CombatConfig';
import {
  computeDamage,
  earlyRoundSpeedMultiplier,
  getBruteSpawnChance,
  MAX_ALIVE,
  MAX_ACTIVE_BRUTES,
  ROUND_BREAK_SECONDS,
  roundConfig,
  selectZombieType,
  SHINY_ZOMBIE_CHANCE,
  splashDamageAt,
  ZOMBIE_BASE_HP,
} from '../src/zombies/ZombieConfig';

describe('roundConfig', () => {
  it('gives the player six seconds to recover between rounds', () => {
    expect(ROUND_BREAK_SECONDS).toBe(6);
  });

  it('round 1 is a gentle introduction', () => {
    const config = roundConfig(1);
    expect(config.zombieCount).toBe(6);
    expect(config.healthMultiplier).toBe(1);
    expect(config.speedMultiplier).toBe(1);
    expect(config.spawnInterval).toBeCloseTo(2.1);
  });

  it('grows the zombie count monotonically', () => {
    let previous = 0;
    for (let round = 1; round <= 30; round++) {
      const count = roundConfig(round).zombieCount;
      expect(count).toBeGreaterThan(previous);
      previous = count;
    }
  });

  it('matches the intended pacing landmarks', () => {
    expect(roundConfig(5).zombieCount).toBeGreaterThanOrEqual(15);
    expect(roundConfig(10).zombieCount).toBeGreaterThanOrEqual(35);
  });

  it('always caps simultaneous zombies at MAX_ALIVE', () => {
    for (const round of [1, 5, 10, 50, 200]) {
      expect(roundConfig(round).maxAlive).toBe(MAX_ALIVE);
    }
    expect(MAX_ALIVE).toBe(24);
  });

  it('shrinks the spawn interval but never below the floor', () => {
    expect(roundConfig(3).spawnInterval).toBeLessThan(roundConfig(1).spawnInterval);
    expect(roundConfig(100).spawnInterval).toBe(0.35);
  });

  it('scales health on a saturating curve with a hard asymptote', () => {
    const r10 = roundConfig(10).healthMultiplier;
    const r30 = roundConfig(30).healthMultiplier;
    const r500 = roundConfig(500).healthMultiplier;
    expect(r10).toBeGreaterThan(1.5);
    expect(r10).toBeLessThan(3);
    // Late rounds: still below 4x — no absurd bullet sponges.
    expect(r30).toBeLessThan(4);
    expect(r500).toBeLessThanOrEqual(4);
    // A round-30 zombie is far from invincible.
    expect(roundConfig(30).healthMultiplier * ZOMBIE_BASE_HP).toBeLessThan(400);
  });

  it('increases speed progressively and caps it at a fair late-round limit', () => {
    expect(roundConfig(5).speedMultiplier).toBeCloseTo(1.2);
    expect(roundConfig(10).speedMultiplier).toBeCloseTo(1.45);
    expect(roundConfig(100).speedMultiplier).toBe(1.8);
  });

  it('applies only the requested early-round speed ramp', () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(earlyRoundSpeedMultiplier)).toEqual([
      0.65, 0.72, 0.8, 0.88, 0.95, 1, 1,
    ]);
  });

  it('clamps invalid round numbers to round 1', () => {
    expect(roundConfig(0)).toEqual(roundConfig(1));
    expect(roundConfig(-5)).toEqual(roundConfig(1));
  });
});

describe('computeDamage', () => {
  it('applies base damage to the torso', () => {
    expect(computeDamage(34, 'torso')).toBe(34);
  });

  it('applies the shared 3x multiplier to every headshot', () => {
    expect(HEADSHOT_DAMAGE_MULTIPLIER).toBe(3);
    expect(computeDamage(34, 'head')).toBe(102);
    expect(computeDamage(150, 'head')).toBe(450);
  });
});

describe('zombie type selection', () => {
  it('uses the configured Brute chance bands', () => {
    expect(getBruteSpawnChance(1)).toBe(0);
    expect(getBruteSpawnChance(4)).toBe(0);
    expect(getBruteSpawnChance(5)).toBe(0.08);
    expect(getBruteSpawnChance(10)).toBe(0.15);
    expect(getBruteSpawnChance(15)).toBe(0.22);
    expect(getBruteSpawnChance(20)).toBe(0.3);
  });

  it('never selects a Brute before round 5', () => {
    for (let round = 1; round <= 4; round++) {
      expect(selectZombieType(round, {}, () => 0)).toBe('shiny');
    }
  });

  it('rolls Brute first and never combines it with Shiny', () => {
    let calls = 0;
    const result = selectZombieType(20, {}, () => {
      calls++;
      return 0;
    });
    expect(result).toBe('brute');
    expect(calls).toBe(1);
  });

  it('falls through to an independent fixed Shiny roll', () => {
    const values = [0.9, SHINY_ZOMBIE_CHANCE - 0.0001];
    expect(selectZombieType(50, {}, () => values.shift()!)).toBe('shiny');
    expect(SHINY_ZOMBIE_CHANCE).toBe(0.005);
  });

  it('enforces the strict active Brute cap before rolling rarity', () => {
    expect(MAX_ACTIVE_BRUTES).toBe(2);
    expect(selectZombieType(50, { brute: MAX_ACTIVE_BRUTES }, () => 0.5)).toBe('normal');
  });
});

describe('splashDamageAt', () => {
  it('deals full damage at the epicenter', () => {
    expect(splashDamageAt(100, 0, 2.5)).toBe(100);
  });

  it('falls off linearly with distance', () => {
    expect(splashDamageAt(100, 1.25, 2.5)).toBeCloseTo(50);
  });

  it('deals no damage at or beyond the radius', () => {
    expect(splashDamageAt(100, 2.5, 2.5)).toBe(0);
    expect(splashDamageAt(100, 5, 2.5)).toBe(0);
  });
});
