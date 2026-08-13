import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { resolveSegmentHit } from '../src/shooting/BallisticsSystem';

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
