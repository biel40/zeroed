import { describe, expect, it } from 'vitest';
import type { NavWaypoint } from '../src/zombies/navigation/NavigationGrid';
import { ZombieNavigationService } from '../src/zombies/navigation/ZombieNavigationService';
import type { NavigationFloorData, NavigationVolume } from '../src/zombies/navigation/ZombieNavigationService';

const CELL_SIZE = 0.35;
const BODY_RADIUS = 0.42;
const REPORT_PERFORMANCE = process.env.ZEROED_PERF === '1';

function volume(minX: number, maxX: number, minZ: number, maxZ: number): NavigationVolume {
  return { minX, maxX, minZ, maxZ, minY: 0, maxY: 2.3 };
}

function pillars(width: number, depth: number): NavigationVolume[] {
  const obstacles: NavigationVolume[] = [];
  for (let z = 6; z < depth; z += 6) {
    for (let x = 6; x < width; x += 6) obstacles.push(volume(x - 0.5, x + 0.5, z - 0.5, z + 0.5));
  }
  return obstacles;
}

function measureSamples(sampleCount: number, run: () => unknown): { median: number; p95: number } {
  const samples: number[] = [];
  for (let sample = 0; sample < sampleCount; sample++) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  return {
    median: samples[Math.ceil(sampleCount / 2) - 1],
    p95: samples[Math.ceil(sampleCount * 0.95) - 1],
  };
}

describe('Navigation scaling scenarios', () => {
  it.each([
    { width: 40, depth: 40 },
    { width: 80, depth: 60 },
    { width: 120, depth: 90 },
    { width: 200, depth: 150 },
  ])('routes across a $width × $depth m floor, with and without a closed divider', ({ width, depth }) => {
    const floors: readonly NavigationFloorData[] = [{
      floor: 0,
      bounds: { minX: 0, maxX: width, minZ: 0, maxZ: depth },
    }];
    const dividerX = width / 2;
    const doorZ = depth * 0.7;
    const open = [
      ...pillars(width, depth),
      volume(dividerX - 0.15, dividerX + 0.15, 0, doorZ - 1.4),
      volume(dividerX - 0.15, dividerX + 0.15, doorZ + 1.4, depth),
    ];
    const closed = [...open, volume(dividerX - 0.15, dividerX + 0.15, doorZ - 1.4, doorZ + 1.4)];
    const start = { x: 1.225, z: 1.225 };
    const goal = { x: width - 1.225, z: depth - 1.225 };
    const navigation = new ZombieNavigationService(CELL_SIZE, BODY_RADIUS);
    const findRoute = (): NavWaypoint[] | null => navigation.findPath(0, start.x, start.z, goal.x, goal.z);

    navigation.rebuild(floors, open);
    expect(navigation.hasLineOfSight(0, start.x, start.z, goal.x, goal.z)).toBe(false);
    const route = findRoute() ?? [];
    expect(route.at(-1)).toEqual(goal);
    let previous = start;
    for (const waypoint of route) {
      expect(navigation.hasLineOfSight(0, previous.x, previous.z, waypoint.x, waypoint.z)).toBe(true);
      previous = waypoint;
    }

    navigation.rebuild(floors, closed);
    expect(findRoute()).toBeNull();
    navigation.rebuild(floors, open);
    expect(findRoute()).toEqual(route);

    if (REPORT_PERFORMANCE) {
      const cells = Math.ceil(width / CELL_SIZE) * Math.ceil(depth / CELL_SIZE);
      const rebuildMs = measureSamples(20, () => navigation.rebuild(floors, open));
      for (let warmup = 0; warmup < 5; warmup++) findRoute();
      const openPathMs = measureSamples(30, findRoute);
      navigation.rebuild(floors, closed);
      for (let warmup = 0; warmup < 5; warmup++) findRoute();
      const closedPathMs = measureSamples(30, findRoute);
      console.log(JSON.stringify({ width, depth, cells, openVolumes: open.length, rebuildMs, openPathMs, closedPathMs }));
    }
  });
});
