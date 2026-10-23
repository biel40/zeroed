import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BurnedMansionArena } from '../src/zombies/maps/BurnedMansionArena';
import {
  MANSION_BARRIERS,
  MANSION_BUNKER_Y,
  MANSION_SOUL_LAMPS,
  MANSION_STAIR_BOTTOM_Z,
  MANSION_STAIR_CENTER_X,
  MANSION_STAIR_TOP_Z,
} from '../src/zombies/maps/BurnedMansionConfig';
import type { MansionFloorPartition } from '../src/zombies/maps/burnedMansion/MansionFloors';
import { installCanvasDocument, TEST_PROFILE } from './coopHarness';

function makeArena(): BurnedMansionArena {
  const arena = new BurnedMansionArena(new THREE.Scene(), TEST_PROFILE);
  arena.group.updateMatrixWorld(true);
  return arena;
}

function decorMeshes(arena: BurnedMansionArena): THREE.Mesh[] {
  return arena.group.children.filter((child): child is THREE.Mesh => {
    return child.userData.mapRole === 'static-batch' || child.userData.mapRole === 'window-frames';
  });
}

describe('Burned Mansion art pass', () => {
  // Door plaques paint on a canvas.
  let restoreDocument: () => void;
  beforeAll(() => { restoreDocument = installCanvasDocument(); });
  afterAll(() => restoreDocument());

  it('anchors the wallpaper to the world so every wall piece continues one pattern', () => {
    const arena = makeArena();
    const walls = arena.group.children.filter((child): child is THREE.Mesh => {
      return child.userData.mapRole === 'wall' && ((child as THREE.Mesh).material as THREE.Material).name === 'burned_wallpaper';
    });
    expect(walls.length).toBeGreaterThan(10);
    const tile = (walls[0].material as THREE.Material).userData.metersPerTile as number;
    const world = new THREE.Vector3();
    for (const wall of walls) {
      const position = wall.geometry.getAttribute('position');
      const normal = wall.geometry.getAttribute('normal');
      const uv = wall.geometry.getAttribute('uv');
      for (let index = 0; index < position.count; index++) {
        world.fromBufferAttribute(position, index).add(wall.position);
        const facesX = Math.abs(normal.getX(index)) > 0.5;
        const facesZ = Math.abs(normal.getZ(index)) > 0.5;
        if (!facesX && !facesZ) continue;
        expect(uv.getX(index)).toBeCloseTo((facesX ? world.z : world.x) / tile, 5);
        expect(uv.getY(index)).toBeCloseTo(world.y / tile, 5);
      }
    }
  });

  it('merges the dressing into per-floor batches that never collide', () => {
    const arena = makeArena();
    const batches = arena.group.children.filter((child): child is THREE.Mesh => child.userData.mapRole === 'static-batch');
    expect(batches.length).toBeGreaterThan(10);
    const floors = new Set<string | null>();
    for (const batch of batches) {
      const partition = batch.userData.floorPartition as MansionFloorPartition | undefined;
      expect(partition).toBeDefined();
      expect(arena.colliders).not.toContain(batch);
      const bounds = new THREE.Box3().setFromObject(batch);
      if (partition!.floor === 'ground') expect(bounds.min.y).toBeGreaterThan(-0.2);
      if (partition!.floor === 'bunker') expect(bounds.max.y).toBeLessThan(-0.1);
      floors.add(partition!.floor);
    }
    expect(floors.has('ground')).toBe(true);
    expect(floors.has('bunker')).toBe(true);
  });

  it('keeps the stairwell open between the floors', () => {
    const arena = makeArena();
    const raycaster = new THREE.Raycaster();
    const decor = decorMeshes(arena);
    for (let z = MANSION_STAIR_BOTTOM_Z + 0.3; z < MANSION_STAIR_TOP_Z - 0.2; z += 0.5) {
      for (const x of [MANSION_STAIR_CENTER_X - 0.8, MANSION_STAIR_CENTER_X, MANSION_STAIR_CENTER_X + 0.8]) {
        raycaster.set(new THREE.Vector3(x, 2.5, z), new THREE.Vector3(0, -1, 0));
        const hits = raycaster.intersectObjects(decor, false);
        expect(hits.filter((hit) => hit.point.y > MANSION_BUNKER_Y + 0.05)).toEqual([]);
      }
    }
  });

  it('leaves every window opening clear for the zombies climbing through', () => {
    const arena = makeArena();
    const raycaster = new THREE.Raycaster();
    const decor = decorMeshes(arena);
    for (const barrier of MANSION_BARRIERS) {
      const outward = new THREE.Vector3(barrier.outwardX, 0, barrier.outwardZ);
      const along = new THREE.Vector3(-barrier.outwardZ, 0, barrier.outwardX);
      for (const offset of [-0.3, 0, 0.3]) {
        for (const y of [0.6, 1.1, 1.6]) {
          const start = new THREE.Vector3(barrier.x, y, barrier.z).addScaledVector(outward, 0.6).addScaledVector(along, offset);
          raycaster.set(start, outward.clone().negate());
          raycaster.far = 1.2;
          expect(raycaster.intersectObjects(decor, false).map((hit) => hit.object.name)).toEqual([]);
        }
      }
    }
  });

  it('never hides a soul lamp or a wall-buy outline behind the panelling', () => {
    const arena = makeArena();
    const raycaster = new THREE.Raycaster();
    const decor = decorMeshes(arena);
    for (const lamp of MANSION_SOUL_LAMPS) {
      const inward = new THREE.Vector3(-Math.sin(lamp.yaw), 0, -Math.cos(lamp.yaw));
      const along = new THREE.Vector3(-inward.z, 0, inward.x);
      for (const offset of [-0.25, 0, 0.25]) {
        for (const y of [0.92, 1.25]) {
          // Up to the wall behind the lamp, no trim may stand in the way.
          const origin = new THREE.Vector3(lamp.position.x, y, lamp.position.z).addScaledVector(inward, 1.2).addScaledVector(along, offset);
          raycaster.set(origin, inward.clone().negate());
          raycaster.far = 1.45;
          expect(raycaster.intersectObjects(decor, false)).toEqual([]);
        }
      }
    }
    for (const wallBuy of arena.group.children.filter((child) => child.userData.mapRole === 'wall-buy')) {
      const bounds = new THREE.Box3().setFromObject(wallBuy);
      const outward = new THREE.Vector3(Math.sin(wallBuy.rotation.y), 0, Math.cos(wallBuy.rotation.y));
      const origin = bounds.getCenter(new THREE.Vector3()).setY(bounds.min.y + 0.02).addScaledVector(outward, 1);
      raycaster.set(origin, outward.clone().negate());
      raycaster.far = 1.01;
      expect(raycaster.intersectObjects(decor, false)).toEqual([]);
    }
  });

  it('keeps the house smouldering and restarts the motion deterministically', () => {
    const arena = makeArena();
    const ash = arena.group.getObjectByName('mansion-ash') as THREE.Points;
    const embers = arena.group.getObjectByName('mansion-embers') as THREE.Points;
    const char = (arena.group.children.find((child) => {
      return child.userData.mapRole === 'wall' && ((child as THREE.Mesh).material as THREE.Material).name === 'charred_wood';
    }) as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(char.emissiveMap).toBeInstanceOf(THREE.DataTexture);
    const initialAsh = Float32Array.from(ash.geometry.getAttribute('position').array);
    const initialGlow = char.emissiveIntensity;
    const initialEmbers = Float32Array.from(embers.geometry.getAttribute('position').array);

    arena.update(0.7);
    expect(Array.from(ash.geometry.getAttribute('position').array)).not.toEqual(Array.from(initialAsh));
    expect(Array.from(embers.geometry.getAttribute('position').array)).not.toEqual(Array.from(initialEmbers));
    expect(char.emissiveIntensity).not.toBe(initialGlow);

    arena.reset();
    expect(Array.from(ash.geometry.getAttribute('position').array)).toEqual(Array.from(initialAsh));
    expect(char.emissiveIntensity).toBe(initialGlow);
  });
});
