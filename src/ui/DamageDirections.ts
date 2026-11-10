/** Indicators shown at once; a further attacker replaces the oldest. */
export const DAMAGE_DIRECTION_SLOTS = 4;
/** Seconds an indicator stays on screen after the last hit from its source. */
export const DAMAGE_DIRECTION_DURATION = 1.4;
/** It holds full strength this long, then fades out over the rest. */
const HOLD = 0.35;
/** Hits from sources closer than this (m) refresh the same indicator instead of stacking. */
const MERGE_DISTANCE = 0.9;

export interface DamageDirection {
  /** World position of the attacker at its latest hit. */
  x: number;
  z: number;
  /** Seconds since its latest hit; Infinity when the slot is free. */
  age: number;
}

/**
 * Screen angle (radians, clockwise from the top of the screen) towards a
 * world source, for a player at (x, z) looking along `yaw`: 0 dead ahead,
 * π/2 to the right, π behind. Uses the same yaw convention as the player rig.
 */
export function damageDirectionAngle(x: number, z: number, yaw: number, sourceX: number, sourceZ: number): number {
  const dx = sourceX - x;
  const dz = sourceZ - z;
  const ahead = -Math.sin(yaw) * dx - Math.cos(yaw) * dz;
  const right = Math.cos(yaw) * dx - Math.sin(yaw) * dz;
  return Math.atan2(right, ahead);
}

/** Indicator opacity for an age: full, then a smooth fade to zero. */
export function damageDirectionOpacity(age: number): number {
  if (age <= HOLD) return 1;
  const t = Math.min(1, (age - HOLD) / (DAMAGE_DIRECTION_DURATION - HOLD));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Where recent hits came from: a fixed pool of slots, so repeated hits
 * allocate nothing. A source that keeps hitting refreshes its own slot.
 */
export class DamageDirectionTracker {
  public readonly entries: readonly DamageDirection[];
  private live = 0;

  public constructor() {
    const entries: DamageDirection[] = [];
    for (let slot = 0; slot < DAMAGE_DIRECTION_SLOTS; slot++) entries.push({ x: 0, z: 0, age: Infinity });
    this.entries = entries;
  }

  /** True while any indicator is visible. */
  public get active(): boolean {
    return this.live > 0;
  }

  public add(x: number, z: number): void {
    const entries = this.entries as DamageDirection[];
    let target: DamageDirection | null = null;
    for (const entry of entries) {
      if (entry.age < DAMAGE_DIRECTION_DURATION && Math.hypot(entry.x - x, entry.z - z) < MERGE_DISTANCE) {
        target = entry;
        break;
      }
    }
    if (!target) {
      target = entries[0];
      for (const entry of entries) if (entry.age > target.age) target = entry;
    }
    if (target.age >= DAMAGE_DIRECTION_DURATION) this.live++;
    target.x = x;
    target.z = z;
    target.age = 0;
  }

  public update(dt: number): void {
    if (this.live === 0) return;
    for (const entry of this.entries as DamageDirection[]) {
      if (entry.age >= DAMAGE_DIRECTION_DURATION) continue;
      entry.age += dt;
      if (entry.age >= DAMAGE_DIRECTION_DURATION) {
        entry.age = Infinity;
        this.live--;
      }
    }
  }

  public clear(): void {
    for (const entry of this.entries as DamageDirection[]) entry.age = Infinity;
    this.live = 0;
  }
}
