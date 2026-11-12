import { describe, expect, it } from 'vitest';
import { FRAME_HISTORY_SIZE, FramePerformance } from '../src/core/FramePerformance';

describe('frame performance measurements', () => {
  it('waits for a real-time sample window and measures steady cadence', () => {
    const performance = new FramePerformance();
    for (let frame = 0; frame < 14; frame++) expect(performance.sample(1 / 60)).toBe(false);
    expect(performance.sample(1 / 60)).toBe(true);
    expect(performance.fps).toBeCloseTo(60);
    expect(performance.averageMs).toBeCloseTo(1000 / 60);
    expect(performance.p95Ms).toBeCloseTo(1000 / 60);
    expect(performance.peakMs).toBeCloseTo(1000 / 60);
    expect(performance.status).toBe('good');
    for (let frame = 0; frame < 14; frame++) expect(performance.sample(1 / 60)).toBe(false);
    expect(performance.sample(1 / 60)).toBe(true);
  });

  it('uses frames divided by elapsed time, retaining stalls beyond the simulation clamp', () => {
    const performance = new FramePerformance();
    for (let frame = 0; frame < 9; frame++) performance.sample(0.01);
    expect(performance.sample(0.5)).toBe(true);
    expect(performance.fps).toBeCloseTo(10 / 0.59);
    expect(performance.averageMs).toBeCloseTo(59);
    expect(performance.p95Ms).toBe(500);
    expect(performance.peakMs).toBe(500);
    expect(performance.status).toBe('critical');
  });

  it('computes nearest-rank p95 separately from the slowest frame', () => {
    const performance = new FramePerformance();
    for (let frame = 0; frame < 19; frame++) performance.sample(0.02);
    performance.sample(0.25);
    expect(performance.p95Ms).toBe(20);
    expect(performance.peakMs).toBe(250);
    expect(performance.frameMsAt(0)).toBe(20);
    expect(performance.frameMsAt(19)).toBe(250);
  });

  it('keeps history ordered and expires old stalls without unbounded storage', () => {
    const performance = new FramePerformance();
    performance.sample(0.5);
    for (let frame = 0; frame < FRAME_HISTORY_SIZE; frame++) performance.sample(0.025);
    expect(performance.frameCount).toBe(FRAME_HISTORY_SIZE);
    expect(performance.fps).toBeCloseTo(40);
    expect(performance.peakMs).toBeCloseTo(25);
    expect(performance.status).toBe('warning');
    performance.sample(0.03);
    expect(performance.frameMsAt(0)).toBe(25);
    expect(performance.frameMsAt(FRAME_HISTORY_SIZE - 1)).toBe(30);
  });

  it('discards history and partial refresh windows on reset', () => {
    const performance = new FramePerformance();
    performance.sample(0.5);
    performance.reset();
    expect(performance.frameCount).toBe(0);
    expect(performance.fps).toBe(0);
    expect(performance.p95Ms).toBe(0);
    expect(performance.peakMs).toBe(0);
    for (let frame = 0; frame < 14; frame++) expect(performance.sample(1 / 60)).toBe(false);
    expect(performance.sample(1 / 60)).toBe(true);
    expect(performance.peakMs).toBeCloseTo(1000 / 60);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('ignores invalid frame intervals (%s)', (dt) => {
    const performance = new FramePerformance();
    expect(performance.sample(dt)).toBe(false);
    expect(performance.frameCount).toBe(0);
    expect(performance.sample(0.25)).toBe(true);
    expect(performance.fps).toBe(4);
  });
});
