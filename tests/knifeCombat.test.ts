import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KNIFE_RANGE } from '../src/weapons/Knife';
import { KnifeCombat } from '../src/weapons/KnifeCombat';
import type { Zombie } from '../src/zombies/Zombie';

const ORIGIN = new THREE.Vector3(0, 1.7, 0);
const FORWARD = new THREE.Vector3(0, 0, -1);

function body(x: number, z: number, y = 1.7, floor = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), new THREE.MeshBasicMaterial());
  mesh.position.set(x, y, z);
  mesh.userData.zombie = { isAlive: true, floor } as Zombie;
  mesh.updateMatrixWorld(true);
  return mesh;
}

function wall(x: number, z: number, width = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 3, 0.1), new THREE.MeshBasicMaterial());
  mesh.position.set(x, 1.5, z);
  mesh.updateMatrixWorld(true);
  return mesh;
}

describe('KnifeCombat', () => {
  it('reaches bodies missed by the old crosshair ray on either side of the cut', () => {
    const combat = new KnifeCombat();
    for (const side of [-1, 1]) {
      const target = body(side * 1.3, -1.2);
      expect(combat.findImpact(ORIGIN, FORWARD, 0, [target])?.object).toBe(target);
    }
  });

  it('extends useful reach beyond the previous 2.05 m without reaching past the new limit', () => {
    const combat = new KnifeCombat();
    expect(KNIFE_RANGE).toBe(2.4);
    const reachable = body(0, -2.5);
    expect(combat.findImpact(ORIGIN, FORWARD, 0, [reachable])?.distance).toBeCloseTo(2.25);
    expect(combat.findImpact(ORIGIN, FORWARD, 0, [body(0, -KNIFE_RANGE - 0.3)])).toBeNull();
  });

  it('prefers the aimed body over a closer body to one side', () => {
    const aimed = body(0, -2);
    const side = body(0.6, -0.8);
    expect(new KnifeCombat().findImpact(ORIGIN, FORWARD, 0, [side, aimed])?.object).toBe(aimed);
  });

  it('chooses one body by alignment and proximity, independent of collider order', () => {
    const near = body(0.8, -1.3);
    const far = body(1.2, -1.7);
    const combat = new KnifeCombat();
    for (const colliders of [[near, far], [far, near]]) {
      expect(combat.findImpact(ORIGIN, FORWARD, 0, colliders)?.object).toBe(near);
    }
  });

  it('does not hit bodies behind the player or outside the frontal slash', () => {
    const combat = new KnifeCombat();
    expect(combat.findImpact(ORIGIN, FORWARD, 0, [body(0, 1)])).toBeNull();
    expect(combat.findImpact(ORIGIN, FORWARD, 0, [body(1.4, -0.4)])).toBeNull();
  });

  it('allows normal height variation while rejecting bodies far above or below the cut', () => {
    const combat = new KnifeCombat();
    const low = body(0.5, -1.4, 1.1);
    expect(combat.findImpact(ORIGIN, FORWARD, 0, [low])?.object).toBe(low);
    expect(combat.findImpact(ORIGIN, FORWARD, 0, [body(0, -1.2, 4)])).toBeNull();
    expect(combat.findImpact(ORIGIN, FORWARD, 0, [body(0, -1.2, -0.5)])).toBeNull();
  });

  it('follows the actual look direction when cutting upward', () => {
    const target = body(0.5, -1.3, 2.7);
    const upward = new THREE.Vector3(0, 0.6, -0.8);
    expect(new KnifeCombat().findImpact(ORIGIN, upward, 0, [target])?.object).toBe(target);
  });

  it('rejects dead bodies and bodies on another floor', () => {
    const dead = body(0.5, -1);
    dead.userData.zombie.isAlive = false;
    const upstairs = body(-0.5, -1, 1.7, 1);
    expect(new KnifeCombat().findImpact(ORIGIN, FORWARD, 0, [dead, upstairs])).toBeNull();
  });

  it('checks walls along the path to an off-centre body', () => {
    const target = body(1, -1.5);
    const blocker = wall(0.5, -0.75, 0.8);
    expect(new KnifeCombat().findImpact(ORIGIN, FORWARD, 0, [target, blocker])).toBeNull();
  });

  it('can connect to a clear side target while the crosshair points at a wall', () => {
    const target = body(1.3, -1.2);
    const blocker = wall(0, -0.6, 0.25);
    expect(new KnifeCombat().findImpact(ORIGIN, FORWARD, 0, [target, blocker])?.object).toBe(target);
  });

  it('never validates a claimed body through another body', () => {
    const near = body(0.5, -0.8);
    const far = body(1, -1.6);
    const combat = new KnifeCombat();
    expect(combat.findImpact(ORIGIN, FORWARD, 0, [far, near])?.object).toBe(near);
    expect(combat.findImpact(ORIGIN, FORWARD, 0, [far, near], far.userData.zombie)).toBeNull();
  });

  it('validates a visible claimed body even when another visible body is closer to the crosshair', () => {
    const claimed = body(1, -1.5);
    const aimed = body(0, -1.6);
    expect(new KnifeCombat().findImpact(ORIGIN, FORWARD, 0, [aimed, claimed], claimed.userData.zombie)?.object)
      .toBe(claimed);
  });
});
