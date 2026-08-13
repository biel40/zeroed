import { lerp } from '../utils/math';
import type { WeaponId } from '../weapons/WeaponTypes';

/** One weapon on the Mystery Box wheel; weights are relative, not percent. */
export interface MysteryBoxEntry {
  readonly weaponId: WeaponId;
  readonly weight: number;
}

/**
 * The wheel. The M1911 is deliberately NOT here: it is the starting pistol,
 * not a reward. The Ray Gun is the rare pull — lower its weight (e.g. to
 * 5–7 % of the total) here, never by touching the selection logic.
 */
export const MYSTERY_BOX_POOL: readonly MysteryBoxEntry[] = [
  { weaponId: 'm4a1', weight: 25 },
  { weaponId: 'ak47', weight: 25 },
  { weaponId: 'm60', weight: 20 },
  { weaponId: 'l96', weight: 20 },
  { weaponId: 'raygun', weight: 10 },
];

/** Timings (seconds) and behaviour knobs of the box sequence. */
export const MYSTERY_BOX_TUNING = {
  /** Lid swing before the roll starts. */
  openTime: 0.12,
  /**
   * Fallback roll window, used only while the opening theme is not decoded
   * yet (or missing entirely). Once the real MP3 duration is known the roll
   * is timed by `revealLeadTime` instead — see computeRollDuration.
   */
  rollTimeMin: 5.88,
  rollTimeMax: 5.88,
  /** The weapon reveal lands this many seconds before the opening theme ends. */
  revealLeadTime: 1,
  /**
   * Lower bound for the roll, even if the decoded clip is oddly short: the
   * roulette needs a minimum run to read as a roulette at all.
   */
  rollTimeFloor: 2,
  /** How long the result floats before the box takes it back. */
  pickupTime: 10,
  /** Lid swing back down. */
  closeTime: 0.6,
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

/** Where the crate sits in the zombies arena and how interaction reaches. */
export const MYSTERY_BOX_PLACEMENT = {
  /**
   * Rear-left corner of the platform, by the back wall: a short walk from
   * the player spawn, clear of the firing lanes (x = -3/0/3) and off the
   * zombies' main approach corridor toward the bench — the old spot
   * (3.2, 1.5) sat right on that corridor, just behind the bench.
   */
  position: { x: -5.6, y: 0, z: 6.6 },
  /** Rotated to face the platform center, so the glowing seams read on approach. */
  yaw: -1.17,
  /** Maximum distance from the box center to use it. */
  useRange: 2.4,
  /** Minimum look-direction dot product: rough aim at the box, no exact ray. */
  lookDotMin: 0.5,
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
 * cool down without ever becoming impossible. Deterministic under an
 * injected rng.
 */
export function pickWeighted(
  entries: readonly MysteryBoxEntry[],
  rng: () => number,
  lastId: WeaponId | null = null,
  repeatFactor = 1,
): WeaponId {
  let total = 0;
  for (const entry of entries) {
    total += entry.weight * (entry.weaponId === lastId ? repeatFactor : 1);
  }
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= entry.weight * (entry.weaponId === lastId ? repeatFactor : 1);
    if (roll < 0) return entry.weaponId;
  }
  // Floating-point edge: a roll of exactly `total` lands on the last entry.
  return entries[entries.length - 1].weaponId;
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

  constructor(
    private readonly pool: readonly MysteryBoxEntry[],
    private readonly tuning: typeof MYSTERY_BOX_TUNING,
    private readonly rng: () => number = Math.random,
    /**
     * Duration of the decoded opening theme in seconds, or null while the
     * asset is still loading. Read fresh at every roll start, so a clip
     * that finishes decoding mid-session syncs from the next activation.
     */
    private readonly openAudioDuration: () => number | null = () => null,
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

  tryActivate(): boolean {
    if (this.phase !== 'closed') return false;
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
        if (this.timer <= 0) {
          this.phase = 'rolling';
          this.rollDuration = this.computeRollDuration();
          this.timer = this.rollDuration;
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
        if (this.timer <= 0) {
          this.resultId = pickWeighted(this.pool, this.rng, this.lastResult, this.tuning.repeatFactor);
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
    this.displayId = this.pool[0].weaponId;
    this.pendingEvents.length = 0;
  }

  clearEvents(): void {
    this.pendingEvents.length = 0;
  }

  /**
   * Roll length for this activation. With the opening theme decoded, the
   * reveal (openTime + roll) lands exactly `revealLeadTime` before the
   * audio ends; without it, the fixed fallback window keeps the show
   * running. The floor protects the roulette from degenerate clips.
   */
  private computeRollDuration(): number {
    const audioDuration = this.openAudioDuration();
    if (audioDuration !== null && Number.isFinite(audioDuration) && audioDuration > 0) {
      return Math.max(
        this.tuning.rollTimeFloor,
        audioDuration - this.tuning.revealLeadTime - this.tuning.openTime,
      );
    }
    return lerp(this.tuning.rollTimeMin, this.tuning.rollTimeMax, this.rng());
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
