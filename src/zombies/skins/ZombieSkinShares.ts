import type { ZombieEyeColors } from '../ZombieVisual';
import type { ZombieSkinId } from './ZombieSkinCatalog';

/**
 * One look of a weighted horde (`ZombieArena.zombieSkinShares`): the relative
 * chance that a spawned walker wears it. Appearance only; the type, health,
 * speed and damage of the zombie are rolled elsewhere.
 */
export interface ZombieSkinShare {
  /** The walker skin, or null for the plain walker asset. */
  readonly skin: ZombieSkinId | null;
  readonly weight: number;
}

/**
 * Walkers rising on one floor wear these looks instead of the horde's and
 * keep them wherever they chase (`ZombieArena.zombieFloorLook`). They come
 * from a reserve of bodies of their own, as large as the walker reserve, so
 * neither look ever stands in for the other. Appearance only.
 */
export interface ZombieFloorLook {
  readonly floor: number;
  readonly skinShares: readonly ZombieSkinShare[];
  /** Eye colors of these walkers; omitted keeps the map's. */
  readonly eyes?: ZombieEyeColors;
}

/** Index of the share `roll` (0..1) falls in, by cumulative weight. */
export function pickShare(weights: readonly number[], roll: number): number {
  let total = 0;
  for (const weight of weights) total += Math.max(0, weight);
  let threshold = roll * total;
  let last = 0;
  for (let index = 0; index < weights.length; index++) {
    const weight = Math.max(0, weights[index]);
    if (weight <= 0) continue;
    last = index;
    if (threshold < weight) return index;
    threshold -= weight;
  }
  return last;
}

/**
 * Share index worn by each of `slots` pooled bodies: largest-remainder
 * apportionment of the weights, with at least one body per share when there
 * are enough slots, so every look can be rolled. Bodies are interleaved
 * (a smooth weighted round robin) rather than grouped by look.
 */
export function apportionShares(weights: readonly number[], slots: number): number[] {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  const counts = weights.map(() => 0);
  if (total <= 0 || slots <= 0) return [];
  const quotas = weights.map((weight) => (Math.max(0, weight) / total) * slots);
  quotas.forEach((quota, index) => { counts[index] = Math.floor(quota); });
  // A share rounded down to no body gets one anyway, which uses up its remainder.
  const guaranteed = new Set<number>();
  if (weights.filter((weight) => weight > 0).length <= slots) {
    weights.forEach((weight, index) => {
      if (weight > 0 && counts[index] === 0) {
        counts[index] = 1;
        guaranteed.add(index);
      }
    });
  }
  // Trim any guaranteed bodies above the slot count from the largest groups.
  let assigned = counts.reduce((sum, count) => sum + count, 0);
  while (assigned > slots) {
    const largest = counts.indexOf(Math.max(...counts));
    counts[largest]--;
    assigned--;
  }
  const byRemainder = quotas.map((quota, index) => ({ index, remainder: quota - Math.floor(quota) }))
    .filter(({ index }) => weights[index] > 0 && !guaranteed.has(index))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (let next = 0; assigned < slots; next = (next + 1) % byRemainder.length, assigned++) {
    counts[byRemainder[next].index]++;
  }

  const order: number[] = [];
  const credit = counts.map(() => 0);
  for (let slot = 0; slot < slots; slot++) {
    let best = -1;
    for (let index = 0; index < counts.length; index++) {
      credit[index] += counts[index];
      if (counts[index] > 0 && (best < 0 || credit[index] > credit[best])) best = index;
    }
    credit[best] -= slots;
    order.push(best);
  }
  return order;
}
