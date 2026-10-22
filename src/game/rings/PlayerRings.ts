import { RING_DEFINITIONS, type RingFinger, type RingId } from './RingCatalog';

export type RingEvent =
  | { readonly type: 'purchased'; readonly ringId: RingId }
  | { readonly type: 'recharged'; readonly ringId: RingId }
  | { readonly type: 'consumed'; readonly ringId: RingId };

/** Outcome of using a ring machine. */
export type RingPurchaseResult = 'purchased' | 'recharged' | 'alreadyCharged' | 'notEnoughPoints';

/** One worn ring, as the HUD and the hand view read it. */
export interface WornRing {
  readonly ringId: RingId;
  readonly finger: RingFinger;
  readonly charges: number;
}

/**
 * The rings a player wears during one run and the charges each one holds.
 * Every ring has its own finger in the catalog, so wearing a ring is what
 * occupies that finger. Pure logic (no Three.js): the mode charges Points
 * through the injected spend function and reacts to `pendingEvents`, like
 * `MysteryBoxMachine`.
 */
export class PlayerRings {
  readonly pendingEvents: RingEvent[] = [];
  private readonly charges = new Map<RingId, number>();

  has(ringId: RingId): boolean {
    return this.charges.has(ringId);
  }

  chargesOf(ringId: RingId): number {
    return this.charges.get(ringId) ?? 0;
  }

  ringOn(finger: RingFinger): RingId | null {
    for (const ringId of this.charges.keys()) {
      if (RING_DEFINITIONS[ringId].finger === finger) return ringId;
    }
    return null;
  }

  /** Worn rings in purchase order. */
  get worn(): ReadonlyArray<WornRing> {
    return [...this.charges].map(([ringId, charges]) => ({ ringId, finger: RING_DEFINITIONS[ringId].finger, charges }));
  }

  /** What the machine of `ringId` charges now, or null while the worn ring still holds a charge. */
  priceOf(ringId: RingId): number | null {
    const definition = RING_DEFINITIONS[ringId];
    if (!this.has(ringId)) return definition.price;
    return this.chargesOf(ringId) > 0 ? null : definition.rechargePrice;
  }

  /** Buys the ring, or restores its charges once spent. `spend` must be atomic. */
  buy(ringId: RingId, spend: (cost: number) => boolean): RingPurchaseResult {
    const price = this.priceOf(ringId);
    if (price === null) return 'alreadyCharged';
    if (!spend(price)) return 'notEnoughPoints';
    const type = this.has(ringId) ? 'recharged' : 'purchased';
    this.charges.set(ringId, RING_DEFINITIONS[ringId].chargesPerPurchase);
    this.pendingEvents.push({ type, ringId });
    return type;
  }

  /** Spends one charge; false when the ring is not worn or already spent. */
  consumeCharge(ringId: RingId): boolean {
    const charges = this.chargesOf(ringId);
    if (charges <= 0) return false;
    this.charges.set(ringId, charges - 1);
    this.pendingEvents.push({ type: 'consumed', ringId });
    return true;
  }

  clearEvents(): void {
    this.pendingEvents.length = 0;
  }

  /** New run: no rings, no charges, no pending events. */
  reset(): void {
    this.charges.clear();
    this.clearEvents();
  }
}
