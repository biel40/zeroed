import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { stepBloodDrop, type BloodDrop } from '../src/zombies/BloodDropMotion';
import { ZombieBleeding } from '../src/zombies/ZombieBleeding';
import { ZombieBlood } from '../src/zombies/ZombieBlood';
import { Zombie } from '../src/zombies/Zombie';
import { GibWallFrame } from '../src/zombies/GibWalls';

function drop(): BloodDrop {
  return { position: new THREE.Vector3(0, 1.2, 0), previous: new THREE.Vector3(),
    velocity: new THREE.Vector3(0, 1, 8), scale: new THREE.Vector3(0.03, 0.03, 0.03), radius: 0.03, resting: false };
}

describe('blood shared with Barrett remains', () => {
  it('sticks to a wall as a thin stain and stops moving', () => {
    const frame = new GibWallFrame();
    frame.capture({ boxes: [new THREE.Box3(new THREE.Vector3(-2, 0, 1), new THREE.Vector3(2, 4, 1.2))] }, new THREE.Group());
    const blood = drop();
    for (let i = 0; i < 60; i++) stepBloodDrop(blood, 1 / 60, frame, 0);
    expect(blood.resting).toBe(true);
    expect(blood.position.z).toBeCloseTo(0.994);
    expect(blood.scale.z).toBeLessThan(0.01);
    expect(blood.scale.x).toBeGreaterThan(0.1);
    const position = blood.position.clone();
    stepBloodDrop(blood, 1, frame, 0);
    expect(blood.position).toEqual(position);
  });

  it('lands on the current floor and on top of furniture', () => {
    for (const surface of [0, 3]) {
      const blood = drop(); blood.position.y += surface;
      const frame = new GibWallFrame();
      for (let i = 0; i < 180; i++) stepBloodDrop(blood, 1 / 60, frame, surface);
      expect(blood.position.y).toBeCloseTo(surface + 0.006);
      expect(blood.scale.y).toBeCloseTo(0.0036);
    }
    const frame = new GibWallFrame();
    frame.capture({ boxes: [new THREE.Box3(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 0.7, 10))] }, new THREE.Group());
    const blood = drop();
    for (let i = 0; i < 180; i++) stepBloodDrop(blood, 1 / 60, frame, 0);
    expect(blood.position.y).toBeCloseTo(0.706);
  });

  it('captures nearby walls at a wound far from the map origin', () => {
    const blood = new ZombieBlood({ boxes: [new THREE.Box3(new THREE.Vector3(48, 0, 1), new THREE.Vector3(52, 4, 1.2))] }, () => 0.5);
    blood.emit(new THREE.Vector3(50, 1.2, 0), 0, 0, 1, new ZombieBleeding().hit('m4a1', false)!);
    blood.update(1);
    const mesh = blood.group.getObjectByName('zombie-blood') as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4(); mesh.getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).z).toBeCloseTo(0.994);
    blood.dispose();
  });
});

describe('zombie bleeding intensity', () => {
  it('gives every knife wound a large burst and increases blood from rapid bullet hits', () => {
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
  it('accumulates marks independently of the zombie, stays bounded, expires and clears on restart', () => {
    const blood = new ZombieBlood({ boxes: [] }, () => 0.5);
    const zombie = new Zombie(undefined, { boxes: [] }, blood);
    const scene = new THREE.Group(); scene.add(blood.group, zombie.group);
    zombie.spawn(0, 0, 1000, 1); zombie.skipSpawnRise(); zombie.update(0);
    zombie.applyDamage(10, false, 0, -2, 'knife');
    const mesh = blood.group.getObjectByName('zombie-blood') as THREE.InstancedMesh;
    expect(mesh.count).toBeGreaterThanOrEqual(48);
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
