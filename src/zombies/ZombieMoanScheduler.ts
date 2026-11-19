import type { ZombieState } from './Zombie';

const FIRST_MOAN_DELAY = 0.6;
const MOAN_MIN_DELAY = 1.7;
const MOAN_DELAY_SPREAD = 0.9;
const RECHECK_DELAY = 0.25;
const MOAN_RADIUS = 18;
const ALTERNATE_REACH = 4;

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface MoanCandidate {
  readonly position: Point;
  readonly state: ZombieState;
  readonly isAlive: boolean;
}

/** One voice at a time, with priority for threats the listener can actually hear. */
export class ZombieMoanScheduler {
  private remaining = FIRST_MOAN_DELAY;
  private last: MoanCandidate | null = null;

  public constructor(private readonly random: () => number = Math.random) {}

  public update<T extends MoanCandidate>(dt: number, zombies: ReadonlySet<T>, listener: Point): T | null {
    if (zombies.size === 0) this.reset();
    if (dt <= 0 || zombies.size === 0) return null;
    this.remaining -= dt;
    if (this.remaining > 0) return null;

    let closest: T | null = null;
    let alternate: T | null = null;
    let closestSquared = MOAN_RADIUS ** 2;
    let alternateSquared = closestSquared;
    for (const zombie of zombies) {
      if (!zombie.isAlive || zombie.state === 'spawn') continue;
      const { x, y, z } = zombie.position;
      const distanceSquared = (x - listener.x) ** 2 + (y - listener.y) ** 2 + (z - listener.z) ** 2;
      if (distanceSquared < closestSquared) {
        closest = zombie;
        closestSquared = distanceSquared;
      }
      if (zombie !== this.last && distanceSquared < alternateSquared) {
        alternate = zombie;
        alternateSquared = distanceSquared;
      }
    }
    if (!closest) {
      this.remaining = RECHECK_DELAY;
      return null;
    }
    const useAlternate = closest === this.last && alternate !== null
      && alternateSquared <= (Math.sqrt(closestSquared) + ALTERNATE_REACH) ** 2;
    const chosen = useAlternate ? alternate : closest;
    this.last = chosen;
    this.remaining = MOAN_MIN_DELAY + this.random() * MOAN_DELAY_SPREAD;
    return chosen;
  }

  public reset(): void {
    this.remaining = FIRST_MOAN_DELAY;
    this.last = null;
  }
}
