import { lerp } from '../utils/math';
import type { WeaponId } from '../weapons/WeaponTypes';

const TIMER_EPSILON = 1e-9;

/** One weapon on the Mystery Box wheel; weights are relative, not percent. */
export type MysteryBoxRarity = 'standard' | 'rare' | 'legendary';

export interface MysteryBoxEntry {
  readonly weaponId: WeaponId;
  readonly weight: number;
  readonly rarity: MysteryBoxRarity;
}

/**
 * The wheel. The M1911 is deliberately NOT here: it is the starting pistol,
 * not a reward. Wonder Weapons are rare pulls; tune their relative weights
 * here, never by touching the selection logic.
 */
export const MYSTERY_BOX_POOL: readonly MysteryBoxEntry[] = [
  { weaponId: 'm4a1', weight: 25, rarity: 'standard' },
  { weaponId: 'ak47', weight: 25, rarity: 'standard' },
  { weaponId: 'm60', weight: 20, rarity: 'standard' },
  { weaponId: 'l96', weight: 20, rarity: 'standard' },
  { weaponId: 'raygun', weight: 10, rarity: 'rare' },
  { weaponId: 'tesla', weight: 1, rarity: 'legendary' },
];

/** Timings (seconds) and behaviour knobs of the box sequence. */
export const MYSTERY_BOX_TUNING = {
  /** Lid swing before the roll starts. */
  openTime: 0.7,
  /** Exact time from activation until the final weapon is revealed. */
  revealTime: 5,
  /** How long the result floats before the box takes it back. */
  pickupTime: 10,
  /** Lid swing back down. */
  closeTime: 0.85,
  /** Weapon-swap cadence at roll start/end (the decelerating roulette). */
  tickStartInterval: 0.09,
  tickEndInterval: 0.32,
  /**
   * Weight multiplier applied to whatever the previous roll granted, for
   * one roll. 0.35 makes immediate repeats uncommon but never impossible.
   */
  repeatFactor: 0.35,
  /**
   * Price in Points, charged atomically at activation time (see
   * ZombiesMode.onInteract). 950 is the classic CoD Zombies box cost.
   */
  cost: 950,
} as const;

export type MysteryBoxPhase = 'closed' | 'opening' | 'rolling' | 'awaitingPickup' | 'closing';

export type MysteryBoxEventType =
  | 'opened'
  | 'rollTick'
  | 'result'
  | 'pickedUp'
  | 'expired'
  | 'closed';

export interface MysteryBoxEvent {
  readonly type: MysteryBoxEventType;
  /** Set for 'result' and 'pickedUp'. */
  readonly weaponId?: WeaponId;
}

/**
 * Generic weighted random selection. `lastId`/`repeatFactor` optionally
 * shrink the previous winner's slice of the wheel for one roll, so streaks
 * cool down without ever becoming impossible. `excludedId` removes one
 * weapon entirely, used to prevent the equipped weapon from being rolled.
 * Deterministic under an injected rng.
 */
export function pickWeighted(
  entries: readonly MysteryBoxEntry[],
  rng: () => number,
  lastId: WeaponId | null = null,
  repeatFactor = 1,
  excludedId: WeaponId | null = null,
): WeaponId {
  let total = 0;
  for (const entry of entries) {
    if (entry.weaponId === excludedId) continue;
    total += entry.weight * (entry.weaponId === lastId ? repeatFactor : 1);
  }
  if (total <= 0) throw new Error('pickWeighted needs at least one selectable entry');

  let roll = rng() * total;
  let fallback: WeaponId | null = null;
  for (const entry of entries) {
    if (entry.weaponId === excludedId) continue;
    const weight = entry.weight * (entry.weaponId === lastId ? repeatFactor : 1);
    if (weight <= 0) continue;
    fallback = entry.weaponId;
    roll -= weight;
    if (roll < 0) return entry.weaponId;
  }
  // Floating-point edge: a roll of exactly `total` lands on the last entry.
  return fallback!;
}

/**
 * Pure Mystery Box state machine: closed → opening → rolling →
 * awaitingPickup → closing → closed. No Three.js, no DOM — the view and
 * audio subscribe to pendingEvents, which keeps the whole flow (anti-spam,
 * pickup window, expiry) unit-testable with an injected rng.
 */
export class MysteryBoxMachine {
  readonly pendingEvents: MysteryBoxEvent[] = [];

  private phase: MysteryBoxPhase = 'closed';
  private timer = 0;
  private rollDuration = 0;
  private tickTimer = 0;
  private resultId: WeaponId | null = null;
  private displayId: WeaponId;
  private lastResult: WeaponId | null = null;
  private excludedResult: WeaponId | null = null;

  constructor(
    private readonly pool: readonly MysteryBoxEntry[],
    private readonly tuning: typeof MYSTERY_BOX_TUNING,
    private readonly rng: () => number = Math.random,
  ) {
    if (pool.length === 0) throw new Error('MysteryBoxMachine needs a non-empty pool');
    this.displayId = pool[0].weaponId;
  }

  get state(): MysteryBoxPhase {
    return this.phase;
  }

  /** The rolled weapon waiting for pickup; null in every other phase. */
  get result(): WeaponId | null {
    return this.resultId;
  }

  /** Weapon the view should show right now (cycles fast while rolling). */
  get displayWeapon(): WeaponId {
    return this.displayId;
  }

  /** True only while closed: one activation at a time, no E-spam exploits. */
  get canUse(): boolean {
    return this.phase === 'closed';
  }

  tryActivate(excludedWeaponId: WeaponId | null = null): boolean {
    if (this.phase !== 'closed') return false;
    this.excludedResult = excludedWeaponId;
    this.phase = 'opening';
    this.timer = this.tuning.openTime;
    this.pendingEvents.push({ type: 'opened' });
    return true;
  }

  /** Takes the floating result. Returns null unless the box is offering one. */
  tryPickup(): WeaponId | null {
    if (this.phase !== 'awaitingPickup' || this.resultId === null) return null;
    const id = this.resultId;
    this.resultId = null;
    this.lastResult = id;
    this.phase = 'closing';
    this.timer = this.tuning.closeTime;
    this.pendingEvents.push({ type: 'pickedUp', weaponId: id });
    return id;
  }

  update(dt: number): void {
    switch (this.phase) {
      case 'opening':
        this.timer -= dt;
        if (this.timer <= TIMER_EPSILON) {
          this.phase = 'rolling';
          this.rollDuration = this.tuning.revealTime - this.tuning.openTime;
          // Preserve frame overshoot so activation-to-reveal remains exactly configured.
          this.timer += this.rollDuration;
          this.tickTimer = 0;
        }
        break;
      case 'rolling': {
        this.tickTimer -= dt;
        if (this.tickTimer <= 0) {
          // Decelerating roulette: ticks space out as the roll winds down.
          const progress = 1 - Math.max(0, this.timer) / this.rollDuration;
          this.tickTimer = lerp(this.tuning.tickStartInterval, this.tuning.tickEndInterval, progress);
          this.advanceDisplay();
          this.pendingEvents.push({ type: 'rollTick' });
        }
        this.timer -= dt;
        if (this.timer <= TIMER_EPSILON) {
          this.resultId = pickWeighted(
            this.pool,
            this.rng,
            this.lastResult,
            this.tuning.repeatFactor,
            this.excludedResult,
          );
          this.displayId = this.resultId;
          this.phase = 'awaitingPickup';
          this.timer = this.tuning.pickupTime;
          this.pendingEvents.push({ type: 'result', weaponId: this.resultId });
        }
        break;
      }
      case 'awaitingPickup':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.lastResult = this.resultId;
          this.resultId = null;
          this.phase = 'closing';
          this.timer = this.tuning.closeTime;
          this.pendingEvents.push({ type: 'expired' });
        }
        break;
      case 'closing':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = 'closed';
          this.pendingEvents.push({ type: 'closed' });
        }
        break;
      default:
        break;
    }
  }

  /** Clean slate for a zombies restart. */
  reset(): void {
    this.phase = 'closed';
    this.timer = 0;
    this.rollDuration = 0;
    this.tickTimer = 0;
    this.resultId = null;
    this.lastResult = null;
    this.excludedResult = null;
    this.displayId = this.pool[0].weaponId;
    this.pendingEvents.length = 0;
  }

  clearEvents(): void {
    this.pendingEvents.length = 0;
  }

  /** Next weapon shown on the wheel; never the same one twice in a row. */
  private advanceDisplay(): void {
    if (this.pool.length === 1) return;
    const index = Math.min(this.pool.length - 1, Math.floor(this.rng() * this.pool.length));
    let next = this.pool[index].weaponId;
    if (next === this.displayId) next = this.pool[(index + 1) % this.pool.length].weaponId;
    this.displayId = next;
  }
}
