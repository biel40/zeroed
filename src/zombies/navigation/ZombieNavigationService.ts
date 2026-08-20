import { NavigationGrid } from './NavigationGrid';
import type {
  NavigationBoundsData,
  NavigationRect,
  NavWaypoint,
} from './NavigationGrid';

/** Walkable envelope of one floor, as declared by the map's navigationBounds. */
export interface NavigationFloorData {
  readonly floor: number;
  readonly bounds: NavigationBoundsData;
  /** Feet height of the walking surface on this floor (default 0). */
  readonly baseY?: number;
}

/**
 * Minimal AABB shape consumed by the service. Callers flatten their collider
 * boxes (e.g. THREE.Box3) into this plain data so the navigation layer never
 * depends on Three.js.
 */
export interface NavigationVolume {
  readonly minX: number;
  readonly minY: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly maxZ: number;
}

/**
 * A volume blocks a floor only while it overlaps the walking body's vertical
 * band. Mirrors the predicate in ZombieManager.findObstacle so the grid can
 * never disagree with physical collision.
 */
const BAND_BOTTOM = 0.05;
const BAND_TOP = 1.8;

/**
 * Central map navigation for zombies: one walkability grid per floor, built
 * purely from map data (navigation bounds + collider volumes). Doors are not
 * special-cased anywhere — a closed door is a collider and blocks its cells;
 * when the map opens it, the collider disappears, `rebuild` runs again and
 * `version` invalidates every cached route. Path queries are budgeted by the
 * caller (ZombieNavigationManager side), never per frame per zombie.
 */
export class ZombieNavigationService {
  private readonly grids = new Map<number, NavigationGrid>();
  private currentVersion = 0;

  constructor(
    private readonly cellSize = 0.35,
    private readonly bodyRadius = 0.42,
  ) {}

  /** Bumped on every rebuild; consumers treat it as the topology revision. */
  public get version(): number {
    return this.currentVersion;
  }

  /** Rebuilds every floor grid from the current map topology. */
  public rebuild(
    floors: readonly NavigationFloorData[],
    obstacles: readonly NavigationVolume[],
  ): void {
    this.currentVersion++;
    this.grids.clear();
    for (const floorData of floors) {
      const baseY = floorData.baseY ?? 0;
      const rects: NavigationRect[] = [];
      for (const obstacle of obstacles) {
        if (obstacle.maxY <= baseY + BAND_BOTTOM || obstacle.minY >= baseY + BAND_TOP) continue;
        rects.push(obstacle);
      }
      this.grids.set(
        floorData.floor,
        new NavigationGrid(floorData.bounds, rects, this.cellSize, this.bodyRadius),
      );
    }
  }

  /** True when the point lies on a declared walkable floor envelope. */
  public contains(floor: number, x: number, z: number): boolean {
    return this.grids.get(floor)?.contains(x, z) ?? false;
  }

  /** Sampled obstacle clearance along the segment; false without a grid. */
  public hasLineOfSight(
    floor: number,
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
  ): boolean {
    return this.grids.get(floor)?.hasLineOfSight(fromX, fromZ, toX, toZ) ?? false;
  }

  /** Nearest walkable point, or null when the area is fully blocked. */
  public closestWalkable(floor: number, x: number, z: number): NavWaypoint | null {
    return this.grids.get(floor)?.closestWalkable(x, z) ?? null;
  }

  /**
   * Waypoints from start to goal with consecutive segments guaranteed clear,
   * or null when no route exists on this floor (e.g. every door is closed).
   */
  public findPath(
    floor: number,
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number,
  ): NavWaypoint[] | null {
    return this.grids.get(floor)?.findPath(fromX, fromZ, toX, toZ) ?? null;
  }
}
