import { describe, expect, it } from 'vitest';
import { ZombieNavigationService } from '../src/zombies/navigation/ZombieNavigationService';
import type {
  NavigationFloorData,
  NavigationVolume,
} from '../src/zombies/navigation/ZombieNavigationService';

const CELL = 0.35;
const BODY = 0.42;

function makeService(): ZombieNavigationService {
  return new ZombieNavigationService(CELL, BODY);
}

/** Room-sized bounds: 16 m x 16 m. */
const BOUNDS = { minX: -8, maxX: 8, minZ: -8, maxZ: 8 } as const;
const FLOORS: readonly NavigationFloorData[] = [{ floor: 0, bounds: BOUNDS, baseY: 0 }];

/** Axis-aligned wall volume, body-height. */
function wall(minX: number, maxX: number, minZ: number, maxZ: number, minY = 0, maxY = 2.3): NavigationVolume {
  return { minX, maxX, minZ, maxZ, minY, maxY };
}

/** The wall dividing two rooms at z = 0, with an optional door gap at |x| < 1. */
function dividingWall(withGap: boolean): NavigationVolume[] {
  if (!withGap) return [wall(-8, 8, -0.15, 0.15)];
  return [wall(-8, -1, -0.15, 0.15), wall(1, 8, -0.15, 0.15)];
}

/** The closed door leaf filling the gap of dividingWall. */
function doorLeaf(): NavigationVolume {
  return wall(-1, 1, -0.15, 0.15);
}

/** X at which the segment a->b crosses z = 0 (null when it does not cross). */
function crossingX(a: { x: number; z: number }, b: { x: number; z: number }): number | null {
  if ((a.z < 0) === (b.z < 0)) return null;
  const t = a.z / (a.z - b.z);
  return a.x + (b.x - a.x) * t;
}

describe('ZombieNavigationService', () => {
  it('returns a direct path when the straight line is navigable', () => {
    const service = makeService();
    service.rebuild(FLOORS, []);

    const path = service.findPath(0, -4, -4, 4, -4);

    expect(path).not.toBeNull();
    expect(path!.length).toBeLessThanOrEqual(2);
    expect(service.hasLineOfSight(0, -4, -4, path![path!.length - 1].x, path![path!.length - 1].z)).toBe(true);
  });

  it('routes through the only door gap instead of through the wall', () => {
    const service = makeService();
    service.rebuild(FLOORS, dividingWall(true));

    expect(service.hasLineOfSight(0, -4, -4, -4, 4)).toBe(false);
    const path = service.findPath(0, -4, -4, -4, 4);

    expect(path).not.toBeNull();
    // The route must cross z = 0 inside the door channel (|x| < 1), never
    // through a wall segment.
    let previous = { x: -4, z: -4 };
    let crossed: number | null = null;
    for (const waypoint of path!) {
      const at = crossingX(previous, waypoint);
      if (at !== null) crossed = at;
      previous = waypoint;
    }
    expect(crossed).not.toBeNull();
    expect(Math.abs(crossed!)).toBeLessThan(1);
  });

  it('keeps every consecutive waypoint segment clear of obstacles (no corner cutting)', () => {
    const service = makeService();
    // Tiny post right on the diagonal: greedy smoothing must not shave it.
    service.rebuild(FLOORS, [wall(0.55, 0.75, 0.55, 0.75)]);

    const path = service.findPath(0, 0, 0, 2.1, 2.1);

    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    let previous = { x: 0, z: 0 };
    for (const waypoint of path!) {
      expect(service.hasLineOfSight(0, previous.x, previous.z, waypoint.x, waypoint.z)).toBe(true);
      previous = waypoint;
    }
  });

  it('returns null while the only door is closed, and a path once it opens', () => {
    const service = makeService();
    service.rebuild(FLOORS, [...dividingWall(true), doorLeaf()]);
    const closedVersion = service.version;

    expect(service.findPath(0, -4, -4, -4, 4)).toBeNull();

    // Door opens: the leaf disappears from the map colliders and the service
    // is rebuilt — exactly what registerColliders triggers in production.
    service.rebuild(FLOORS, dividingWall(true));

    expect(service.version).toBeGreaterThan(closedVersion);
    expect(service.findPath(0, -4, -4, -4, 4)).not.toBeNull();
  });

  it('returns null when the start is fully enclosed', () => {
    const service = makeService();
    service.rebuild(FLOORS, [
      wall(-1, 1, -1.15, -0.85),
      wall(-1, 1, 0.85, 1.15),
      wall(-1.15, -0.85, -1, 1),
      wall(0.85, 1.15, -1, 1),
    ]);

    expect(service.findPath(0, 0, 0, 5, 5)).toBeNull();
  });

  it('snaps a target pressed against a wall to the nearest walkable cell', () => {
    const service = makeService();
    service.rebuild(FLOORS, [wall(-8, 8, 2, 2.3)]);

    // Target hugs the wall face: inside the body-radius margin, unwalkable.
    const path = service.findPath(0, 0, -4, 0, 2.1);

    expect(path).not.toBeNull();
    const last = path![path!.length - 1];
    expect(Math.hypot(last.x - 0, last.z - 2.1)).toBeLessThan(1.2);
  });

  it('snaps a start wedged against an obstacle via closestWalkable', () => {
    const service = makeService();
    // The wall stops at z = 4, leaving a channel to walk around its far end.
    service.rebuild(FLOORS, [wall(-0.15, 0.15, -8, 4)]);

    const snapped = service.closestWalkable(0, -0.2, -4);

    expect(snapped).not.toBeNull();
    expect(service.hasLineOfSight(0, snapped!.x, snapped!.z, snapped!.x, snapped!.z)).toBe(true);
    const path = service.findPath(0, snapped!.x, snapped!.z, 4, -4);
    expect(path).not.toBeNull();
  });

  it('keeps floors isolated and filters obstacles by the floor body band', () => {
    const service = makeService();
    const twoFloors: readonly NavigationFloorData[] = [
      { floor: 0, bounds: BOUNDS, baseY: 0 },
      { floor: -1, bounds: BOUNDS, baseY: -3.4 },
    ];
    // A bunker-height wall blocks floor -1; a ceiling beam blocks nothing.
    service.rebuild(twoFloors, [
      wall(-8, 8, -0.15, 0.15, -3.4, -1.1),
      wall(-8, 8, 3.85, 4.15, 2.2, 3.2),
    ]);

    expect(service.findPath(-1, -4, -4, -4, 4)).toBeNull();
    expect(service.findPath(0, -4, -4, -4, 4)).not.toBeNull();
    // A floor with no declared bounds is not navigable at all.
    expect(service.contains(1, 0, 0)).toBe(false);
    expect(service.findPath(1, 0, 0, 1, 1)).toBeNull();
  });

  it('reports containment against the declared walkable bounds', () => {
    const service = makeService();
    service.rebuild(FLOORS, []);

    expect(service.contains(0, -7.9, 0)).toBe(true);
    expect(service.contains(0, -8.1, 0)).toBe(false);
    expect(service.contains(0, 0, 8.1)).toBe(false);
  });
});
