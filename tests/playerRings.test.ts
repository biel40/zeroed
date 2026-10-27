import { describe, expect, it } from 'vitest';
import { PlayerEconomy } from '../src/game/PlayerEconomy';
import { PlayerRings } from '../src/game/rings/PlayerRings';
import { RING_DEFINITIONS, RING_FINGERS } from '../src/game/rings/RingCatalog';

const RESURRECTION = RING_DEFINITIONS.resurrection;

function wallet(points: number): PlayerEconomy {
  const economy = new PlayerEconomy();
  // Repairs are the only award with a fixed unit; enough of them fund any test.
  for (let index = 0; index < points / 10; index++) economy.awardRepair();
  return economy;
}

describe('Ring catalog', () => {
  it('gives every ring its own fixed finger, rising prices and a valid effect', () => {
    const fingers = Object.values(RING_DEFINITIONS).map((ring) => ring.finger);
    expect(new Set(fingers).size).toBe(fingers.length);
    for (const ring of Object.values(RING_DEFINITIONS)) {
      expect(RING_FINGERS).toContain(ring.finger);
      expect(ring.prices.length).toBeGreaterThan(0);
      ring.prices.slice(1).forEach((price, index) => expect(price).toBeGreaterThan(ring.prices[index]));
      expect(ring.chargesPerPurchase).toBeGreaterThan(0);
    }
    expect(RESURRECTION.finger).toBe('ring');
    expect(RESURRECTION.prices).toEqual([500, 1000, 2000]);
    expect(RESURRECTION.effect).toEqual({ kind: 'resurrection', reviveFraction: 0.5, getUp: 1.2, protection: 2.5 });
  });
});

describe('PlayerRings', () => {
  it('grants and recharges developer perks without consuming purchase stock; reset removes them', () => {
    const rings = new PlayerRings();
    rings.grant('resurrection');
    expect(rings.consumeCharge('resurrection')).toBe(true);
    rings.grant('resurrection');
    expect(rings.chargesOf('resurrection')).toBe(1);
    expect(rings.purchasesOf('resurrection')).toBe(0);
    expect(rings.pendingEvents.at(-1)).toEqual({ type: 'recharged', ringId: 'resurrection' });
    rings.reset();
    expect(rings.worn).toEqual([]);
    expect(rings.priceOf('resurrection')).toBe(500);
  });
  it('buys a ring once, occupies its finger and charges the first price', () => {
    const rings = new PlayerRings();
    const economy = wallet(3000);
    expect(rings.priceOf('resurrection')).toBe(500);
    expect(rings.buy('resurrection', (cost) => economy.spend(cost))).toBe('purchased');
    expect(economy.points).toBe(2500);
    expect(rings.has('resurrection')).toBe(true);
    expect(rings.chargesOf('resurrection')).toBe(RESURRECTION.chargesPerPurchase);
    expect(rings.purchasesOf('resurrection')).toBe(1);
    for (const finger of RING_FINGERS) expect(rings.ringOn(finger)).toBe(finger === 'ring' ? 'resurrection' : null);
    expect(rings.worn).toEqual([{ ringId: 'resurrection', finger: 'ring', charges: 1 }]);
    expect(rings.pendingEvents).toEqual([{ type: 'purchased', ringId: 'resurrection' }]);
  });

  it('refuses another purchase while the ring is charged, without charging', () => {
    const rings = new PlayerRings();
    const economy = wallet(6000);
    rings.buy('resurrection', (cost) => economy.spend(cost));
    const balance = economy.points;
    expect(rings.priceOf('resurrection')).toBeNull();
    expect(rings.buy('resurrection', (cost) => economy.spend(cost))).toBe('unavailable');
    expect(economy.points).toBe(balance);
  });

  it('leaves everything untouched when the wallet cannot pay', () => {
    const rings = new PlayerRings();
    const economy = wallet(490);
    expect(rings.buy('resurrection', (cost) => economy.spend(cost))).toBe('notEnoughPoints');
    expect(economy.points).toBe(490);
    expect(rings.has('resurrection')).toBe(false);
    expect(rings.purchasesOf('resurrection')).toBe(0);
    expect(rings.ringOn('ring')).toBeNull();
    expect(rings.pendingEvents).toHaveLength(0);
  });

  it('doubles the price on every recharge and sells nothing after the third purchase', () => {
    const rings = new PlayerRings();
    const economy = wallet(10000);
    const paid: number[] = [];
    expect(rings.consumeCharge('resurrection')).toBe(false);
    for (const type of ['purchased', 'recharged', 'recharged'] as const) {
      const price = rings.priceOf('resurrection')!;
      expect(rings.buy('resurrection', (cost) => economy.spend(cost))).toBe(type);
      paid.push(price);
      expect(rings.consumeCharge('resurrection')).toBe(true);
      expect(rings.consumeCharge('resurrection')).toBe(false);
    }
    expect(paid).toEqual([500, 1000, 2000]);
    expect(economy.points).toBe(10000 - 3500);
    expect(rings.has('resurrection')).toBe(true);
    expect(rings.priceOf('resurrection')).toBeNull();
    expect(rings.buy('resurrection', (cost) => economy.spend(cost))).toBe('unavailable');
    expect(economy.points).toBe(10000 - 3500);
  });

  it('resets the run: no rings, free fingers, first price again, no events', () => {
    const rings = new PlayerRings();
    rings.buy('resurrection', () => true);
    rings.consumeCharge('resurrection');
    rings.buy('resurrection', () => true);
    rings.reset();
    expect(rings.has('resurrection')).toBe(false);
    expect(rings.worn).toEqual([]);
    expect(rings.ringOn('ring')).toBeNull();
    expect(rings.pendingEvents).toHaveLength(0);
    expect(rings.priceOf('resurrection')).toBe(500);
  });
});
