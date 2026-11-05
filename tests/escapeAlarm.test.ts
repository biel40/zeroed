import { describe, expect, it } from 'vitest';
import { ESCAPE_ALARM, EscapeAlarm, type EscapeAlarmTuning } from '../src/zombies/evacuation/EscapeAlarm';

const TUNING: EscapeAlarmTuning = { sirenEvery: 8, announceEvery: 15, klaxonFrom: 20, klaxonInterval: { slowest: 1.2, fastest: 0.4 } };
const DT = 0.1;

interface Tally {
  sirens: number;
  announcements: number;
  klaxons: number;
}

/** Runs the escape clock down from `from` for `seconds`, counting each cue. */
function run(alarm: EscapeAlarm, from: number, seconds: number, tally: Tally = { sirens: 0, announcements: 0, klaxons: 0 }): Tally {
  const steps = Math.round(seconds / DT);
  for (let step = 0; step < steps; step++) {
    alarm.update(DT, from - step * DT);
    if (alarm.due.siren) tally.sirens++;
    if (alarm.due.announcement) tally.announcements++;
    if (alarm.due.klaxon) tally.klaxons++;
  }
  return tally;
}

describe('Escape alarm', () => {
  it('stays silent until started and after stopping', () => {
    const alarm = new EscapeAlarm(TUNING);
    expect(run(alarm, 60, 30)).toEqual({ sirens: 0, announcements: 0, klaxons: 0 });
    alarm.start();
    alarm.stop();
    expect(alarm.isRunning).toBe(false);
    expect(run(alarm, 60, 30)).toEqual({ sirens: 0, announcements: 0, klaxons: 0 });
  });

  it('opens with the siren and the intercom at once, then repeats each on its own beat', () => {
    const alarm = new EscapeAlarm(TUNING);
    alarm.start();
    alarm.update(DT, 60);
    expect(alarm.due).toEqual({ siren: true, announcement: true, klaxon: false });
    alarm.update(DT, 60 - DT);
    expect(alarm.due).toEqual({ siren: false, announcement: false, klaxon: false });
    // 0.2 s already run; up to 40 s: sirens at 0, 8, 16, 24, 32 and intercoms at 0, 15, 30.
    const tally = run(alarm, 60 - 2 * DT, 40 - 2 * DT, { sirens: 1, announcements: 1, klaxons: 0 });
    expect(tally.sirens).toBe(5);
    expect(tally.announcements).toBe(3);
    expect(tally.klaxons).toBe(0);
  });

  it('sounds the klaxon only in the last stretch, faster and faster towards zero', () => {
    const alarm = new EscapeAlarm(TUNING);
    alarm.start();
    run(alarm, 60, 40);
    const firstHalf = run(alarm, 20, 10).klaxons;
    const secondHalf = run(alarm, 10, 10).klaxons;
    expect(firstHalf).toBeGreaterThan(0);
    expect(secondHalf).toBeGreaterThan(firstHalf);
    expect(alarm.klaxonInterval(TUNING.klaxonFrom)).toBeCloseTo(TUNING.klaxonInterval.slowest, 6);
    expect(alarm.klaxonInterval(0)).toBeCloseTo(TUNING.klaxonInterval.fastest, 6);
    alarm.update(DT, 0);
    expect(alarm.due.klaxon).toBe(false);
  });

  it('starts over on a new escape and goes quiet on reset', () => {
    const alarm = new EscapeAlarm(ESCAPE_ALARM);
    alarm.start();
    run(alarm, 60, 5);
    alarm.reset();
    expect(alarm.isRunning).toBe(false);
    alarm.update(DT, 60);
    expect(alarm.due.siren).toBe(false);
    alarm.start();
    alarm.update(DT, 60);
    expect(alarm.due.siren).toBe(true);
  });
});
