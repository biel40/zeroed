import { describe, expect, it } from 'vitest';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import type { WeaponId } from '../src/weapons/WeaponTypes';

describe('Zombies GOD_MODE developer command', () => {
  it('activates once after MOTDRULES and grants an infinite-ammo Zeus', () => {
    const mode = new ZombiesMode();
    const events: string[] = [];
    (mode as unknown as { ctx: unknown }).ctx = {
      grantWeapon: (id: WeaponId) => {
        events.push(`grant:${id}`);
        return true;
      },
      setWeaponInfiniteReserve: (id: WeaponId) => {
        events.push(`infinite:${id}`);
        return true;
      },
      hud: { showRoundBanner: (title: string) => events.push(`banner:${title}`) },
      audio: { playTeslaUnlock: () => events.push('audio') },
    };

    for (const key of 'MOTDRULES') mode.onKeyInput?.(key);
    for (const key of 'MOTDRULES') mode.onKeyInput?.(key);

    expect(events).toEqual([
      'grant:tesla',
      'infinite:tesla',
      'banner:GOD MODE ENABLED',
      'audio',
    ]);
  });

  it('enables invincibility and unlimited purchases', () => {
    const mode = new ZombiesMode();
    (mode as unknown as { ctx: unknown }).ctx = {
      grantWeapon: () => true,
      setWeaponInfiniteReserve: () => true,
      hud: { showRoundBanner: () => undefined },
      audio: { playTeslaUnlock: () => undefined },
    };

    for (const key of 'MOTDRULES') mode.onKeyInput?.(key);

    const health = (mode as unknown as { health: { damage: (amount: number) => boolean; hp: number } }).health;
    const economy = (mode as unknown as {
      economy: { spend: (cost: number) => boolean; points: number };
    }).economy;
    expect(health.damage(1000)).toBe(false);
    expect(health.hp).toBe(100);
    expect(economy.spend(5000)).toBe(true);
    expect(economy.points).toBe(0);
  });
});