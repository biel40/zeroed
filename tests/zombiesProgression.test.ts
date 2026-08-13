import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { ShootingRangeMode } from '../src/modes/ShootingRangeMode';
import type { GameMode } from '../src/modes/GameMode';
import { MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING } from '../src/zombies/MysteryBox';
import { RAYGUN_UNLOCK_KILLS } from '../src/zombies/ZombieConfig';
import type { WeaponId } from '../src/weapons/WeaponTypes';

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

  it('keeps the Ray Gun out of the starting slots: earned, never given', () => {
    const mode = new ZombiesMode();
    expect(mode.startingInventory).not.toContain('raygun');
    // Not directly slot-selectable either: it is not part of the start
    // loadout and the inventory caps at maxWeapons, so number keys can
    // never reach it. It IS preloaded so the Mystery Box and the 115-kill
    // milestone can hand it out without touching the network.
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

/**
 * Ray Gun milestone: RAYGUN_UNLOCK_KILLS unlocks it exactly once per run.
 * ZombiesMode is driven without init(): the kill callback only touches the
 * context surface mocked here (grant + banner + audio), exactly as the
 * real ZombieManager callback invokes it in-game.
 */
describe('Ray Gun unlock at the 115-kill milestone', () => {
  interface MockContext {
    granted: WeaponId[];
    banners: string[];
    reveals: boolean[];
  }

  function makeMode(): { mode: ZombiesMode; ctx: MockContext } {
    const mode = new ZombiesMode();
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

  it('pins the milestone at exactly 115 kills', () => {
    expect(RAYGUN_UNLOCK_KILLS).toBe(115);
  });

  it('does not unlock before the milestone', () => {
    const { mode, ctx } = makeMode();
    kill(mode, RAYGUN_UNLOCK_KILLS - 1);
    expect(ctx.granted).toEqual([]);
    expect(ctx.banners).toEqual([]);
    expect(ctx.reveals).toEqual([]);
  });

  it('grants the Ray Gun with a banner exactly at 115 kills, and only once', () => {
    const { mode, ctx } = makeMode();
    kill(mode, RAYGUN_UNLOCK_KILLS);
    expect(ctx.granted).toEqual(['raygun']);
    expect(ctx.banners).toEqual(['RAY GUN UNLOCKED']);
    expect(ctx.reveals).toEqual([true]);

    kill(mode, 50); // the horde keeps dying; the unlock must not repeat
    expect(ctx.granted).toEqual(['raygun']);
    expect(ctx.banners).toHaveLength(1);
    expect(ctx.reveals).toHaveLength(1);
  });

  it('re-arms the milestone after a restart (new run, fresh kill count)', () => {
    const { mode, ctx } = makeMode();
    kill(mode, RAYGUN_UNLOCK_KILLS);
    expect(ctx.granted).toEqual(['raygun']);

    // Minimal shell surface restart() touches beyond what makeMode mocks.
    const shell = (mode as unknown as { ctx: Record<string, unknown> }).ctx;
    shell.resetArsenal = () => undefined;
    shell.lockPointer = () => undefined;
    (shell.hud as Record<string, unknown>).hideGameOver = () => undefined;
    (shell.hud as Record<string, unknown>).updateZombies = () => undefined;
    (mode as unknown as { zombies: unknown }).zombies = {
      reset: () => undefined,
      aliveCount: 0,
    };

    (mode as unknown as { restart(): void }).restart();
    kill(mode, RAYGUN_UNLOCK_KILLS - 1);
    expect(ctx.granted).toEqual(['raygun']); // still re-armed, not early
    kill(mode, 1);
    expect(ctx.granted).toEqual(['raygun', 'raygun']);
  });
});
