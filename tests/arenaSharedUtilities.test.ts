import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AmbientEventScheduler } from '../src/zombies/maps/shared/AmbientEventScheduler';
import { ArenaStructure, wallSpans } from '../src/zombies/maps/shared/ArenaStructure';
import { StaticMeshBatch } from '../src/zombies/maps/shared/StaticMeshBatch';

describe('ArenaStructure', () => {
  it('splits a wall line into the solid stretches between openings', () => {
    const opening = (center: number, width: number) => ({ center, width, bottom: 0, top: 2 });
    expect(wallSpans(0, 10, [opening(7, 2), opening(2, 1)])).toEqual([[0, 1.5], [2.5, 6], [8, 10]]);
    expect(wallSpans(0, 4, [opening(0, 2)])).toEqual([[1, 4]]);
  });

  it('leaves every opening clear and registers each piece for bullets and the player', () => {
    const group = new THREE.Group();
    const structure = new ArenaStructure(group);
    const material = new THREE.MeshStandardMaterial();
    structure.addWallWithOpenings('x', 5, -4, 4, 0, 3, 0.3, [{ center: 0, width: 1.5, bottom: 0.3, top: 1.9 }], material, {
      surface: 'concrete', mapRole: 'wall', castShadow: false, uvSeed: 0, blocksPlayer: true,
    });
    group.updateMatrixWorld(true);
    // Two side pieces, a sill and a lintel.
    expect(structure.solids).toHaveLength(4);
    expect(structure.playerBlockers).toHaveLength(4);
    const hole = new THREE.Box3(new THREE.Vector3(-0.74, 0.31, 4.8), new THREE.Vector3(0.74, 1.89, 5.2));
    expect(structure.playerWallBoxes().some((box) => box.intersectsBox(hole))).toBe(false);
    const covered = structure.playerWallBoxes().reduce((sum, box) => {
      const size = box.getSize(new THREE.Vector3());
      return sum + size.x * size.y;
    }, 0);
    expect(covered).toBeCloseTo(8 * 3 - 1.5 * 1.6, 5);
  });
});

describe('AmbientEventScheduler', () => {
  const event = { id: 'rumble', initialDelay: 2, minInterval: 3, maxInterval: 5 };

  it('waits the initial delay, then repeats inside the interval window', () => {
    const fired: number[] = [];
    const scheduler = new AmbientEventScheduler([event], () => 0);
    let time = 0;
    // Quarter-second steps stay exact in binary floating point.
    for (let step = 0; step < 40; step++) {
      time += 0.25;
      scheduler.update(0.25, () => fired.push(time));
    }
    expect(fired).toEqual([2, 5, 8]);
  });

  it('restarts from the initial delay on reset and ignores non-positive steps', () => {
    let count = 0;
    const scheduler = new AmbientEventScheduler([event], () => 0.5);
    scheduler.update(2.9, () => count++);
    expect(count).toBe(0);
    scheduler.update(0.2, () => count++);
    expect(count).toBe(1);
    scheduler.reset();
    scheduler.update(0, () => count++);
    scheduler.update(2.9, () => count++);
    expect(count).toBe(1);
  });
});

describe('StaticMeshBatch', () => {
  it('merges every piece into one mesh per material', () => {
    const stone = new THREE.MeshStandardMaterial({ name: 'stone' });
    const metal = new THREE.MeshStandardMaterial({ name: 'metal' });
    const batch = new StaticMeshBatch();
    for (let index = 0; index < 5; index++) batch.addBox(stone, index, 0.5, 0, 1, 1, 1);
    batch.add(new THREE.CylinderGeometry(0.1, 0.1, 1, 6), metal);
    const parent = new THREE.Group();
    const meshes = batch.build(parent, 'test', { castShadow: false, receiveShadow: true });
    expect(meshes).toHaveLength(2);
    expect(parent.children).toHaveLength(2);
    const stoneMesh = meshes.find((mesh) => mesh.material === stone)!;
    const bounds = new THREE.Box3().setFromObject(stoneMesh);
    expect(bounds.min.x).toBeCloseTo(-0.5);
    expect(bounds.max.x).toBeCloseTo(4.5);
    // Building again adds nothing: the batch empties itself.
    expect(batch.build(parent, 'test', { castShadow: false, receiveShadow: true })).toHaveLength(0);
  });
});
