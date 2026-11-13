import { describe, expect, it } from 'vitest';
import { duelAlertLevel } from '../src/zombies/maps/station33/Station33Lighting';

const samples = (alert: 0 | 1 | 2): number[] => Array.from({ length: 2000 }, (_, index) => duelAlertLevel(alert, index * 0.01));

describe('Station 33 duel alert', () => {
  it('leaves the yard lights alone while no duel is on', () => {
    expect(samples(0).every((level) => level === 1)).toBe(true);
  });

  it('pulses the yard in Containment Protocol without ever blacking it out', () => {
    const levels = samples(1);
    expect(Math.min(...levels)).toBeGreaterThan(0.4);
    expect(Math.max(...levels)).toBeGreaterThan(1.2);
  });

  it('stutters in LAST ORDER: brief, controlled dips that never go dark', () => {
    const levels = samples(2);
    const dips = levels.filter((level) => level < 0.3).length;
    expect(dips).toBeGreaterThan(0);
    expect(dips / levels.length).toBeLessThan(0.25);
    expect(Math.min(...levels)).toBeGreaterThan(0.08);
  });

  it('is deterministic', () => {
    expect(samples(2)).toEqual(samples(2));
  });
});
