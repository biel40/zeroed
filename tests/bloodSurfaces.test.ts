import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ZOMBIE_MAPS } from '../src/config/zombieMaps';
import { ZombiesMode } from '../src/modes/ZombiesMode';
import { stepBloodDrop, type BloodDrop } from '../src/zombies/BloodDropMotion';
import { GibWallFrame, type GibWalls, type StainFaces } from '../src/zombies/GibWalls';
import type { ZombieArena } from '../src/zombies/maps/ZombieArena';
import type { WindowBarrier } from '../src/zombies/barriers/WindowBarrier';
import { VESTIBULE_COLUMNS } from '../src/zombies/maps/Station33Config';
import { installCanvasDocument, makeContext, makeMatch, TEST_PROFILE } from './coopHarness';

interface BloodOwner {
  readonly gibWalls: GibWalls;
}

interface SoloInternals {
  readonly arena: ZombieArena;
  readonly zombies: BloodOwner;
}

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());

/** Crosses only the window's empty centre, in either direction, before reaching the sill. */
function expectBloodThroughOpening(walls: GibWalls, barrier: WindowBarrier, floor: number): void {
  for (const side of [-1, 1]) {
    const dx = barrier.outward.x * side;
    const dz = barrier.outward.z * side;
    const position = new THREE.Vector3(barrier.position.x - dx * 0.65, barrier.y, barrier.position.z - dz * 0.65);
    const blood: BloodDrop = {
      position, previous: new THREE.Vector3(), velocity: new THREE.Vector3(dx * 8, 0, dz * 8),
      scale: new THREE.Vector3(0.03, 0.03, 0.03), radius: 0.03, resting: false,
    };
    const frame = new GibWallFrame();
    frame.capture(walls, new THREE.Group(), position);
    stepBloodDrop(blood, 0.18, frame, floor);
    expect(blood.resting, `${barrier.id}, side ${side}`).toBe(false);
    const travelled = (blood.position.x - barrier.position.x) * dx + (blood.position.z - barrier.position.z) * dz;
    expect(travelled, `${barrier.id}, side ${side}`).toBeGreaterThan(0.5);
  }
}

function expectMapSurfaces(arena: ZombieArena, owner: BloodOwner): void {
  for (const barrier of arena.barriers) {
    const floor = arena.navigationBounds.find((bounds) => bounds.floor === barrier.floor)?.baseY ?? 0;
    expectBloodThroughOpening(owner.gibWalls, barrier, floor);
  }
}

/** A closed door still receives blood; buying it removes the surface for subsequent bursts. */
function expectDoorContact(arena: ZombieArena, owner: BloodOwner, closed: boolean): void {
  const door = arena.doors[0];
  const { x: dx, z: dz } = door.outward;
  const position = new THREE.Vector3(door.position.x - dx * 0.65, door.y + 1.2, door.position.z - dz * 0.65);
  const blood: BloodDrop = {
    position, previous: new THREE.Vector3(), velocity: new THREE.Vector3(dx * 8, 0, dz * 8),
    scale: new THREE.Vector3(0.03, 0.03, 0.03), radius: 0.03, resting: false,
  };
  const frame = new GibWallFrame();
  frame.capture(owner.gibWalls, new THREE.Group(), position);
  stepBloodDrop(blood, 0.18, frame, door.y);
  expect(blood.resting, `${door.id}, closed ${closed}`).toBe(closed);
  if (closed) {
    expect(dx !== 0 ? blood.scale.x : blood.scale.z).toBeLessThan(0.01);
  }
}

/** Drops thrown at each marble shaft face, also beside its corners, rest on the visible marble. */
function expectColumnShaftContact(owner: BloodOwner): void {
  const half = VESTIBULE_COLUMNS.size / 2;
  for (const x of VESTIBULE_COLUMNS.xs) {
    for (const z of VESTIBULE_COLUMNS.zs) {
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        for (const along of [0, half - 0.01]) {
          const position = new THREE.Vector3(x + nx * (half + 0.6) + nz * along, 1.6, z + nz * (half + 0.6) + nx * along);
          const blood: BloodDrop = {
            position, previous: new THREE.Vector3(), velocity: new THREE.Vector3(-nx * 8, 0, -nz * 8),
            scale: new THREE.Vector3(0.03, 0.03, 0.03), radius: 0.03, resting: false,
          };
          const frame = new GibWallFrame();
          frame.capture(owner.gibWalls, new THREE.Group(), position);
          stepBloodDrop(blood, 0.18, frame, 0);
          const label = `column (${x}, ${z}) face (${nx}, ${nz}) along ${along}`;
          expect(blood.resting, label).toBe(true);
          const depth = nx !== 0 ? (blood.position.x - x) * nx : (blood.position.z - z) * nz;
          expect(depth, label).toBeCloseTo(half, 2);
          const offset = nx !== 0 ? blood.position.z - z : blood.position.x - x;
          const extent = nx !== 0 ? blood.scale.z : blood.scale.x;
          expect(Math.abs(offset) + extent, label).toBeLessThanOrEqual(half + 1e-6);
        }
      }
    }
  }
}

/** A stain may sit this far in front of the visible surface; behind it is hidden. */
const STAIN_GAP_TOLERANCE = 0.025;
/** Door leaves keep their own collider and are checked by `expectDoorContact`. */
const DOOR_ROLES: ReadonlySet<string> = new Set(['point-door', 'sealed-bunker-door']);

function isDrawn(object: THREE.Object3D): boolean {
  const mesh = object as THREE.Mesh;
  if (!mesh.isMesh || !mesh.visible) return false;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return materials.some((material) => material.visible);
}

/** Distance from `origin` along `direction` to the first drawn surface, minus `lead`; null if none. */
function surfaceGap(ray: THREE.Raycaster, drawn: THREE.Object3D[], origin: THREE.Vector3, direction: THREE.Vector3, lead: number, depth: number): number | null {
  ray.set(origin, direction);
  ray.far = lead + depth;
  const hit = ray.intersectObjects(drawn, false)[0];
  return hit ? hit.distance - lead : null;
}

/** Every invisible proxy face declared as stainable lies on drawn geometry, so no stain floats. */
function floatingStainFaces(arena: ZombieArena): string[] {
  let root: THREE.Object3D = arena.colliders[0];
  while (root.parent) root = root.parent;
  root.updateMatrixWorld(true);
  const drawn: THREE.Object3D[] = [];
  root.traverse((object) => { if (isDrawn(object)) drawn.push(object); });
  const ray = new THREE.Raycaster();
  const lead = 0.5;
  const down = new THREE.Vector3(0, -1, 0);
  const floating: string[] = [];
  const check = (gap: number | null, where: string): void => {
    if (gap === null || gap > STAIN_GAP_TOLERANCE) floating.push(`${where}: ${gap === null ? 'no surface' : gap.toFixed(3)}`);
  };
  for (const collider of arena.colliders) {
    if (isDrawn(collider) || DOOR_ROLES.has(collider.userData.mapRole as string)) continue;
    const faces = (collider.userData.stainFaces as StainFaces | undefined) ?? 'all';
    if (faces === 'none') continue;
    const box = new THREE.Box3().setFromObject(collider);
    const size = box.getSize(new THREE.Vector3());
    const label = `${collider.name || collider.uuid}`;
    for (const [u, v] of [[0.5, 0.5], [0.15, 0.15], [0.85, 0.85], [0.15, 0.85], [0.85, 0.15]]) {
      const origin = new THREE.Vector3(box.min.x + size.x * u, box.max.y + lead, box.min.z + size.z * v);
      const gap = surfaceGap(ray, drawn, origin, down, lead, size.y);
      check(gap, `${label} top at (${u}, ${v})`);
    }
    if (faces !== 'all') continue;
    const center = box.getCenter(new THREE.Vector3());
    for (const [axis, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]] as const) {
      for (const height of [0.3, 0.5, 0.7]) {
        const origin = center.clone();
        origin.y = box.min.y + Math.min(size.y * height, 2.2 * height);
        origin[axis] = (sign > 0 ? box.max[axis] : box.min[axis]) + sign * lead;
        const direction = new THREE.Vector3();
        direction[axis] = -sign;
        const gap = surfaceGap(ray, drawn, origin, direction, lead, size[axis]);
        check(gap, `${label} side ${sign > 0 ? '+' : '-'}${axis} at ${height}`);
      }
    }
  }
  return floating;
}

describe('blood surfaces follow map geometry', () => {
  it.each(Object.values(ZOMBIE_MAPS).map((map) => map.id))('declares only drawn proxy faces of %s as stainable', (mapId) => {
    const arena = ZOMBIE_MAPS[mapId].createArena(new THREE.Scene(), TEST_PROFILE);
    arena.init();
    expect(floatingStainFaces(arena)).toEqual([]);
  });

  it.each(['burned-mansion', 'station-33'] as const)('keeps %s openings clear before and after topology updates', (mapId) => {
    const mode = new ZombiesMode(mapId);
    mode.init(makeContext().ctx);
    const { arena, zombies } = mode as unknown as SoloInternals;
    expectMapSurfaces(arena, zombies);
    expectDoorContact(arena, zombies, true);
    for (const door of arena.doors) {
      door.tryUnlock(() => true);
      arena.activateDoor(door.id);
    }
    arena.update(5);
    expectMapSurfaces(arena, zombies);
    expectDoorContact(arena, zombies, false);
  });

  it('stains the visible marble of Station 33 columns, never the wider plinth footprint in mid-air', () => {
    const mode = new ZombiesMode('station-33');
    mode.init(makeContext().ctx);
    expectColumnShaftContact((mode as unknown as SoloInternals).zombies);
  });

  it('uses the same open window surfaces for host and guest', () => {
    const match = makeMatch();
    const host = match.host as unknown as { readonly world: { readonly arena: ZombieArena }; readonly zombies: BloodOwner };
    const guest = match.guest as unknown as { readonly world: { readonly arena: ZombieArena }; readonly replica: BloodOwner };
    for (const [arena, owner] of [[host.world.arena, host.zombies], [guest.world.arena, guest.replica]] as const) {
      expectMapSurfaces(arena, owner);
      expectDoorContact(arena, owner, true);
      const door = arena.doors[0];
      door.tryUnlock(() => true);
      arena.activateDoor(door.id);
      expectMapSurfaces(arena, owner);
      expectDoorContact(arena, owner, false);
    }
  });
});
