import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { ShootingRangeMode } from '../src/modes/ShootingRangeMode';
import type { GameMode } from '../src/modes/GameMode';
import { MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING } from '../src/zombies/MysteryBox';

/**
 * Progression contract tests: the Zombies starting loadout, the two-weapon
 * cap and the Ray Gun exclusivity are configuration facts and are pinned
 * here so a future refactor cannot silently break them.
 */
describe('Zombies progression contract', () => {
  it('starts with the M1911 alone', () => {
    const mode: GameMode = new ZombiesMode();
    expect(mode.startingInventory).toEqual(['m1911']);
    expect(mode.maxWeapons).toBe(2);
  });

  it('starts the M1911 at 8 / 32 by definition', () => {
    expect(WEAPON_DEFINITIONS.m1911.magazineSize).toBe(8);
    expect(WEAPON_DEFINITIONS.m1911.reserveAmmo).toBe(32);
  });

  it('preloads every Mystery Box reward (rolls never hit the network)', () => {
    const mode = new ZombiesMode();
    for (const entry of MYSTERY_BOX_POOL) {
      expect(mode.weaponIds).toContain(entry.weaponId);
    }
    expect(mode.weaponIds).toContain('m1911');
  });

  it('keeps the Ray Gun out of the starting slots: Mystery Box only', () => {
    const mode = new ZombiesMode();
    expect(mode.startingInventory).not.toContain('raygun');
    // Not directly slot-selectable either: it is not part of the start
    // loadout and the inventory caps at maxWeapons, so number keys can
    // never reach it. It IS preloaded so the box can hand it out.
    expect(mode.weaponIds).toContain('raygun');
    expect(MYSTERY_BOX_POOL.some((e) => e.weaponId === 'raygun')).toBe(true);
  });

  it('keeps the box free for now but cost-ready', () => {
    expect(MYSTERY_BOX_TUNING.cost).toBe(0);
    expect(MYSTERY_BOX_TUNING.pickupTime).toBe(10);
  });

  it('does not touch the Shooting Range: no box, no cap, no finite reserve', () => {
    // Typed as the GameMode interface: the contract is what matters here.
    const mode: GameMode = new ShootingRangeMode();
    expect(mode.startingInventory).toBeUndefined();
    expect(mode.maxWeapons).toBeUndefined();
    expect(mode.onInteract).toBeUndefined();
    expect(mode.getInteractPrompt).toBeUndefined();
    expect(mode.weaponIds).not.toContain('raygun');
    // Every range weapon keeps a bottomless reserve.
    for (const id of mode.weaponIds) {
      if (id === 'm1911') continue; // the pistol keeps its 32 everywhere
      expect(WEAPON_DEFINITIONS[id].reserveAmmo).toBeUndefined();
    }
  });
});
