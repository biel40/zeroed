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
  it('gives every ring its own fixed finger and a valid effect', () => {
    const fingers = Object.values(RING_DEFINITIONS).map((ring) => ring.finger);
    expect(new Set(fingers).size).toBe(fingers.length);
    for (const ring of Object.values(RING_DEFINITIONS)) {
      expect(RING_FINGERS).toContain(ring.finger);
      expect(ring.price).toBeGreaterThan(ring.rechargePrice);
      expect(ring.chargesPerPurchase).toBeGreaterThan(0);
    }
    expect(RESURRECTION.finger).toBe('ring');
    expect(RESURRECTION.effect).toEqual({ kind: 'resurrection', reviveFraction: 0.5, invulnerability: 2 });
  });
});

describe('PlayerRings', () => {
  it('buys a ring once, occupies its finger and charges the full price', () => {
    const rings = new PlayerRings();
    const economy = wallet(3000);
    expect(rings.priceOf('resurrection')).toBe(RESURRECTION.price);
    expect(rings.buy('resurrection', (cost) => economy.spend(cost))).toBe('purchased');
    expect(economy.points).toBe(3000 - RESURRECTION.price);
    expect(rings.has('resurrection')).toBe(true);
    expect(rings.chargesOf('resurrection')).toBe(RESURRECTION.chargesPerPurchase);
    for (const finger of RING_FINGERS) expect(rings.ringOn(finger)).toBe(finger === 'ring' ? 'resurrection' : null);
    expect(rings.worn).toEqual([{ ringId: 'resurrection', finger: 'ring', charges: 1 }]);
    expect(rings.pendingEvents).toEqual([{ type: 'purchased', ringId: 'resurrection' }]);
  });

  it('refuses a second purchase while the ring is charged, without charging', () => {
    const rings = new PlayerRings();
    const economy = wallet(6000);
    rings.buy('resurrection', (cost) => economy.spend(cost));
    const balance = economy.points;
    expect(rings.priceOf('resurrection')).toBeNull();
    expect(rings.buy('resurrection', (cost) => economy.spend(cost))).toBe('alreadyCharged');
    expect(economy.points).toBe(balance);
  });

  it('leaves everything untouched when the wallet cannot pay', () => {
    const rings = new PlayerRings();
    const economy = wallet(RESURRECTION.price - 10);
    expect(rings.buy('resurrection', (cost) => economy.spend(cost))).toBe('notEnoughPoints');
    expect(economy.points).toBe(RESURRECTION.price - 10);
    expect(rings.has('resurrection')).toBe(false);
    expect(rings.ringOn('ring')).toBeNull();
    expect(rings.pendingEvents).toHaveLength(0);
  });

  it('consumes a charge once and recharges a spent ring at the recharge price', () => {
    const rings = new PlayerRings();
    const economy = wallet(5000);
    expect(rings.consumeCharge('resurrection')).toBe(false);
    rings.buy('resurrection', (cost) => economy.spend(cost));
    rings.clearEvents();
    expect(rings.consumeCharge('resurrection')).toBe(true);
    expect(rings.consumeCharge('resurrection')).toBe(false);
    expect(rings.has('resurrection')).toBe(true);
    expect(rings.chargesOf('resurrection')).toBe(0);
    expect(rings.priceOf('resurrection')).toBe(RESURRECTION.rechargePrice);

    const poor = wallet(RESURRECTION.rechargePrice - 10);
    expect(rings.buy('resurrection', (cost) => poor.spend(cost))).toBe('notEnoughPoints');
    const balance = economy.points;
    expect(rings.buy('resurrection', (cost) => economy.spend(cost))).toBe('recharged');
    expect(economy.points).toBe(balance - RESURRECTION.rechargePrice);
    expect(rings.chargesOf('resurrection')).toBe(1);
    expect(rings.pendingEvents).toEqual([
      { type: 'consumed', ringId: 'resurrection' },
      { type: 'recharged', ringId: 'resurrection' },
    ]);
  });

  it('resets the run: no rings, free fingers, no events', () => {
    const rings = new PlayerRings();
    rings.buy('resurrection', () => true);
    rings.reset();
    expect(rings.has('resurrection')).toBe(false);
    expect(rings.worn).toEqual([]);
    expect(rings.ringOn('ring')).toBeNull();
    expect(rings.pendingEvents).toHaveLength(0);
    expect(rings.priceOf('resurrection')).toBe(RESURRECTION.price);
  });
});
