import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import type { GameMode } from '../src/modes/GameMode';
import { MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING } from '../src/zombies/MysteryBox';
import type { WeaponId } from '../src/weapons/WeaponTypes';

/**
 * Progression contract tests: the Zombies starting loadout, the two-weapon
 * cap and Wonder Weapon acquisition are configuration facts and are pinned
 * here so a future refactor cannot silently break them.
 */
describe('Zombies progression contract', () => {
  it('starts with the M1911 alone', () => {
    const mode: GameMode = new ZombiesMode();
    expect(mode.startingInventory).toEqual(['m1911']);
    expect(mode.maxWeapons).toBe(2);
  });

  it('starts the M1911 at 8 / 64 by definition', () => {
    expect(WEAPON_DEFINITIONS.m1911.magazineSize).toBe(8);
    expect(WEAPON_DEFINITIONS.m1911.reserveAmmo).toBe(64);
  });

  it('gives the M1911 a 72-round total in Zombies: 8 in the mag, 64 in reserve', () => {
    const mode = new ZombiesMode();
    expect(WEAPON_DEFINITIONS.m1911.magazineSize).toBe(8);
    expect(mode.reserveAmmoFor?.('m1911')).toBe(64);
  });

  it('keeps the ZEUS-77 at 5 / 25 as a full 30-shot capacity', () => {
    expect(WEAPON_DEFINITIONS.tesla.magazineSize).toBe(5);
    expect(WEAPON_DEFINITIONS.tesla.reserveAmmo).toBe(25);
  });

  it('supplies the PPSh-41 with four spare drums in Zombies', () => {
    const mode = new ZombiesMode();
    expect(WEAPON_DEFINITIONS.ppsh41.magazineSize).toBe(71);
    expect(mode.reserveAmmoFor?.('ppsh41')).toBe(284);
  });

  it('preloads every Mystery Box reward (rolls never hit the network)', () => {
    const mode = new ZombiesMode();
    for (const entry of MYSTERY_BOX_POOL) {
      expect(mode.weaponIds).toContain(entry.weaponId);
    }
    expect(mode.weaponIds).toContain('m1911');
  });

  it('keeps the Ray Gun out of the starting slots: earned, never given', () => {
    const mode = new ZombiesMode();
    expect(mode.startingInventory).not.toContain('raygun');
    // Not directly slot-selectable either: it is not part of the start
    // loadout and the inventory caps at maxWeapons, so number keys can
    // never reach it. It IS preloaded so the Mystery Box can hand it
    // out without touching the network.
    expect(mode.weaponIds).toContain('raygun');
    expect(MYSTERY_BOX_POOL.some((e) => e.weaponId === 'raygun')).toBe(true);
  });

  it('prices the box at 950 points, charged at activation', () => {
    expect(MYSTERY_BOX_TUNING.cost).toBe(950);
    expect(MYSTERY_BOX_TUNING.pickupTime).toBe(10);
  });

});

describe('Kills never grant a Ray Gun', () => {
  interface MockContext {
    granted: WeaponId[];
    banners: string[];
    reveals: boolean[];
  }

  function makeMode(mapId: 'burned-mansion' | 'station-33' = 'burned-mansion'): { mode: ZombiesMode; ctx: MockContext } {
    const mode = new ZombiesMode(mapId);
    const ctx: MockContext = { granted: [], banners: [], reveals: [] };
    (mode as unknown as { ctx: unknown }).ctx = {
      grantWeapon: (id: WeaponId) => ctx.granted.push(id),
      hud: { showRoundBanner: (title: string) => ctx.banners.push(title) },
      audio: {
        playZombieDeath: () => undefined,
        playMysteryBoxReveal: (isRayGun: boolean) => void ctx.reveals.push(isRayGun),
      },
    };
    return { mode, ctx };
  }

  function kill(mode: ZombiesMode, count: number): void {
    const onKilled = (mode as unknown as { onZombieKilled: (headshot: boolean) => void })
      .onZombieKilled;
    for (let i = 0; i < count; i++) onKilled.call(mode, false);
  }

  it.each(['burned-mansion', 'station-33'] as const)('never grants or announces a weapon at any kill milestone in %s', (mapId) => {
    const { mode, ctx } = makeMode(mapId);
    kill(mode, 114);
    kill(mode, 1);
    kill(mode, 385);
    expect(ctx.granted).toEqual([]);
    expect(ctx.banners).toEqual([]);
    expect(ctx.reveals).toEqual([]);
  });
});
