import { describe, expect, it } from 'vitest';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { TESLA_UNLOCK_KILLS } from '../src/zombies/ZombieConfig';
import type { WeaponId } from '../src/weapons/WeaponTypes';

/**
 * Tesla milestone: TESLA_UNLOCK_KILLS grants the electric Wonder Weapon
 * exactly once per run, announced like the Ray Gun milestone. ZombiesMode is
 * driven without init(): the kill callback only touches the context surface
 * mocked here (grant + banner + audio), exactly as the real ZombieManager
 * callback invokes it in-game.
 */
describe('Tesla unlock at the 115-kill milestone', () => {
  interface MockContext {
    granted: WeaponId[];
    banners: string[];
    arcs: number;
  }

  function makeMode(): { mode: ZombiesMode; ctx: MockContext } {
    const mode = new ZombiesMode();
    const ctx: MockContext = { granted: [], banners: [], arcs: 0 };
    (mode as unknown as { ctx: unknown }).ctx = {
      grantWeapon: (id: WeaponId) => ctx.granted.push(id),
      hud: { showRoundBanner: (title: string) => ctx.banners.push(title) },
      audio: {
        playZombieDeath: () => undefined,
        playMysteryBoxReveal: () => undefined,
        playTeslaUnlock: () => {
          ctx.arcs++;
        },
      },
    };
    return { mode, ctx };
  }

  function kill(mode: ZombiesMode, count: number): void {
    const onKilled = (mode as unknown as { onZombieKilled: (headshot: boolean) => void })
      .onZombieKilled;
    for (let i = 0; i < count; i++) onKilled.call(mode, false);
  }

  it('does not unlock before the milestone', () => {
    const { mode, ctx } = makeMode();
    kill(mode, TESLA_UNLOCK_KILLS - 1);
    // The Ray Gun (75) is already unlocked by now — that milestone is lower.
    // This test only pins the Tesla staying locked until 115.
    expect(ctx.granted).not.toContain('tesla');
    expect(ctx.banners).not.toContain('ZEUS-77 UNLOCKED');
    expect(ctx.arcs).toBe(0);
  });

  it('grants the Tesla with a banner exactly at 115 kills, and only once', () => {
    const { mode, ctx } = makeMode();
    kill(mode, TESLA_UNLOCK_KILLS);
    // The Ray Gun (75) fired on the way up; this test asserts the Tesla side.
    expect(ctx.granted.filter((w) => w === 'tesla')).toEqual(['tesla']);
    expect(ctx.banners).toContain('ZEUS-77 UNLOCKED');
    expect(ctx.arcs).toBe(1);

    // The Tesla is the last milestone: further kills must not re-fire it.
    kill(mode, 5);
    expect(ctx.granted.filter((w) => w === 'tesla')).toHaveLength(1);
    expect(ctx.banners.filter((b) => b === 'ZEUS-77 UNLOCKED')).toHaveLength(1);
    expect(ctx.arcs).toBe(1);
  });

  it('is preloaded by the mode but never in the starting inventory', () => {
    const mode = new ZombiesMode();
    expect(mode.weaponIds).toContain('tesla');
    expect(mode.startingInventory).not.toContain('tesla');
  });
});
