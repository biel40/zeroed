import { describe, expect, it } from 'vitest';
import { getZombieMapWavePacing, ZOMBIE_MAPS, type ZombieMapId } from '../src/config/zombieMaps';
import { STATION33_WAVE_PACING } from '../src/zombies/maps/Station33Config';
import { RoundManager } from '../src/zombies/RoundManager';
import { MAX_ALIVE, roundConfig, ZOMBIE_LATE_ROUND_START } from '../src/zombies/ZombieConfig';

const DT = 1 / 60;

/**
 * Seconds from the start of `round` at which each spawn is due while nobody
 * kills anything, up to the alive cap (the rest wait for kills).
 */
function spawnTimes(manager: RoundManager, round: number): number[] {
  const expected = Math.min(roundConfig(round).zombieCount, MAX_ALIVE);
  let time = 0;
  let started = -1;
  const times: number[] = [];
  for (let frame = 0; frame < 60 * 60 * 20; frame++) {
    const alive = started < 0 ? 0 : times.length;
    manager.update(DT, alive);
    time += DT;
    for (const event of manager.pendingEvents) {
      if (event.type === 'roundStarted' && event.round === round) started = time;
      if (event.type === 'spawnDue' && event.round === round) times.push(time - started);
    }
    manager.clearEvents();
    if (times.length === expected) return times;
  }
  throw new Error(`round ${round} never finished spawning`);
}

describe('Station 33 wave pacing', () => {
  it('starts at the mid-game round with spawns 8% closer together', () => {
    expect(STATION33_WAVE_PACING).toEqual({ fromRound: ZOMBIE_LATE_ROUND_START, spawnIntervalScale: 0.92 });
  });

  it('keeps rounds before the mid-game exactly as they were', () => {
    for (let round = 1; round < ZOMBIE_LATE_ROUND_START; round++) {
      expect(roundConfig(round, STATION33_WAVE_PACING)).toEqual(roundConfig(round));
    }
  });

  it('shortens only the spawn interval from the mid-game on: counts, cap and stats are untouched', () => {
    for (const round of [ZOMBIE_LATE_ROUND_START, 8, 12, 20, 40]) {
      const paced = roundConfig(round, STATION33_WAVE_PACING);
      const base = roundConfig(round);
      expect(paced.spawnInterval).toBeCloseTo(base.spawnInterval * 0.92, 10);
      expect({ ...paced, spawnInterval: 0 }).toEqual({ ...base, spawnInterval: 0 });
    }
  });

  it('is declared by Station 33 alone', () => {
    for (const id of Object.keys(ZOMBIE_MAPS) as ZombieMapId[]) {
      expect(getZombieMapWavePacing(id), id).toBe(id === 'station-33' ? STATION33_WAVE_PACING : undefined);
    }
  });

  it('keeps the early waves on their old cadence', () => {
    const paced = spawnTimes(new RoundManager(1, 0, STATION33_WAVE_PACING), 3);
    const base = spawnTimes(new RoundManager(1, 0), 3);
    expect(paced).toEqual(base);
  });

  it('brings mid-game spawns in sooner, with room under the alive cap for the change to show', () => {
    const round = ZOMBIE_LATE_ROUND_START + 1;
    const paced = spawnTimes(new RoundManager(1, 0, STATION33_WAVE_PACING), round);
    const base = spawnTimes(new RoundManager(1, 0), round);
    // Even with no kills at all, the first MAX_ALIVE spawns never wait on the cap.
    expect(roundConfig(round).zombieCount).toBeGreaterThan(MAX_ALIVE);
    const interval = roundConfig(round).spawnInterval;
    for (let spawn = 1; spawn < MAX_ALIVE; spawn++) {
      expect(base[spawn] - base[spawn - 1]).toBeCloseTo(interval, 1);
      expect(paced[spawn] - paced[spawn - 1]).toBeCloseTo(interval * 0.92, 1);
    }
    expect(paced[MAX_ALIVE - 1]).toBeLessThan(base[MAX_ALIVE - 1] * 0.93);
  });
});
