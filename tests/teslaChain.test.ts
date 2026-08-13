import { describe, expect, it } from 'vitest';
import {
  CHAIN_MAX_TARGETS,
  CHAIN_RADIUS,
  CHAIN_ZAP_DAMAGE,
  selectChainTargets,
  TESLA_UNLOCK_KILLS,
  type ChainCandidate,
} from '../src/zombies/ZombieConfig';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';

/**
 * Tesla chain-lightning selection: pure math over candidate positions, no
 * Three.js. The rules pinned here come straight from the design contract:
 *  - the directly-hit zombie is always first,
 *  - the arc jumps to the NEAREST not-yet-hit neighbor within the radius,
 *  - at most CHAIN_MAX_TARGETS (10) zombies per shot,
 *  - a zombie is never struck twice in the same chain (visited set),
 *  - far stragglers are not worth a hop.
 */
function candidate(id: number, x: number, z: number, alive = true): ChainCandidate {
  return { id, x, z, alive };
}

describe('selectChainTargets', () => {
  it('returns only the impacted zombie when nobody else is near', () => {
    const chain = selectChainTargets(candidate(1, 0, 0), [candidate(1, 0, 0), candidate(2, 30, 0)]);
    expect(chain).toEqual([1]);
  });

  it('chains to the nearest unvisited zombie repeatedly', () => {
    // String of zombies 3 m apart: the arc must walk the string in order,
    // never skip ahead to a farther one while a nearer hop exists.
    const zombies = [
      candidate(1, 0, 0),
      candidate(2, 3, 0),
      candidate(3, 6, 0),
      candidate(4, 9, 0),
      candidate(5, 30, 0), // out of radius of #4: the chain stops at 4
    ];
    const chain = selectChainTargets(zombies[0], zombies);
    expect(chain).toEqual([1, 2, 3, 4]);
  });

  it('caps the chain at CHAIN_MAX_TARGETS even in a dense horde', () => {
    expect(CHAIN_MAX_TARGETS).toBe(10);
    const zombies = [candidate(0, 0, 0)];
    for (let i = 1; i <= 20; i++) zombies.push(candidate(i, i * 2, 0));
    const chain = selectChainTargets(zombies[0], zombies);
    expect(chain).toHaveLength(CHAIN_MAX_TARGETS);
  });

  it('never strikes the same zombie twice when the arc folds back', () => {
    // Triangle: 1 → 2 → 3, and 3 is nearest to 1 again. The visited set
    // must stop the fold-back instead of re-zapping 1.
    const zombies = [
      candidate(1, 0, 0),
      candidate(2, 2, 0),
      candidate(3, 1, 1.5),
    ];
    const chain = selectChainTargets(zombies[0], zombies);
    expect(chain).toEqual([1, 3, 2]); // nearest-first from each tip
    expect(new Set(chain).size).toBe(chain.length);
  });

  it('skips dead zombies: the arc only jumps between the living', () => {
    const zombies = [
      candidate(1, 0, 0),
      candidate(2, 2, 0, false), // corpse: not a valid hop
      candidate(3, 4, 0),
    ];
    const chain = selectChainTargets(zombies[0], zombies);
    expect(chain).toEqual([1, 3]);
  });

  it('respects the chain radius boundary', () => {
    const zombies = [
      candidate(1, 0, 0),
      candidate(2, CHAIN_RADIUS - 0.1, 0), // just inside
      candidate(3, CHAIN_RADIUS * 2, 0), // unreachable from both #1 and #2
    ];
    const chain = selectChainTargets(zombies[0], zombies);
    expect(chain).toEqual([1, 2]);
  });
});

describe('Tesla weapon tuning contract', () => {
  it('unlocks at exactly 100 kills', () => {
    expect(TESLA_UNLOCK_KILLS).toBe(100);
  });

  it('is an energy weapon (visible bolt path) with limited ammunition', () => {
    const def = WEAPON_DEFINITIONS.tesla;
    expect(def.energy).toBeDefined();
    expect(def.reserveAmmo).toBeDefined();
    expect(def.reserveAmmo).toBeGreaterThan(0);
    expect(def.magazineSize).toBeGreaterThan(0);
  });

  it('hits very hard: the direct zap alone drops a round-1 walker', () => {
    const def = WEAPON_DEFINITIONS.tesla;
    expect(def.damage).toBeGreaterThanOrEqual(CHAIN_ZAP_DAMAGE);
    expect(CHAIN_ZAP_DAMAGE).toBeGreaterThanOrEqual(100);
  });

  it('keeps the electric identity: blue-white arc color', () => {
    expect(WEAPON_DEFINITIONS.tesla.energy?.color).toBe(0x7fd4ff);
  });
});
