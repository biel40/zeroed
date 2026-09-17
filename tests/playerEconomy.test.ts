import { describe, expect, it } from 'vitest';
import {
  PlayerEconomy,
  POINTS_HIT,
  POINTS_KNIFE_KILL,
  POINTS_KILL,
} from '../src/game/PlayerEconomy';
import { HEADSHOT_POINTS } from '../src/game/CombatConfig';

/**
 * Centralized Points economy (CoD Zombies style). All rewards route through
 * PlayerEconomy so there is exactly one place that mutates the balance.
 * Rewards:
 *  - non-lethal body hit: +10
 *  - normal kill:         +50
 *  - every headshot:      +150  (replaces other rewards for that hit)
 *  - knife kill:          +200  (replaces the normal kill reward)
 */
describe('PlayerEconomy points', () => {
  it('starts at zero', () => {
    expect(new PlayerEconomy().points).toBe(0);
  });

  it('pins the reward values', () => {
    expect(POINTS_HIT).toBe(10);
    expect(POINTS_KILL).toBe(50);
    expect(HEADSHOT_POINTS).toBe(150);
    expect(POINTS_KNIFE_KILL).toBe(200);
  });

  it('awards +10 for a non-lethal hit', () => {
    const eco = new PlayerEconomy();
    eco.awardHit();
    expect(eco.points).toBe(10);
  });

  it('awards +50 for a normal kill', () => {
    const eco = new PlayerEconomy();
    eco.awardKill(false);
    expect(eco.points).toBe(50);
  });

  it('awards +150 for a non-lethal headshot instead of the body-hit reward', () => {
    const eco = new PlayerEconomy();
    eco.awardHit(true);
    expect(eco.points).toBe(150);
  });

  it('awards +150 for a lethal headshot instead of the normal kill reward', () => {
    const eco = new PlayerEconomy();
    eco.awardKill(true);
    expect(eco.points).toBe(150);
  });

  it('awards more for a knife kill than for a headshot', () => {
    const eco = new PlayerEconomy();
    eco.awardKnifeKill();
    expect(eco.points).toBe(POINTS_KNIFE_KILL);
    expect(eco.points).toBeGreaterThan(HEADSHOT_POINTS);
  });

  it('a lethal hit does not also pay the +10 hit reward', () => {
    // The kill path is exclusive: the caller awards EITHER a hit (survived)
    // OR a kill (died), never both for one bullet. This test pins the totals
    // for a realistic sequence: one wound, then the finishing headshot.
    const eco = new PlayerEconomy();
    eco.awardHit(); // zombie survives the body shot
    eco.awardKill(true); // finishing headshot
    expect(eco.points).toBe(10 + 150);
  });

  it('accumulates across many events', () => {
    const eco = new PlayerEconomy();
    eco.awardHit();
    eco.awardHit();
    eco.awardKill(false);
    eco.awardKill(true);
    expect(eco.points).toBe(10 + 10 + 50 + 150);
  });
});

describe('PlayerEconomy spending (Mystery Box)', () => {
  it('allows unlimited spending without changing the balance', () => {
    const eco = new PlayerEconomy();
    eco.awardKill(false);
    eco.setUnlimitedSpending(true);

    expect(eco.canAfford(5000)).toBe(true);
    expect(eco.spend(5000)).toBe(true);
    expect(eco.points).toBe(50);
  });

  it('reset disables unlimited spending', () => {
    const eco = new PlayerEconomy();
    eco.setUnlimitedSpending(true);
    eco.reset();

    expect(eco.canAfford(1)).toBe(false);
  });

  it('canAfford / spend: deducts exactly when the balance covers the cost', () => {
    const eco = new PlayerEconomy();
    for (let i = 0; i < 19; i++) eco.awardKill(false); // 19 * 50 = 950
    expect(eco.points).toBe(950);
    expect(eco.canAfford(950)).toBe(true);
    expect(eco.spend(950)).toBe(true);
    expect(eco.points).toBe(0);
  });

  it('refuses to spend more than the balance and leaves it untouched', () => {
    const eco = new PlayerEconomy();
    eco.awardKill(false); // 50
    expect(eco.canAfford(950)).toBe(false);
    expect(eco.spend(950)).toBe(false);
    expect(eco.points).toBe(50); // unchanged
  });

  it('spend is atomic: a failed spend never partially deducts', () => {
    const eco = new PlayerEconomy();
    for (let i = 0; i < 18; i++) eco.awardKill(false); // 900
    expect(eco.spend(950)).toBe(false);
    expect(eco.points).toBe(900);
  });

  it('reset returns the balance to zero (zombies restart)', () => {
    const eco = new PlayerEconomy();
    eco.awardKill(true);
    eco.reset();
    expect(eco.points).toBe(0);
  });
});
