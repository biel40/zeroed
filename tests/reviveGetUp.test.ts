import { describe, expect, it } from 'vitest';
import { getUpPose } from '../src/player/ReviveGetUp';

describe('getUpPose', () => {
  it('drops to the knees at once, stays down, and is fully standing at the end', () => {
    const duration = 1.2;
    expect(getUpPose(0, duration).drop).toBe(0);
    expect(getUpPose(duration * 0.2, duration).drop).toBeGreaterThan(0.9);
    expect(getUpPose(duration * 0.7, duration).drop).toBeLessThan(getUpPose(duration * 0.4, duration).drop);
    for (const elapsed of [duration, duration * 3]) {
      const pose = getUpPose(elapsed, duration);
      expect(Math.abs(pose.drop) + Math.abs(pose.pitch) + Math.abs(pose.roll)).toBe(0);
    }
  });
});
