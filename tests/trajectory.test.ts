import { describe, expect, it } from 'vitest';
import {
  createTrajectory,
  dropAtDistance,
  stepTrajectory,
  timeOfFlight,
} from '../src/shooting/trajectory';

const DT = 1 / 480;
const GRAVITY = 9.8;

describe('trajectory integration', () => {
  it('matches the analytic flat-fire drop at 100 m', () => {
    const velocity = 880;
    const state = createTrajectory(0, 0, 0, 0, 0, -1, velocity);
    let remaining = timeOfFlight(100, velocity);

    // Fixed steps plus a partial last step so the simulated time is exact.
    while (remaining > 0) {
      const dt = Math.min(DT, remaining);
      stepTrajectory(state, dt, GRAVITY, 0);
      remaining -= dt;
    }

    // No drag and a pure -Z shot keep vz constant → distance is exact.
    expect(state.z).toBeCloseTo(-100, 6);
    // Semi-implicit Euler stays within a few percent of the analytic solution.
    const analyticDrop = dropAtDistance(100, velocity, GRAVITY);
    expect(state.y).toBeCloseTo(-analyticDrop, 2);
  });

  it('keeps horizontal velocity constant without drag', () => {
    const state = createTrajectory(0, 0, 0, 1, 0, 0, 500);
    for (let i = 0; i < 100; i++) stepTrajectory(state, DT, GRAVITY, 0);
    expect(state.vx).toBeCloseTo(500, 6);
  });

  it('bleeds velocity with drag enabled', () => {
    const state = createTrajectory(0, 0, 0, 1, 0, 0, 500);
    for (let i = 0; i < 480; i++) stepTrajectory(state, DT, GRAVITY, 0.1);
    expect(state.vx).toBeLessThan(500 * 0.96);
    expect(state.vx).toBeGreaterThan(400);
  });

  it('is deterministic for identical inputs', () => {
    const a = createTrajectory(0, 1.7, 4, 0.1, 0, -1, 715);
    const b = createTrajectory(0, 1.7, 4, 0.1, 0, -1, 715);
    for (let i = 0; i < 240; i++) {
      stepTrajectory(a, DT, GRAVITY, 0.05);
      stepTrajectory(b, DT, GRAVITY, 0.05);
    }
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
    expect(a.travelled).toBe(b.travelled);
  });

  it('accumulated travel matches flown distance', () => {
    const state = createTrajectory(0, 0, 0, 0, 0, -1, 880);
    const seconds = 0.2;
    for (let i = 0; i < Math.round(seconds / DT); i++) stepTrajectory(state, DT, GRAVITY, 0);
    expect(state.travelled).toBeCloseTo(880 * seconds, 0);
  });
});

describe('analytic helpers', () => {
  it('drop grows with the square of distance', () => {
    const d100 = dropAtDistance(100, 880, GRAVITY);
    const d200 = dropAtDistance(200, 880, GRAVITY);
    expect(d200 / d100).toBeCloseTo(4, 6);
    expect(d100).toBeGreaterThan(0.05);
    expect(d100).toBeLessThan(0.08);
  });

  it('time of flight is linear with distance', () => {
    expect(timeOfFlight(200, 800)).toBeCloseTo(0.25, 6);
  });
});
