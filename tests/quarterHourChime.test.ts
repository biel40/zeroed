import { describe, expect, it } from 'vitest';
import { QuarterHourChime } from '../src/zombies/maps/dieKathedrale/upper/QuarterHourChime';

function localTime(hour: number, minute: number): number {
  return new Date(2026, 0, 15, hour, minute).getTime();
}

describe('QuarterHourChime', () => {
  it.each([[10, 0], [10, 15], [10, 30], [10, 45], [0, 0]])('rings once as local time reaches %i:%i', (hour, minute) => {
    const chime = new QuarterHourChime();
    const boundary = localTime(hour, minute);

    expect(chime.update(boundary - 1)).toBe(false);
    expect(chime.update(boundary)).toBe(true);
    expect(chime.update(boundary + 16)).toBe(false);
  });

  it('stays silent at other minutes', () => {
    const chime = new QuarterHourChime();
    const boundary = localTime(10, 16);

    expect(chime.update(boundary - 16)).toBe(false);
    expect(chime.update(boundary + 16)).toBe(false);
  });

  it('skips quarters missed while away or before the first frame', () => {
    const chime = new QuarterHourChime();

    expect(chime.update(localTime(10, 15))).toBe(false);
    expect(chime.update(localTime(10, 30) - 1)).toBe(false);
    expect(chime.update(localTime(10, 30) + 5000)).toBe(false);
    expect(chime.update(localTime(10, 45) - 16)).toBe(false);
    expect(chime.update(localTime(10, 45) + 16)).toBe(true);
  });

  it('avoids a second strike if the clock briefly moves back across the same minute', () => {
    const chime = new QuarterHourChime();
    const boundary = localTime(10, 15);

    expect(chime.update(boundary - 16)).toBe(false);
    expect(chime.update(boundary + 16)).toBe(true);
    expect(chime.update(boundary - 16)).toBe(false);
    expect(chime.update(boundary + 16)).toBe(false);
  });

  it('establishes a fresh baseline after a restart', () => {
    const chime = new QuarterHourChime();
    const boundary = localTime(10, 15);

    expect(chime.update(boundary - 16)).toBe(false);
    chime.reset();
    expect(chime.update(boundary)).toBe(false);
  });
});
