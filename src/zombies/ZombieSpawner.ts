/**
 * Spawn point selection for the Zombies mode. Pure logic: given the player
 * position it picks a random spawn point far enough away so zombies always
 * "walk in" from the outskirts of the arena instead of popping into view.
 */

/** Legacy fallback for isolated spawn simulations; playable maps supply their own points. */
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

export interface ZombieSpawnPoint {
  readonly x: number;
  readonly z: number;
  /** Logical floor the zombie appears on; omitted is the ground floor (0). */
  readonly floor?: number;
  /** Optional entry assigned by an arena barrier. */
  readonly barrierId?: string;
  readonly approachX?: number;
  readonly approachZ?: number;
  readonly breachX?: number;
  readonly breachZ?: number;
  readonly exterior?: boolean;
}

export type ZombieSpawnDefinition = readonly [number, number] | ZombieSpawnPoint;

function normalizeSpawn(point: ZombieSpawnDefinition): ZombieSpawnPoint {
  return Array.isArray(point)
    ? { x: point[0], z: point[1] }
    : point as ZombieSpawnPoint;
}

export function spawnFloor(point: ZombieSpawnPoint): number {
  return point.floor ?? 0;
}

export class ZombieSpawner {
  constructor(
    private readonly rng: () => number = Math.random,
    private readonly spawnPoints: ReadonlyArray<ZombieSpawnDefinition> = SPAWN_POINTS,
  ) {}

  /** Normalized map-owned points used by validated spawn/recovery placement. */
  get points(): readonly ZombieSpawnPoint[] {
    return this.spawnPoints.map(normalizeSpawn);
  }

  /**
   * Picks a random spawn point at least MIN_PLAYER_DISTANCE away from the
   * player. Falls back to the farthest point if none qualifies.
   */
  pick(playerX: number, playerZ: number): readonly [number, number] {
    const point = this.pickSpawn(playerX, playerZ);
    return [point.x, point.z];
  }

  /**
   * Metadata-preserving selection used by routed indoor maps. With
   * `playerFloor`, distant spawns on that floor win when there are any, so a
   * map with several floors sends its dead from the player's own level;
   * otherwise any distant spawn is fair, as on single-floor maps.
   */
  pickSpawn(playerX: number, playerZ: number, playerFloor?: number): ZombieSpawnPoint {
    let farthest = normalizeSpawn(this.spawnPoints[0] ?? [0, 0]);
    let farthestDistSq = -1;
    const candidates: ZombieSpawnPoint[] = [];
    const sameFloor: ZombieSpawnPoint[] = [];

    for (const definition of this.spawnPoints) {
      const point = normalizeSpawn(definition);
      const dx = point.x - playerX;
      const dz = point.z - playerZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > farthestDistSq) {
        farthestDistSq = distSq;
        farthest = point;
      }
      if (distSq < MIN_PLAYER_DISTANCE * MIN_PLAYER_DISTANCE) continue;
      candidates.push(point);
      if (playerFloor !== undefined && spawnFloor(point) === playerFloor) sameFloor.push(point);
    }

    const pool = sameFloor.length > 0 ? sameFloor : candidates;
    if (pool.length === 0) return farthest;
    return pool[Math.floor(this.rng() * pool.length)];
  }
}
