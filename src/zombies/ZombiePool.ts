import type { Zombie } from './Zombie';
import type { ZombieModelId } from './ZombieConfig';

/**
 * Model-aware object pool. Every visual reserve is created up front, while
 * maxActive remains the single population cap across all models.
 */
export class ZombiePool {
  private readonly free: Zombie[] = [];
  private readonly active = new Set<Zombie>();

  constructor(
    count: number,
    factory: (index: number) => Zombie,
    private readonly maxActive = count,
  ) {
    for (let i = 0; i < count; i++) this.free.push(factory(i));
  }

  /**
   * Returns the requested fixed visual model without exceeding the global cap.
   * `prefer` picks among the free bodies of that model (a rolled look); when
   * none matches, any free body of the model is returned.
   */
  acquire(modelId?: ZombieModelId, prefer?: (zombie: Zombie) => boolean): Zombie | null {
    if (this.active.size >= this.maxActive) return null;
    let index = prefer ? this.lastFreeIndex(modelId, prefer) : -1;
    if (index < 0) index = this.lastFreeIndex(modelId);
    if (index < 0) return null;
    const zombie = this.free[index];
    const last = this.free.pop() as Zombie;
    if (index < this.free.length) this.free[index] = last;
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

  freeCountFor(modelId: ZombieModelId): number {
    let count = 0;
    for (const zombie of this.free) if (zombie.visual?.modelId === modelId) count++;
    return count;
  }

  /** Live view of the active zombies; do not mutate while iterating. */
  get actives(): ReadonlySet<Zombie> {
    return this.active;
  }

  /** Most recently freed body of `modelId` (any model when omitted) that passes `filter`; -1 when none. */
  private lastFreeIndex(modelId?: ZombieModelId, filter?: (zombie: Zombie) => boolean): number {
    for (let index = this.free.length - 1; index >= 0; index--) {
      const zombie = this.free[index];
      if (modelId && zombie.visual?.modelId !== modelId) continue;
      if (!filter || filter(zombie)) return index;
    }
    return -1;
  }
}
