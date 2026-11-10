import { describe, expect, it } from 'vitest';
import { EVACUATION_ENDING_TIMELINE as BEAT } from '../src/zombies/evacuation/EvacuationEndingTimeline';
import { PROTOCOL33_BLAZE, PROTOCOL33_SURFACE } from '../src/zombies/maps/Station33Config';
import {
  blazeGlow,
  blazeIgnition,
  blazeLevel,
  type EscapeBlazeConfig,
} from '../src/zombies/maps/station33/EscapeBlaze';

const CONFIG: EscapeBlazeConfig = {
  from: 2,
  spreadSpeed: 10,
  catchSeconds: 1,
  flareDecay: 0.5,
  sources: [
    { x: 0, z: 0, base: 0, radius: 2.5, height: 6, flare: 2 },
    { x: 30, z: 40, base: 0, radius: 1, height: 3, flare: 0 },
    { x: 0, z: -20, base: 0, radius: 3, height: 4, flare: 0.5 },
  ],
};

describe('Station 33 escape blaze', () => {
  it('starts at the first source on its beat and reaches the others as the front spreads', () => {
    expect(blazeIgnition(CONFIG.sources[0], CONFIG)).toBe(2);
    expect(blazeIgnition(CONFIG.sources[1], CONFIG)).toBeCloseTo(2 + 50 / 10, 9);
    expect(blazeIgnition(CONFIG.sources[2], CONFIG)).toBeCloseTo(2 + 20 / 10, 9);
  });

  it('stays dark until a source catches, bursts on its flare and settles to a steady burn', () => {
    const [stairhead, quiet] = CONFIG.sources;
    expect(blazeLevel(1.99, stairhead, CONFIG)).toBe(0);
    expect(blazeLevel(2 + 0.05, stairhead, CONFIG)).toBeGreaterThan(1.5);
    expect(blazeLevel(2 + 6, stairhead, CONFIG)).toBeCloseTo(1, 3);
    const catching = blazeIgnition(quiet, CONFIG);
    expect(blazeLevel(catching - 0.01, quiet, CONFIG)).toBe(0);
    expect(blazeLevel(catching + 0.5, quiet, CONFIG)).toBeGreaterThan(0);
    expect(blazeLevel(catching + 0.5, quiet, CONFIG)).toBeLessThan(1);
    expect(blazeLevel(catching + 1, quiet, CONFIG)).toBe(1);
  });

  it('glows in proportion to how much of the blaze burns, never past full', () => {
    expect(blazeGlow(0, CONFIG)).toBe(0);
    const early = blazeGlow(2.5, CONFIG);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(1);
    expect(blazeGlow(30, CONFIG)).toBe(1);
    for (let time = 0; time < 30; time += 0.1) expect(blazeGlow(time, CONFIG)).toBeLessThanOrEqual(1);
  });

  it('sets Station 33 alight at the stairhead, mid-escape, and spreads over the station before the title', () => {
    const [stairhead] = PROTOCOL33_BLAZE.sources;
    const { kiosk } = PROTOCOL33_SURFACE;
    expect(PROTOCOL33_BLAZE.from).toBe(BEAT.blaze);
    expect(stairhead.x).toBeGreaterThanOrEqual(kiosk.minX);
    expect(stairhead.x).toBeLessThanOrEqual(kiosk.maxX);
    expect(stairhead.z).toBeGreaterThanOrEqual(kiosk.minZ);
    expect(stairhead.z).toBeLessThanOrEqual(kiosk.maxZ);
    for (const source of PROTOCOL33_BLAZE.sources) {
      expect(blazeIgnition(source, PROTOCOL33_BLAZE)).toBeLessThan(BEAT.title);
    }
    expect(blazeGlow(BEAT.title, PROTOCOL33_BLAZE)).toBeGreaterThan(0.9);
  });
});
