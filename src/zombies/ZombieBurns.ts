import type { ZombieKillSource } from './ZombieDeath';

/** Seconds between two bites of a burn: steady enough to read, few enough damage events. */
export const BURN_TICK_SECONDS = 0.25;

/** What can burn: anything that may die while its burn runs. */
export interface Burnable {
  readonly isAlive: boolean;
}

interface Burn {
  remaining: number;
  damagePerSecond: number;
  source: ZombieKillSource;
  /** Seconds accumulated towards the next bite. */
  sinceTick: number;
}

/**
 * Who is burning and for how long (ФАКЕЛ-33 afterburn). Pure state: the
 * owner decides how a bite is dealt. A fresh ignition refreshes the burn
 * (never stacks it); the dead drop out at once, so no bite ever lands on a
 * corpse. Allocation free while burns tick.
 */
export class ZombieBurns<T extends Burnable> {
  private readonly burns = new Map<T, Burn>();

  get count(): number {
    return this.burns.size;
  }

  isBurning(target: T): boolean {
    return this.burns.has(target);
  }

  /** Sets `target` burning for `seconds`; true when it was not burning yet (a fresh ignition). */
  ignite(target: T, seconds: number, damagePerSecond: number, source: ZombieKillSource): boolean {
    if (!target.isAlive || seconds <= 0) return false;
    const burn = this.burns.get(target);
    if (burn) {
      burn.remaining = Math.max(burn.remaining, seconds);
      burn.damagePerSecond = Math.max(burn.damagePerSecond, damagePerSecond);
      burn.source = source;
      return false;
    }
    this.burns.set(target, { remaining: seconds, damagePerSecond, source, sinceTick: 0 });
    return true;
  }

  /** Advances every burn and deals its bites through `bite(target, damage, source)`. */
  update(dt: number, bite: (target: T, damage: number, source: ZombieKillSource) => void): void {
    for (const [target, burn] of this.burns) {
      if (!target.isAlive) {
        this.burns.delete(target);
        continue;
      }
      const burnt = Math.min(dt, burn.remaining);
      burn.remaining -= burnt;
      burn.sinceTick += burnt;
      while (burn.sinceTick >= BURN_TICK_SECONDS && target.isAlive) {
        burn.sinceTick -= BURN_TICK_SECONDS;
        bite(target, burn.damagePerSecond * BURN_TICK_SECONDS, burn.source);
      }
      if (burn.remaining > 0 && target.isAlive) continue;
      // The last embers: whatever is left of the final bite, so a burn deals exactly its rate times its length.
      if (target.isAlive && burn.sinceTick > 1e-6) bite(target, burn.damagePerSecond * burn.sinceTick, burn.source);
      this.burns.delete(target);
    }
  }

  reset(): void {
    this.burns.clear();
  }
}
