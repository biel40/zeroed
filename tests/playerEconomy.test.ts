import { describe, expect, it } from 'vitest';
import {
  PlayerEconomy,
  POINTS_HEADSHOT_KILL,
  POINTS_HIT,
  POINTS_KILL,
} from '../src/game/PlayerEconomy';

/**
 * Centralized Points economy (CoD Zombies style). All rewards route through
 * PlayerEconomy so there is exactly one place that mutates the balance.
 * Rewards:
 *  - non-lethal hit:      +10
 *  - normal kill:         +50
 *  - lethal headshot:     +100  (replaces the kill reward, never stacked)
 */
describe('PlayerEconomy points', () => {
  it('starts at zero', () => {
    expect(new PlayerEconomy().points).toBe(0);
  });

  it('pins the reward values', () => {
    expect(POINTS_HIT).toBe(10);
    expect(POINTS_KILL).toBe(50);
    expect(POINTS_HEADSHOT_KILL).toBe(100);
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

  it('awards +100 for a lethal headshot INSTEAD of the normal kill reward', () => {
    const eco = new PlayerEconomy();
    eco.awardKill(true);
    // 100 total, not 100 + 50: a headshot kill never double-dips.
    expect(eco.points).toBe(100);
  });

  it('a lethal hit does not also pay the +10 hit reward', () => {
    // The kill path is exclusive: the caller awards EITHER a hit (survived)
    // OR a kill (died), never both for one bullet. This test pins the totals
    // for a realistic sequence: one wound, then the finishing headshot.
    const eco = new PlayerEconomy();
    eco.awardHit(); // zombie survives the body shot
    eco.awardKill(true); // finishing headshot
    expect(eco.points).toBe(10 + 100);
  });

  it('accumulates across many events', () => {
    const eco = new PlayerEconomy();
    eco.awardHit();
    eco.awardHit();
    eco.awardKill(false);
    eco.awardKill(true);
    expect(eco.points).toBe(10 + 10 + 50 + 100);
  });
});

describe('PlayerEconomy spending (Mystery Box)', () => {
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
