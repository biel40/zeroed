/**
 * Spawn point selection for the Zombies mode. Pure logic: given the player
 * position it picks a random spawn point far enough away so zombies always
 * "walk in" from the outskirts of the arena instead of popping into view.
 */

/** Fixed entry points around the open side of the range, as [x, z] pairs. */
export const SPAWN_POINTS: ReadonlyArray<readonly [number, number]> = [
  [-18, -34],
  [18, -34],
  [-14, -14],
  [14, -14],
  [0, -46],
  [-24, -20],
  [24, -20],
  [0, -28],
];

/** Never spawn closer than this to the player, in meters. */
export const MIN_PLAYER_DISTANCE = 10;

export class ZombieSpawner {
  constructor(
    private readonly rng: () => number = Math.random,
    private readonly spawnPoints: ReadonlyArray<readonly [number, number]> = SPAWN_POINTS,
  ) {}

  /**
   * Picks a random spawn point at least MIN_PLAYER_DISTANCE away from the
   * player. Falls back to the farthest point if none qualifies.
   */
  pick(playerX: number, playerZ: number): readonly [number, number] {
    let farthest = this.spawnPoints[0] ?? [0, 0];
    let farthestDistSq = -1;
    const candidates: Array<readonly [number, number]> = [];

    for (const point of this.spawnPoints) {
      const dx = point[0] - playerX;
      const dz = point[1] - playerZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > farthestDistSq) {
        farthestDistSq = distSq;
        farthest = point;
      }
      if (distSq >= MIN_PLAYER_DISTANCE * MIN_PLAYER_DISTANCE) candidates.push(point);
    }

    if (candidates.length === 0) return farthest;
    return candidates[Math.floor(this.rng() * candidates.length)];
  }
}
