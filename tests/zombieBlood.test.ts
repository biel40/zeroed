import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { stepBloodDrop, type BloodDrop } from '../src/zombies/BloodDropMotion';
import { ZombieBleeding } from '../src/zombies/ZombieBleeding';
import { ZombieBlood } from '../src/zombies/ZombieBlood';
import { Zombie } from '../src/zombies/Zombie';
import { GibWallFrame } from '../src/zombies/GibWalls';
import { bloodGeometry, bloodMaterial } from '../src/zombies/ZombieBloodAssets';

function drop(): BloodDrop {
  return { position: new THREE.Vector3(0, 1.2, 0), previous: new THREE.Vector3(),
    velocity: new THREE.Vector3(0, 1, 8), scale: new THREE.Vector3(0.03, 0.03, 0.03), radius: 0.03, resting: false };
}

describe('blood shared with Barrett remains', () => {
  it('keeps the entire stain on window sills, lintels and jambs, including radius-only grazes', () => {
    const edges = [
      { min: [-2, 1.9], max: [2, 3.2], across: 0, height: 1.91 },
      { min: [-2, 1.9], max: [2, 3.2], across: 0, height: 1.885 },
      { min: [-2, 0], max: [2, 0.3], across: 0, height: 0.29 },
      { min: [-2, 0], max: [2, 0.3], across: 0, height: 0.315 },
      { min: [-2, 0.3], max: [-0.75, 1.9], across: -0.76, height: 1.2 },
      { min: [-2, 0.3], max: [-0.75, 1.9], across: -0.735, height: 1.2 },
      { min: [0.75, 0.3], max: [2, 1.9], across: 0.76, height: 1.2 },
      { min: [0.75, 0.3], max: [2, 1.9], across: 0.735, height: 1.2 },
    ];
    for (const normal of ['x', 'z'] as const) {
      const tangent = normal === 'x' ? 'z' : 'x';
      for (const side of [-1, 1]) for (const edge of edges) {
        const wall = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3());
        wall.min[normal] = 0; wall.max[normal] = 0.3;
        wall.min[tangent] = edge.min[0]; wall.max[tangent] = edge.max[0];
        wall.min.y = edge.min[1]; wall.max.y = edge.max[1];
        const frame = new GibWallFrame();
        frame.capture({ boxes: [wall] }, new THREE.Group());
        const blood = drop();
        blood.radius = 0.035;
        blood.position[normal] = side === 1 ? -0.07 : 0.37;
        blood.position[tangent] = edge.across;
        blood.position.y = edge.height;
        blood.velocity.set(0, 0, 0); blood.velocity[normal] = side * 8;
        stepBloodDrop(blood, 0.01, frame, -10);
        expect(blood.resting).toBe(true);
        for (const axis of [tangent, 'y'] as const) {
          expect(blood.position[axis] - blood.scale[axis]).toBeGreaterThanOrEqual(wall.min[axis] - 1e-9);
          expect(blood.position[axis] + blood.scale[axis]).toBeLessThanOrEqual(wall.max[axis] + 1e-9);
        }
        expect(blood.scale[normal]).toBeLessThan(0.01);
      }
    }
  });

  it('fits a stain entirely on a narrow furniture top instead of overhanging its edges', () => {
    const frame = new GibWallFrame();
    const wall = new THREE.Box3(new THREE.Vector3(-0.08, 0, -0.08), new THREE.Vector3(0.08, 0.7, 0.08));
    frame.capture({ boxes: [wall] }, new THREE.Group());
    const blood = drop();
    blood.position.set(0.075, 0.77, 0.075); blood.velocity.set(0, -8, 0);
    stepBloodDrop(blood, 0.01, frame, 0);
    expect(blood.resting).toBe(true);
    for (const axis of ['x', 'z'] as const) {
      expect(blood.position[axis] - blood.scale[axis]).toBeGreaterThanOrEqual(wall.min[axis] - 1e-9);
      expect(blood.position[axis] + blood.scale[axis]).toBeLessThanOrEqual(wall.max[axis] + 1e-9);
    }
    expect(blood.position.y).toBeCloseTo(0.7015);
  });

  it('sticks to a wall as a thin stain and stops moving', () => {
    const frame = new GibWallFrame();
    frame.capture({ boxes: [new THREE.Box3(new THREE.Vector3(-2, 0, 1), new THREE.Vector3(2, 4, 1.2))] }, new THREE.Group());
    const blood = drop();
    for (let i = 0; i < 60; i++) stepBloodDrop(blood, 1 / 60, frame, 0);
    expect(blood.resting).toBe(true);
    expect(blood.position.z).toBeCloseTo(0.9985);
    expect(blood.scale.z).toBeLessThan(0.01);
    expect(blood.scale.x).toBeGreaterThan(0.06);
    const position = blood.position.clone();
    stepBloodDrop(blood, 1, frame, 0);
    expect(blood.position).toEqual(position);
  });

  it('lands on the current floor and on top of furniture', () => {
    for (const surface of [0, 3]) {
      const blood = drop(); blood.position.y += surface;
      const frame = new GibWallFrame();
      for (let i = 0; i < 180; i++) stepBloodDrop(blood, 1 / 60, frame, surface);
      expect(blood.position.y).toBeCloseTo(surface + 0.0015);
      expect(blood.scale.y).toBeCloseTo(0.0008);
    }
    const frame = new GibWallFrame();
    frame.capture({ boxes: [new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 0.7, 10))] }, new THREE.Group());
    const blood = drop();
    for (let i = 0; i < 180; i++) stepBloodDrop(blood, 1 / 60, frame, 0);
    expect(blood.position.y).toBeCloseTo(0.7015);
  });

  it('runs down a padded proxy side to the floor instead of staining it in mid-air', () => {
    const proxy = new THREE.Box3(new THREE.Vector3(-2, 0, 1), new THREE.Vector3(2, 0.9, 1.6));
    for (const stainFaces of ['top', 'none'] as const) {
      const frame = new GibWallFrame();
      frame.capture({ boxes: [proxy], stainFaces: new Map([[proxy, stainFaces]]) }, new THREE.Group());
      const blood = drop(); blood.position.y = 0.6; blood.velocity.y = 0;
      for (let i = 0; i < 180; i++) stepBloodDrop(blood, 1 / 60, frame, 0);
      expect(blood.resting, stainFaces).toBe(true);
      expect(blood.position.y, stainFaces).toBeCloseTo(0.0015);
      expect(blood.position.z, stainFaces).toBeLessThan(1);
      expect(blood.scale.y, stainFaces).toBeLessThan(0.01);
    }
  });

  it('stains a top-only proxy from above but leaves no mark on an irregular one', () => {
    const proxy = new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 0.7, 10));
    for (const [stainFaces, visible] of [['top', true], ['none', false]] as const) {
      const frame = new GibWallFrame();
      frame.capture({ boxes: [proxy], stainFaces: new Map([[proxy, stainFaces]]) }, new THREE.Group());
      const blood = drop();
      for (let i = 0; i < 180; i++) stepBloodDrop(blood, 1 / 60, frame, 0);
      expect(blood.resting, stainFaces).toBe(true);
      expect(blood.scale.x > 0, stainFaces).toBe(visible);
      if (visible) expect(blood.position.y).toBeCloseTo(0.7015);
    }
  });

  it('captures nearby walls at a wound far from the map origin', () => {
    const blood = new ZombieBlood({ boxes: [new THREE.Box3(new THREE.Vector3(48, 0, 1), new THREE.Vector3(52, 4, 1.2))] }, () => 0.5);
    blood.emit(new THREE.Vector3(50, 1.2, 0), 0, 0, 1, new ZombieBleeding().hit('m4a1', false)!);
    blood.update(1);
    const mesh = blood.group.getObjectByName('zombie-blood') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).z).toBeCloseTo(0.9985);
    blood.dispose();
  });
});

describe('zombie bleeding intensity', () => {
  it('keeps bursts restrained and uses a bounded irregular silhouette without more triangles', () => {
    const bleeding = new ZombieBleeding();
    const knife = bleeding.hit('knife', false)!;
    expect(knife.drops).toBeLessThanOrEqual(32);
    expect(knife.radius).toBeLessThanOrEqual(0.018);
    expect(knife.spread).toBeLessThanOrEqual(2);
    for (let index = 0; index < 8; index++) {
      const bullet = bleeding.hit('m4a1', false)!;
      expect(bullet.drops).toBeLessThanOrEqual(22);
      expect(bullet.radius).toBeLessThanOrEqual(0.016);
    }
    const vertices = bloodGeometry().getAttribute('position');
    const lengths: number[] = [];
    for (let index = 0; index < vertices.count; index++) {
      const length = new THREE.Vector3().fromBufferAttribute(vertices, index).length();
      expect(length).toBeLessThanOrEqual(1);
      lengths.push(length);
    }
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(0.1);
    expect(vertices.count).toBeLessThanOrEqual(new THREE.IcosahedronGeometry(1, 1).getAttribute('position').count);
  });

  it('keeps even the lightest single bullet wound readable on a wall', () => {
    const first = new ZombieBleeding().hit('m4a1', false)!;
    expect(first.drops).toBeGreaterThanOrEqual(8);
    const frame = new GibWallFrame();
    frame.capture({ boxes: [new THREE.Box3(new THREE.Vector3(-2, 0, 1), new THREE.Vector3(2, 4, 1.2))] }, new THREE.Group());
    const blood = drop();
    // ZombieBlood scales each drop between 0.65x and 1.35x of the profile radius.
    blood.radius = first.radius * 0.65;
    for (let i = 0; i < 60; i++) stepBloodDrop(blood, 1 / 60, frame, 0);
    expect(blood.resting).toBe(true);
    expect(blood.scale.x).toBeGreaterThanOrEqual(0.025);
  });

  it('shades flattened stains by their own faces, not by the rim normals of a sphere', () => {
    expect(bloodMaterial().flatShading).toBe(true);
  });

  it('gives every knife wound a distinct burst and increases blood from rapid bullet hits', () => {
    const bleeding = new ZombieBleeding();
    const first = bleeding.hit('m4a1', false)!;
    bleeding.update(0.08);
    const second = bleeding.hit('m4a1', false)!;
    bleeding.update(0.08);
    const third = bleeding.hit('m4a1', false)!;
    expect(second.drops).toBeGreaterThan(first.drops);
    expect(third.drops).toBeGreaterThan(second.drops);
    expect(bleeding.hit('knife', false)!.drops).toBeGreaterThan(third.drops);
    expect(bleeding.hit('knife', true)).toEqual(bleeding.hit('knife', false));
    bleeding.update(1);
    expect(bleeding.hit('m4a1', false)).toEqual(first);
    bleeding.reset();
    expect(bleeding.hit('m4a1', true)).toEqual(first);
  });

  it('preserves Barrett dismemberment and never adds blood to fire or energy damage', () => {
    const bleeding = new ZombieBleeding();
    expect(bleeding.hit('barrett', true)).toBeNull();
    expect(bleeding.hit('barrett', false)).not.toBeNull();
    for (const source of ['fakel', 'tesla', 'raygun'] as const) expect(bleeding.hit(source, false)).toBeNull();
  });
});

describe('persistent pooled blood', () => {
  it('renders a lintel stain entirely above the opening after the drop expands', () => {
    const wall = new THREE.Box3(new THREE.Vector3(-2, 1.9, 0.5), new THREE.Vector3(2, 3.2, 0.8));
    const blood = new ZombieBlood({ boxes: [wall] }, () => 0.5);
    blood.emit(new THREE.Vector3(0, 1.87, 0), 0, 0, 1, { drops: 1, radius: 0.035, force: 8, spread: 0 });
    blood.update(0.1);
    const mesh = blood.group.getObjectByName('zombie-blood') as THREE.InstancedMesh;
    const transform = new THREE.Matrix4(); mesh.getMatrixAt(0, transform);
    const position = new THREE.Vector3();
    const vertices = mesh.geometry.getAttribute('position');
    for (let index = 0; index < vertices.count; index++) {
      position.fromBufferAttribute(vertices, index).applyMatrix4(transform);
      expect(position.y).toBeGreaterThanOrEqual(wall.min.y - 1e-6);
      expect(position.y).toBeLessThanOrEqual(wall.max.y + 1e-6);
    }
    expect(new THREE.Vector3().setFromMatrixScale(transform).z).toBeLessThan(0.01);
    blood.dispose();
  });

  it('accumulates marks independently of the zombie, stays bounded, expires and clears on restart', () => {
    const blood = new ZombieBlood({ boxes: [] }, () => 0.5);
    const zombie = new Zombie(undefined, { boxes: [] }, blood);
    const scene = new THREE.Group(); scene.add(blood.group, zombie.group);
    zombie.spawn(0, 0, 1000, 1); zombie.skipSpawnRise(); zombie.update(0);
    zombie.applyDamage(10, false, 0, -2, 'knife');
    const mesh = blood.group.getObjectByName('zombie-blood') as THREE.InstancedMesh;
    expect(mesh.count).toBeGreaterThanOrEqual(24);
    const initialCount = mesh.count;
    zombie.applyDamage(10, false, 0, -2, 'knife');
    expect(mesh.count).toBe(initialCount * 2);
    zombie.spawn(20, 20, 100, 1);
    blood.update(2);
    const transform = new THREE.Matrix4(); mesh.getMatrixAt(0, transform);
    expect(new THREE.Vector3().setFromMatrixPosition(transform).x).toBeCloseTo(0);
    for (let i = 0; i < 100; i++) blood.emit(new THREE.Vector3(0, 1, 0), 0, 0, 1, new ZombieBleeding().hit('knife', false)!);
    expect(mesh.count).toBeLessThanOrEqual(1024);
    blood.update(61);
    expect(mesh.visible).toBe(false);
    blood.reset();
    expect(mesh.count).toBe(0);
    zombie.dispose(); blood.dispose();
  });
});
