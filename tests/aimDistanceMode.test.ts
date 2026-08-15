import { describe, expect, it } from 'vitest';
import type { GameMode } from '../src/modes/GameMode';
import { ShootingRangeMode } from '../src/modes/ShootingRangeMode';
import { ZombiesMode } from '../src/modes/ZombiesMode';

describe('aim distance mode capability', () => {
  it('is enabled only for the shooting range', () => {
    const range: GameMode = new ShootingRangeMode();
    const classicZombies: GameMode = new ZombiesMode('classic');
    const burnedMansion: GameMode = new ZombiesMode('burned-mansion');

    expect(range.showsAimDistance).toBe(true);
    expect(classicZombies.showsAimDistance).not.toBe(true);
    expect(burnedMansion.showsAimDistance).not.toBe(true);
  });
});