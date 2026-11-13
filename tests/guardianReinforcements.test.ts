import { describe, expect, it } from 'vitest';
import { CAPTAIN_USSR_REINFORCEMENTS as TUNING, GuardianReinforcements } from '../src/zombies/guardians/GuardianReinforcements';

const DT = 0.25;

/** Spawns over `seconds` in `phase`, `alive` zombies up besides those it called (which stay alive). */
function spawned(reinforcements: GuardianReinforcements, phase: 1 | 2 | 3, seconds: number, alive = 0, calm = true): number {
  let total = 0;
  for (let time = 0; time < seconds; time += DT) total += reinforcements.update(DT, phase, alive + total, calm);
  return total;
}

describe('Guardian reinforcements', () => {
  it('calls no one in phase one', () => {
    expect(spawned(new GuardianReinforcements(TUNING, false), 1, 60)).toBe(0);
  });

  it('sends a first group shortly after a new phase, then one at each interval', () => {
    const reinforcements = new GuardianReinforcements(TUNING, false);
    const [, second] = TUNING.phases;
    expect(spawned(reinforcements, 2, TUNING.firstDelay - DT)).toBe(0);
    let calls = 0;
    for (let time = 0; time < 2 * DT; time += DT) calls += reinforcements.update(DT, 2, 0, true);
    expect(calls).toBe(second.size);
    expect(spawned(reinforcements, 2, second.every - 2 * DT)).toBe(0);
  });

  it('never calls past the phase cap on zombies alive, and does not bank the groups it skipped', () => {
    const reinforcements = new GuardianReinforcements(TUNING, false);
    const [, , third] = TUNING.phases;
    expect(spawned(reinforcements, 3, 120)).toBe(third.cap);
    const crowded = new GuardianReinforcements(TUNING, false);
    expect(spawned(crowded, 3, 60, third.cap)).toBe(0);
    // Room again: one group only, however long it waited.
    expect(crowded.update(DT, 3, third.cap - 4, true)).toBe(third.size);
    expect(crowded.update(DT, 3, third.cap - 4, true)).toBe(0);
  });

  it('holds a group while the guardian is mid-attack', () => {
    const reinforcements = new GuardianReinforcements(TUNING, false);
    expect(spawned(reinforcements, 3, 30, 0, false)).toBe(0);
    expect(reinforcements.update(DT, 3, 0, true)).toBe(TUNING.phases[2].size);
  });

  it('keeps a lower cap on reduced-effects devices', () => {
    const reinforcements = new GuardianReinforcements(TUNING, true);
    expect(spawned(reinforcements, 3, 120)).toBe(TUNING.reducedCap);
  });
});
