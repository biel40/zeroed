import { describe, expect, it } from 'vitest';
import type { Zombie } from '../src/zombies/Zombie';
import { ZombiePool } from '../src/zombies/ZombiePool';
import { MAX_ALIVE } from '../src/zombies/ZombieConfig';

/** The pool only stores references, so tests use plain stubs. */
function makeStubPool(size: number): ZombiePool {
  let created = 0;
  return new ZombiePool(size, () => ({ id: created++ }) as unknown as Zombie);
}

describe('ZombiePool', () => {
  it('creates every zombie up front', () => {
    const pool = makeStubPool(MAX_ALIVE);
    expect(pool.freeCount).toBe(MAX_ALIVE);
    expect(pool.activeCount).toBe(0);
  });

  it('hands out zombies until the cap, then returns null', () => {
    const pool = makeStubPool(3);
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).toBeNull();
    expect(pool.activeCount).toBe(3);
  });

  it('supports the hard cap of 24 simultaneous zombies', () => {
    const pool = makeStubPool(MAX_ALIVE);
    const acquired: Zombie[] = [];
    for (let i = 0; i < MAX_ALIVE + 10; i++) {
      const zombie = pool.acquire();
      if (zombie) acquired.push(zombie);
    }
    expect(acquired).toHaveLength(MAX_ALIVE);
    expect(pool.acquire()).toBeNull();
  });

  it('recycles released zombies', () => {
    const pool = makeStubPool(2);
    const a = pool.acquire();
    const b = pool.acquire();
    expect(pool.acquire()).toBeNull();
    pool.release(a as Zombie);
    expect(pool.activeCount).toBe(1);
    const c = pool.acquire();
    expect(c).toBe(a);
    pool.release(b as Zombie);
    pool.release(c as Zombie);
    expect(pool.freeCount).toBe(2);
  });

  it('ignores double releases', () => {
    const pool = makeStubPool(1);
    const zombie = pool.acquire() as Zombie;
    pool.release(zombie);
    pool.release(zombie);
    expect(pool.freeCount).toBe(1);
    expect(pool.activeCount).toBe(0);
  });

  it('releaseAll empties the active set (game over / restart)', () => {
    const pool = makeStubPool(4);
    pool.acquire();
    pool.acquire();
    pool.acquire();
    pool.releaseAll();
    expect(pool.activeCount).toBe(0);
    expect(pool.freeCount).toBe(4);
  });
});
