import { describe, expect, it } from 'vitest';
import { StanceTransition } from '../src/player/StanceTransition';

describe('stance transition', () => {
  it('is independent of frame rate and settles without overshoot', () => {
    const samples = [30, 60, 120].map((fps) => {
      const transition = new StanceTransition();
      let value = 0;
      for (let frame = 0; frame < fps / 2; frame++) {
        const next = transition.update(1, 1 / fps);
        expect(next).toBeGreaterThanOrEqual(value);
        expect(next).toBeLessThanOrEqual(1);
        value = next;
      }
      return value;
    });
    expect(samples[0]).toBeCloseTo(samples[1], 8);
    expect(samples[1]).toBeCloseTo(samples[2], 8);
    expect(samples[0]).toBeGreaterThan(0.97);
  });

  it('keeps position and velocity continuous on reversal, stays bounded, and resets immediately', () => {
    const transition = new StanceTransition();
    let before = 0;
    for (let frame = 0; frame < 10; frame++) before = transition.update(1, 1 / 60);
    const reversed = transition.update(0, 1 / 60);
    expect(Math.abs(reversed - before)).toBeLessThan(0.05);
    expect(reversed).toBeGreaterThan(before);
    for (let frame = 0; frame < 120; frame++) {
      const value = transition.update(frame < 60 ? 0 : 1, 1 / 60);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    transition.reset();
    expect(transition.update(0, 1)).toBe(0);
  });
});
