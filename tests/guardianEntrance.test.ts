import { describe, expect, it } from 'vitest';
import { GuardianEntrance, type GuardianEntranceBeats } from '../src/zombies/guardians/GuardianEntrance';

const BEATS: GuardianEntranceBeats = { roarAt: 1.5, leapAt: 3, duration: 6 };
const DT = 0.25;

interface Fired {
  roar: number[];
  leap: number[];
  finished: number[];
}

/** Steps `seconds`, noting the time of every cue. */
function run(entrance: GuardianEntrance, seconds: number): Fired {
  const fired: Fired = { roar: [], leap: [], finished: [] };
  for (let step = 0; step < Math.round(seconds / DT); step++) {
    entrance.update(DT);
    if (entrance.due.roar) fired.roar.push(entrance.time);
    if (entrance.due.leap) fired.leap.push(entrance.time);
    if (entrance.due.finished) fired.finished.push(entrance.time);
  }
  return fired;
}

describe('Guardian entrance', () => {
  it('does nothing until started', () => {
    const entrance = new GuardianEntrance(BEATS);
    expect(entrance.playing).toBe(false);
    expect(run(entrance, 10)).toEqual({ roar: [], leap: [], finished: [] });
  });

  it('roars, leaps and hands back once each, in order, on their beats', () => {
    const entrance = new GuardianEntrance(BEATS);
    entrance.start();
    expect(entrance.playing).toBe(true);
    const fired = run(entrance, 10);
    expect(fired).toEqual({ roar: [1.5], leap: [3], finished: [6] });
    expect(entrance.playing).toBe(false);
  });

  it('starts over after a reset', () => {
    const entrance = new GuardianEntrance(BEATS);
    entrance.start();
    run(entrance, 2);
    entrance.reset();
    expect(entrance.playing).toBe(false);
    expect(entrance.time).toBe(0);
    entrance.start();
    expect(run(entrance, 10).roar).toEqual([1.5]);
  });

  it('rejects beats outside the entrance', () => {
    expect(() => new GuardianEntrance({ roarAt: 0, leapAt: 3, duration: 6 })).toThrow();
    expect(() => new GuardianEntrance({ roarAt: 1, leapAt: 6, duration: 6 })).toThrow();
  });
});
