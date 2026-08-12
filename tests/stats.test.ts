import { describe, expect, it } from 'vitest';
import { Stats } from '../src/game/Stats';

describe('Stats', () => {
  it('starts at zero accuracy with no shots', () => {
    const stats = new Stats();
    expect(stats.accuracy).toBe(0);
  });

  it('tracks shots, hits and accuracy', () => {
    const stats = new Stats();
    stats.registerShot();
    stats.registerShot();
    stats.registerShot();
    stats.registerShot();
    stats.registerHit(100);
    stats.registerHit(25);

    expect(stats.shots).toBe(4);
    expect(stats.hits).toBe(2);
    expect(stats.accuracy).toBeCloseTo(0.5, 6);
    expect(stats.lastHitDistance).toBe(25);
  });

  it('never reports more hits than shots in normal flow', () => {
    const stats = new Stats();
    for (let i = 0; i < 10; i++) stats.registerShot();
    for (let i = 0; i < 10; i++) stats.registerHit(50);
    expect(stats.accuracy).toBe(1);
  });
});
