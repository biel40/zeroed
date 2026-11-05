import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  buildDefenseRingGeometry,
  DEFENSE_RING_NAME,
  DefenseZoneRing,
  type DefenseZoneRingPlacement,
} from '../src/zombies/maps/shared/DefenseZoneRing';

const WIDTH = 0.3;
/** Centred one metre off the east and north walls of a 20 x 20 room. */
const AGAINST_CORNER: DefenseZoneRingPlacement = {
  x: 9, z: -9, y: 0, radius: 5,
  bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
};
const OPEN_ROOM: DefenseZoneRingPlacement = { ...AGAINST_CORNER, x: 0, z: 0 };

function positions(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const attribute = geometry.getAttribute('position');
  return Array.from({ length: attribute.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(attribute, index));
}

function ringMesh(group: THREE.Group): THREE.Mesh {
  return group.getObjectByName(DEFENSE_RING_NAME) as THREE.Mesh;
}

function ringLevel(group: THREE.Group): { readonly color: THREE.Color; readonly level: number } {
  const { color } = ringMesh(group).material as THREE.MeshBasicMaterial;
  return { color: color.clone(), level: Math.max(color.r, color.g, color.b) };
}

describe('Defense zone ring', () => {
  it('lies flat on the floor, its glowing middle exactly on the defence radius', () => {
    const geometry = buildDefenseRingGeometry(OPEN_ROOM, WIDTH, 64);
    const colors = geometry.getAttribute('color');
    const points = positions(geometry);
    expect(points.length).toBeGreaterThan(0);
    points.forEach((point, index) => {
      expect(point.y).toBeCloseTo(OPEN_ROOM.y, 6);
      const distance = Math.hypot(point.x - OPEN_ROOM.x, point.z - OPEN_ROOM.z);
      expect(distance).toBeGreaterThanOrEqual(OPEN_ROOM.radius - WIDTH / 2 - 1e-6);
      expect(distance).toBeLessThanOrEqual(OPEN_ROOM.radius + WIDTH / 2 + 1e-6);
      // The band fades to black (invisible when added) at both edges.
      if (colors.getX(index) > 0) expect(distance).toBeCloseTo(OPEN_ROOM.radius, 6);
    });
    // Every face looks up, so the front-facing material shows it from above.
    const index = geometry.getIndex()!;
    const normal = new THREE.Vector3();
    for (let face = 0; face < index.count; face += 3) {
      const [a, b, c] = [points[index.getX(face)], points[index.getX(face + 1)], points[index.getX(face + 2)]];
      normal.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      expect(normal.y).toBeGreaterThan(0);
    }
  });

  it('draws the whole circle in an open room and only its in-room arc against the walls', () => {
    const whole = buildDefenseRingGeometry(OPEN_ROOM, WIDTH, 64);
    const clipped = buildDefenseRingGeometry(AGAINST_CORNER, WIDTH, 64);
    expect(whole.getIndex()!.count).toBe(64 * 4 * 3);
    expect(clipped.getIndex()!.count).toBeGreaterThan(0);
    expect(clipped.getIndex()!.count).toBeLessThan(whole.getIndex()!.count / 2);
    const { bounds } = AGAINST_CORNER;
    for (const point of positions(clipped)) {
      expect(point.x).toBeGreaterThanOrEqual(bounds.minX);
      expect(point.x).toBeLessThanOrEqual(bounds.maxX);
      expect(point.z).toBeGreaterThanOrEqual(bounds.minZ);
      expect(point.z).toBeLessThanOrEqual(bounds.maxZ);
    }
  });

  it('stays hidden until the defence runs, and hides again once it is over or reset', () => {
    const group = new THREE.Group();
    const ring = new DefenseZoneRing(group, OPEN_ROOM);
    expect(ringMesh(group).visible).toBe(false);
    ring.update(0.1, true, true);
    expect(ringMesh(group).visible).toBe(true);
    ring.update(0.1, false, true);
    expect(ringMesh(group).visible).toBe(false);
    ring.update(0.1, true, true);
    ring.reset();
    expect(ringMesh(group).visible).toBe(false);
  });

  it('glows steady while defended and blinks red, brighter and darker, once nobody holds it', () => {
    const group = new THREE.Group();
    const ring = new DefenseZoneRing(group, OPEN_ROOM);
    const sample = (defended: boolean): number[] => Array.from({ length: 60 }, () => {
      ring.update(1 / 60, true, defended);
      return ringLevel(group).level;
    });
    const steady = sample(true);
    expect(Math.min(...steady)).toBeGreaterThan(0.4);
    const blinking = sample(false);
    expect(Math.min(...blinking)).toBeLessThan(Math.min(...steady) * 0.5);
    const paused = ringLevel(group).color;
    expect(paused.r).toBeGreaterThan(paused.g * 3);
  });
});
