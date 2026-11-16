import { describe, expect, it } from 'vitest';
import { CandleIgnition } from '../src/zombies/maps/dieKathedrale/CandleIgnition';
import type { DieKathedraleLightSite, DieKathedraleZoneId } from '../src/zombies/maps/DieKathedraleConfig';

const PERMANENT: DieKathedraleLightSite = {
  id: 'moon', x: 0, y: 4, z: 0, color: 0xffffff, intensity: 6, distance: 10, flicker: false,
};

function candle(initiallyLit = false): DieKathedraleLightSite {
  return {
    ...PERMANENT, id: 'candle', x: 3, y: 20, z: 4, flicker: true,
    ignition: { radius: 5, seconds: 2, initiallyLit, zones: ['nave', 'westAisle'] },
  };
}

const OPEN = new Set<DieKathedraleZoneId>(['nave']);
const CLOSED = new Set<DieKathedraleZoneId>(['narthex']);
const NEAR = { x: 3, z: 4 };
const FAR = { x: 30, z: 40 };

describe('CandleIgnition', () => {
  it('keeps permanent lights and initially burning candles fully lit', () => {
    const ignition = new CandleIgnition([PERMANENT, candle(true), candle()]);
    expect(ignition.getLevel(0)).toBe(1);
    expect(ignition.getLevel(1)).toBe(1);
    expect(ignition.getLevel(2)).toBe(0);
    ignition.update(10, FAR, CLOSED);
    expect(ignition.getLevel(0)).toBe(1);
    expect(ignition.getLevel(1)).toBe(1);
    expect(ignition.getLevel(2)).toBe(0);
  });

  it('ignites at the exact horizontal radius regardless of the candle height', () => {
    const ignition = new CandleIgnition([candle()]);
    ignition.update(0.5, { x: 0, z: 0 }, OPEN);
    expect(ignition.getLevel(0)).toBeCloseTo(0.25);
  });

  it('leaves candles outside the radius dark', () => {
    const ignition = new CandleIgnition([candle()]);
    ignition.update(10, { x: -0.01, z: 0 }, OPEN);
    expect(ignition.getLevel(0)).toBe(0);
  });

  it('waits for any adjoining zone to be open before igniting', () => {
    const ignition = new CandleIgnition([candle()]);
    ignition.update(10, NEAR, CLOSED);
    expect(ignition.getLevel(0)).toBe(0);
    ignition.update(0.5, NEAR, new Set<DieKathedraleZoneId>(['westAisle']));
    expect(ignition.getLevel(0)).toBeCloseTo(0.25);
  });

  it('fades in smoothly and caps at full brightness', () => {
    const ignition = new CandleIgnition([candle()]);
    ignition.update(0.5, NEAR, OPEN);
    expect(ignition.getLevel(0)).toBeCloseTo(0.25);
    ignition.update(0.5, NEAR, OPEN);
    expect(ignition.getLevel(0)).toBeCloseTo(0.5);
    ignition.update(10, NEAR, OPEN);
    expect(ignition.getLevel(0)).toBe(1);
  });

  it('finishes igniting after leaving and stays lit on returning', () => {
    const ignition = new CandleIgnition([candle()]);
    ignition.update(0.5, NEAR, OPEN);
    ignition.update(0.5, FAR, CLOSED);
    expect(ignition.getLevel(0)).toBeCloseTo(0.5);
    ignition.update(10, FAR, CLOSED);
    expect(ignition.getLevel(0)).toBe(1);
    ignition.update(0.1, NEAR, OPEN);
    expect(ignition.getLevel(0)).toBe(1);
  });

  it.each([0, -1])('does not discover or advance candles when dt is %s', (dt) => {
    const ignition = new CandleIgnition([candle()]);
    ignition.update(dt, NEAR, OPEN);
    ignition.update(1, FAR, OPEN);
    expect(ignition.getLevel(0)).toBe(0);
    ignition.update(0.5, NEAR, OPEN);
    ignition.update(dt, NEAR, OPEN);
    expect(ignition.getLevel(0)).toBeCloseTo(0.25);
  });

  it('restores the exact initial state and forgets candles being ignited on reset', () => {
    const ignition = new CandleIgnition([PERMANENT, candle(true), candle()]);
    ignition.update(0.5, NEAR, OPEN);
    ignition.reset();
    expect(ignition.getLevel(0)).toBe(1);
    expect(ignition.getLevel(1)).toBe(1);
    expect(ignition.getLevel(2)).toBe(0);
    ignition.update(10, FAR, OPEN);
    expect(ignition.getLevel(2)).toBe(0);
  });
});
