import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { Weapon } from '../src/weapons/Weapon';
import { BallisticsSystem, resolveSegmentHit } from '../src/shooting/BallisticsSystem';

/**
 * Minimal stand-in for a raycast intersection: the resolver only reads
 * `distance` and `object.userData`, everything else is filler.
 */
function fakeHit(distance: number, userData: Record<string, unknown>): THREE.Intersection {
  return {
    distance,
    object: { userData } as unknown as THREE.Object3D,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 0, 1),
  } as unknown as THREE.Intersection;
}

describe('resolveSegmentHit (zombie head priority)', () => {
  it('returns null when the segment hit nothing', () => {
    expect(resolveSegmentHit([])).toBeNull();
  });

  it('returns environment hits untouched', () => {
    const wall = fakeHit(12, { surface: 'concrete' });
    expect(resolveSegmentHit([wall])).toBe(wall);
  });

  it('keeps the torso hit when the head was not pierced', () => {
    const zombie = {};
    const torso = fakeHit(10, { zombie, hitPart: 'torso' });
    expect(resolveSegmentHit([torso])).toBe(torso);
  });

  it('upgrades to a headshot when the same zombie’s head is pierced just behind the torso surface', () => {
    // The generous torso capsule overlaps the lower head sphere; when the
    // walk cycle dips the head into that capsule silhouette, the torso
    // surface is marginally closer. The head must still win.
    const zombie = {};
    const torso = fakeHit(10, { zombie, hitPart: 'torso' });
    const head = fakeHit(10.1, { zombie, hitPart: 'head' });
    expect(resolveSegmentHit([torso, head])).toBe(head);
  });

  it('does not upgrade when the head hit is far behind the torso surface', () => {
    const zombie = {};
    const torso = fakeHit(10, { zombie, hitPart: 'torso' });
    const head = fakeHit(10.6, { zombie, hitPart: 'head' });
    expect(resolveSegmentHit([torso, head])).toBe(torso);
  });

  it('never steals a headshot from a different zombie', () => {
    // Dense horde: the bullet stops at zombie A — zombie B standing behind
    // must not turn A’s chest shot into a headshot.
    const zombieA = {};
    const zombieB = {};
    const torsoA = fakeHit(10, { zombie: zombieA, hitPart: 'torso' });
    const headB = fakeHit(10.05, { zombie: zombieB, hitPart: 'head' });
    expect(resolveSegmentHit([torsoA, headB])).toBe(torsoA);
  });

  it('keeps a direct headshot as-is', () => {
    const zombie = {};
    const head = fakeHit(10, { zombie, hitPart: 'head' });
    const torso = fakeHit(10.3, { zombie, hitPart: 'torso' });
    expect(resolveSegmentHit([head, torso])).toBe(head);
  });
});

it('keeps the firing weapon attached to a bullet until impact', () => {
  const target = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.2));
  target.position.z = -1;
  target.userData.target = { onHit: vi.fn() };
  target.updateMatrixWorld(true);
  const ballistics = new BallisticsSystem([target], new THREE.Group());
  const firedWeapon = new Weapon(WEAPON_DEFINITIONS.ak47);
  const hits: Array<Weapon | null> = [];
  ballistics.onTargetHit = (_target, _distance, _point, _normal, _object, weapon) => hits.push(weapon);
  ballistics.spawn(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), firedWeapon.definition.projectile, firedWeapon);
  ballistics.update(0.1);
  expect(hits).toEqual([firedWeapon]);
});

describe('Barrett penetration', () => {
  /** A zombie stand-in at `z`: torso box plus a head box, both pointing at the same zombie. */
  function zombieAt(z: number, id: number): THREE.Mesh[] {
    const zombie = { id };
    const target = { onHit: vi.fn() };
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.4));
    torso.position.set(0, 0, z);
    torso.userData = { zombie, target, hitPart: 'torso' };
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3));
    head.position.set(0, 0, z - 0.05);
    head.userData = { zombie, target, hitPart: 'head' };
    for (const mesh of [torso, head]) mesh.updateMatrixWorld(true);
    return [torso, head];
  }

  function fire(weaponId: 'barrett' | 'l96', colliders: THREE.Object3D[]): number[] {
    const ballistics = new BallisticsSystem(colliders, new THREE.Group());
    const hitZombies: number[] = [];
    ballistics.onTargetHit = (_target, _distance, _point, _normal, object) => {
      hitZombies.push((object.userData.zombie as { id: number }).id);
    };
    ballistics.onEnvironmentHit = () => hitZombies.push(-1);
    ballistics.spawn(new THREE.Vector3(), new THREE.Vector3(0, 0, -1), WEAPON_DEFINITIONS[weaponId].projectile);
    for (let i = 0; i < 30; i++) ballistics.update(1 / 60);
    return hitZombies;
  }

  it('passes through up to five zombies in a line, each hit once, and stops at the fifth', () => {
    const line = Array.from({ length: 7 }, (_, index) => zombieAt(-3 - index * 1.2, index)).flat();
    expect(WEAPON_DEFINITIONS.barrett.projectile.maxTargets).toBe(5);
    expect(fire('barrett', line)).toEqual([0, 1, 2, 3, 4]);
  });

  it('is stopped by a wall in between', () => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 0.2));
    wall.position.z = -5.5;
    wall.updateMatrixWorld(true);
    const line = [zombieAt(-3, 0), zombieAt(-4.2, 1), [wall], zombieAt(-7, 2)].flat();
    expect(fire('barrett', line)).toEqual([0, 1, -1]);
  });

  it('leaves every other weapon stopping at the first zombie', () => {
    const line = [zombieAt(-3, 0), zombieAt(-4.2, 1)].flat();
    expect(fire('l96', line)).toEqual([0]);
  });
});
