import { describe, expect, it } from 'vitest';
import { stepHatMotion, type HatMotion } from '../src/zombies/skins/ZombieHatMotion';

describe('fallen zombie hat motion', () => {
  it('falls, bounces and settles on the current floor without sinking', () => {
    const motion: HatMotion = { x: 0, y: 4.7, z: 0, vx: 1, vy: 1.8, vz: -1, resting: false };
    let bounced = false;
    for (let i = 0; i < 600; i++) {
      const before = motion.vy;
      stepHatMotion(motion, 1 / 60, 3, 0.12);
      if (before < 0 && motion.vy > 0) bounced = true;
      expect(motion.y).toBeGreaterThanOrEqual(3.12);
    }
    expect(bounced).toBe(true);
    expect(motion.resting).toBe(true);
    expect(motion.y).toBe(3.12);
    expect(motion.x).toBeGreaterThan(0);
    expect(motion.z).toBeLessThan(0);
    const settled = { ...motion };
    stepHatMotion(motion, 1, 3, 0.12);
    expect(motion).toEqual(settled);
  });
});
