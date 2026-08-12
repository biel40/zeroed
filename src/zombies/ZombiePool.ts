import type { Zombie } from './Zombie';

/**
 * Fixed-size object pool. Zombies are created once up front and then reused
 * forever — no allocations during rounds no matter how long the session
 * runs. The pool size is the hard alive cap: when empty, acquire() returns
 * null instead of ever creating a 25th zombie.
 */
export class ZombiePool {
  private readonly free: Zombie[] = [];
  private readonly active = new Set<Zombie>();

  constructor(count: number, factory: () => Zombie) {
    for (let i = 0; i < count; i++) this.free.push(factory());
  }

  /** Returns a zombie to reuse, or null when the cap is already reached. */
  acquire(): Zombie | null {
    const zombie = this.free.pop();
    if (!zombie) return null;
    this.active.add(zombie);
    return zombie;
  }

  /** Idempotent: releasing a zombie that is not active is a no-op. */
  release(zombie: Zombie): void {
    if (!this.active.delete(zombie)) return;
    this.free.push(zombie);
  }

  releaseAll(): void {
    for (const zombie of this.active) this.free.push(zombie);
    this.active.clear();
  }

  get activeCount(): number {
    return this.active.size;
  }

  get freeCount(): number {
    return this.free.length;
  }

  /** Live view of the active zombies; do not mutate while iterating. */
  get actives(): ReadonlySet<Zombie> {
    return this.active;
  }
}
