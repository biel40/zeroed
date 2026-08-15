import { describe, expect, it } from 'vitest';
import { PlayerEconomy } from '../src/game/PlayerEconomy';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { WallBuy, type WallBuyConfig } from '../src/zombies/wallbuys/WallBuy';

const CONFIG: WallBuyConfig = {
  id: 'test-m4a1',
  weaponId: 'm4a1',
  price: 1500,
  ammoPrice: 750,
  position: { x: 0, y: 1.4, z: 0 },
  yaw: 0,
  floor: 0,
};

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

function makePurchase(startingPoints: number, owned: boolean, ammoFull = false) {
  const mode = new ZombiesMode('burned-mansion');
  const economy = new PlayerEconomy();
  addPoints(economy, startingPoints);
  const calls = { grants: 0, refills: 0, denied: 0, banners: [] as string[] };
  (mode as unknown as { economy: PlayerEconomy }).economy = economy;
  (mode as unknown as { ctx: unknown }).ctx = {
    hasWeapon: () => owned,
    canGrantWeapon: () => true,
    canRefillWeaponAmmo: () => owned && !ammoFull,
    grantWeapon: () => { calls.grants++; return true; },
    refillWeaponAmmo: () => { calls.refills++; return true; },
    hud: {
      flashNotEnoughPoints: () => { calls.denied++; },
      showRoundBanner: (title: string) => { calls.banners.push(title); },
      updateZombies: () => undefined,
    },
  };
  const purchase = (mode as unknown as { purchaseWallBuy(buy: WallBuy): void }).purchaseWallBuy.bind(mode);
  return { economy, calls, purchase };
}

describe('Wall Buy', () => {
  it('validates prices and rejects special weapons', () => {
    expect(() => new WallBuy({ ...CONFIG, price: -1 })).toThrow(/weapon price/);
    expect(() => new WallBuy({ ...CONFIG, ammoPrice: Number.NaN })).toThrow(/ammo price/);
    expect(() => new WallBuy({ ...CONFIG, weaponId: 'raygun' } as unknown as WallBuyConfig)).toThrow(/Special weapon/);
  });

  it('charges the weapon price and grants an unowned weapon', () => {
    const { economy, calls, purchase } = makePurchase(2000, false);
    purchase(new WallBuy(CONFIG));
    expect(economy.points).toBe(500);
    expect(calls.grants).toBe(1);
    expect(calls.refills).toBe(0);
  });

  it('charges the independent ammo price and refills an owned weapon', () => {
    const { economy, calls, purchase } = makePurchase(1000, true);
    purchase(new WallBuy(CONFIG));
    expect(economy.points).toBe(250);
    expect(calls.grants).toBe(0);
    expect(calls.refills).toBe(1);
  });

  it('does not spend or deliver when points are insufficient', () => {
    const { economy, calls, purchase } = makePurchase(500, false);
    purchase(new WallBuy(CONFIG));
    expect(economy.points).toBe(500);
    expect(calls.grants).toBe(0);
    expect(calls.denied).toBe(1);
  });

  it('does not charge for ammo when the weapon is already full', () => {
    const { economy, calls, purchase } = makePurchase(1000, true, true);
    purchase(new WallBuy(CONFIG));
    expect(economy.points).toBe(1000);
    expect(calls.refills).toBe(0);
    expect(calls.banners).toContain('AMMO FULL');
  });

  it('uses the existing keyboard and mobile USE prompt variants', () => {
    const wallBuy = new WallBuy(CONFIG);
    const mode = new ZombiesMode('burned-mansion');
    const context = {
      profile: { useTouchControls: false },
      hasWeapon: () => false,
    };
    (mode as unknown as { ctx: unknown }).ctx = context;
    (mode as unknown as { findFacingDoor(): null }).findFacingDoor = () => null;
    (mode as unknown as { findRepairableBarrier(): null }).findRepairableBarrier = () => null;
    (mode as unknown as { findFacingWallBuy(): WallBuy }).findFacingWallBuy = () => wallBuy;

    expect(mode.getInteractPrompt()).toBe('Press E — Buy M4A1 — 1500 PTS');
    context.profile.useTouchControls = true;
    expect(mode.getInteractPrompt()).toBe('Tap USE — Buy M4A1 — 1500 PTS');
  });

  it('does not buy through a damaged barrier that owns the current USE prompt', () => {
    const { economy, calls } = makePurchase(2000, false);
    const mode = new ZombiesMode('burned-mansion');
    (mode as unknown as { economy: PlayerEconomy }).economy = economy;
    (mode as unknown as { gameOver: boolean }).gameOver = false;
    (mode as unknown as { ctx: unknown }).ctx = {
      hasWeapon: () => false,
      canGrantWeapon: () => true,
      canRefillWeaponAmmo: () => false,
      grantWeapon: () => { calls.grants++; return true; },
      refillWeaponAmmo: () => false,
      hud: { flashNotEnoughPoints: () => undefined, showRoundBanner: () => undefined },
    };
    (mode as unknown as { findFacingDoor(): null }).findFacingDoor = () => null;
    (mode as unknown as { findRepairableBarrier(): { isDamaged: boolean } }).findRepairableBarrier = () => ({ isDamaged: true });
    (mode as unknown as { findFacingWallBuy(): WallBuy }).findFacingWallBuy = () => new WallBuy(CONFIG);

    mode.onInteract();

    expect(economy.points).toBe(2000);
    expect(calls.grants).toBe(0);
  });
});
