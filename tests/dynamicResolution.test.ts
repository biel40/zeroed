import { describe, expect, it } from 'vitest';
import { DynamicResolution, MIN_RESOLUTION_SCALE } from '../src/core/DynamicResolution';

/** Feeds `seconds` of frames at `fps`; returns how many times the scale changed. */
function run(resolution: DynamicResolution, fps: number, seconds: number): number {
  let changes = 0;
  const frames = Math.round(fps * seconds);
  for (let i = 0; i < frames; i++) if (resolution.sample(1 / fps)) changes++;
  return changes;
}

describe('Dynamic resolution', () => {
  it('keeps full resolution while the game holds 60 fps', () => {
    const resolution = new DynamicResolution();
    expect(run(resolution, 60, 20)).toBe(0);
    expect(resolution.scale).toBe(1);
  });

  it('lowers the resolution while frames stay slow, down to its floor', () => {
    const resolution = new DynamicResolution();
    // Every downscale must look like relief, so the frame rate improves as it drops.
    let fps = 30;
    while (resolution.scale > MIN_RESOLUTION_SCALE) {
      const before = resolution.scale;
      run(resolution, fps, 1);
      expect(resolution.scale).toBeLessThan(before);
      fps += 2;
    }
    expect(resolution.scale).toBe(MIN_RESOLUTION_SCALE);
  });

  it('restores the resolution when the frame rate recovers', () => {
    const resolution = new DynamicResolution();
    run(resolution, 30, 1);
    run(resolution, 40, 1);
    expect(resolution.scale).toBeLessThan(1);
    run(resolution, 60, 30);
    expect(resolution.scale).toBe(1);
  });

  it('undoes a downscale that does not speed the frame up', () => {
    const resolution = new DynamicResolution();
    // A 30 Hz cap (or a CPU-bound frame) is not fixed by drawing fewer pixels.
    run(resolution, 30, 1);
    expect(resolution.scale).toBeLessThan(1);
    run(resolution, 30, 1);
    expect(resolution.scale).toBe(1);
    run(resolution, 30, 10);
    expect(resolution.scale).toBe(1);
  });

  it('waits longer before probing a scale that already proved too slow', () => {
    const resolution = new DynamicResolution();
    run(resolution, 30, 1);
    run(resolution, 60, 3);
    expect(resolution.scale).toBe(1);
    // The probe slowed the game again: the next one needs twice the calm.
    run(resolution, 40, 1);
    expect(resolution.scale).toBeLessThan(1);
    run(resolution, 60, 4);
    expect(resolution.scale).toBeLessThan(1);
    run(resolution, 60, 3);
    expect(resolution.scale).toBe(1);
  });
});
