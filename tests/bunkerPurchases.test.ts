import { describe, expect, it } from 'vitest';
import { PlayerEconomy } from '../src/game/PlayerEconomy';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import type { ArenaAmmoRefill, ArenaWeaponPickup } from '../src/zombies/maps/ZombieArena';

function addPoints(economy: PlayerEconomy, amount: number): void {
  while (amount >= 100) {
    economy.awardKill(true);
    amount -= 100;
  }
  while (amount >= 10) {
    economy.awardHit();
    amount -= 10;
  }
}

function makeMode(points: number): {
  readonly mode: ZombiesMode;
  readonly economy: PlayerEconomy;
  readonly calls: { grants: string[]; refills: number; denied: number; banners: string[]; audio: number };
} {
  const mode = new ZombiesMode('burned-mansion');
  const economy = new PlayerEconomy();
  addPoints(economy, points);
  const calls = { grants: [] as string[], refills: 0, denied: 0, banners: [] as string[], audio: 0 };
  (mode as unknown as { economy: PlayerEconomy }).economy = economy;
  (mode as unknown as { ctx: unknown }).ctx = {
    profile: { useTouchControls: false },
    canGrantWeapon: () => true,
    grantWeapon: (id: string) => { calls.grants.push(id); return true; },
    canRefillEquippedWeaponAmmo: () => true,
    refillEquippedWeaponAmmo: () => { calls.refills++; return true; },
    audio: { playMysteryBoxPickup: () => { calls.audio++; } },
    hud: {
      flashNotEnoughPoints: () => { calls.denied++; },
      showRoundBanner: (title: string) => { calls.banners.push(title); },
      updateZombies: () => undefined,
    },
  };
  (mode as unknown as { gameOver: boolean }).gameOver = false;
  (mode as unknown as { findFacingDoor(): null }).findFacingDoor = () => null;
  (mode as unknown as { findRepairableBarrier(): null }).findRepairableBarrier = () => null;
  (mode as unknown as { findFacingWallBuy(): null }).findFacingWallBuy = () => null;
  return { mode, economy, calls };
}

function weaponPickup(cost: number): ArenaWeaponPickup {
  let purchased = false;
  return {
    id: 'test-raygun-case',
    weaponId: 'raygun',
    cost,
    interactionLabel: 'RAY GUN — 2000',
    position: { x: 0, y: -2, z: 0 },
    floor: -1,
    useRange: 2,
    lookDotMin: 0.4,
    get available() { return !purchased; },
    claim: () => {
      if (purchased) return false;
      purchased = true;
      return true;
    },
    reset: () => { purchased = false; },
  };
}

function ammoRefill(): ArenaAmmoRefill {
  return {
    id: 'test-ammo-refill',
    cost: 800,
    interactionLabel: 'REFILL AMMO — 800',
    position: { x: 0, y: 0.5, z: 0 },
    floor: 0,
    useRange: 2,
    lookDotMin: 0.4,
    activate: () => undefined,
    reset: () => undefined,
  };
}

describe('Burned Mansion purchases', () => {
  it('charges a Wonder Weapon case exactly once and grants its weapon', () => {
    const { mode, economy, calls } = makeMode(3000);
    const pickup = weaponPickup(2000);
    (mode as unknown as { findFacingWeaponPickup(): ArenaWeaponPickup | null }).findFacingWeaponPickup = () =>
      pickup.available ? pickup : null;
    (mode as unknown as { findFacingAmmoRefill(): null }).findFacingAmmoRefill = () => null;

    mode.onInteract();
    mode.onInteract();

    expect(economy.points).toBe(1000);
    expect(calls.grants).toEqual(['raygun']);
    expect(pickup.available).toBe(false);
  });

  it('does not change state when a Wonder Weapon case is unaffordable', () => {
    const { mode, economy, calls } = makeMode(1990);
    const pickup = weaponPickup(2000);
    (mode as unknown as { findFacingWeaponPickup(): ArenaWeaponPickup }).findFacingWeaponPickup = () => pickup;
    (mode as unknown as { findFacingAmmoRefill(): null }).findFacingAmmoRefill = () => null;

    mode.onInteract();

    expect(economy.points).toBe(1990);
    expect(calls.grants).toEqual([]);
    expect(pickup.available).toBe(true);
    expect(calls.denied).toBe(1);
  });

  it('refills only the equipped weapon and charges exactly 800 points', () => {
    const { mode, economy, calls } = makeMode(1000);
    (mode as unknown as { findFacingWeaponPickup(): null }).findFacingWeaponPickup = () => null;
    (mode as unknown as { findFacingAmmoRefill(): ArenaAmmoRefill }).findFacingAmmoRefill = () => ammoRefill();

    mode.onInteract();

    expect(economy.points).toBe(200);
    expect(calls.refills).toBe(1);
  });

  it('does not charge when equipped ammo is full', () => {
    const { mode, economy, calls } = makeMode(1000);
    (mode as unknown as { ctx: { canRefillEquippedWeaponAmmo(): boolean } }).ctx.canRefillEquippedWeaponAmmo = () => false;
    (mode as unknown as { findFacingWeaponPickup(): null }).findFacingWeaponPickup = () => null;
    (mode as unknown as { findFacingAmmoRefill(): ArenaAmmoRefill }).findFacingAmmoRefill = () => ammoRefill();

    mode.onInteract();

    expect(economy.points).toBe(1000);
    expect(calls.refills).toBe(0);
    expect(calls.banners).toContain('AMMO FULL');
  });

  it('does not refill when points are insufficient', () => {
    const { mode, economy, calls } = makeMode(790);
    (mode as unknown as { findFacingWeaponPickup(): null }).findFacingWeaponPickup = () => null;
    (mode as unknown as { findFacingAmmoRefill(): ArenaAmmoRefill }).findFacingAmmoRefill = () => ammoRefill();

    mode.onInteract();

    expect(economy.points).toBe(790);
    expect(calls.refills).toBe(0);
    expect(calls.denied).toBe(1);
  });

  it('uses the exact purchase labels with desktop and mobile USE prompts', () => {
    const { mode } = makeMode(3000);
    const pickup = weaponPickup(2000);
    const refill = ammoRefill();
    const context = (mode as unknown as { ctx: { profile: { useTouchControls: boolean } } }).ctx;
    (mode as unknown as { findFacingWeaponPickup(): ArenaWeaponPickup | null }).findFacingWeaponPickup = () => pickup;
    (mode as unknown as { findFacingAmmoRefill(): ArenaAmmoRefill | null }).findFacingAmmoRefill = () => null;

    expect(mode.getInteractPrompt()).toBe('RAY GUN — 2000\nPress E');
    context.profile.useTouchControls = true;
    expect(mode.getInteractPrompt()).toBe('RAY GUN — 2000\nTap USE');

    (mode as unknown as { findFacingWeaponPickup(): ArenaWeaponPickup | null }).findFacingWeaponPickup = () => null;
    (mode as unknown as { findFacingAmmoRefill(): ArenaAmmoRefill | null }).findFacingAmmoRefill = () => refill;
    expect(mode.getInteractPrompt()).toBe('REFILL AMMO — 800\nTap USE');
  });
});