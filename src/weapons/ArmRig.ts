import * as THREE from 'three';
import { FINGER_LAYOUT, FINGERS } from './HandPoses';

/**
 * Skeleton of one first-person arm (right side, bind pose: every bone points
 * -Z with no rotation). The arm geometry is skinned to it and the poses,
 * IK and rings drive it; the left arm mirrors X.
 */

/** Shoulder-to-elbow and elbow-to-wrist lengths shared with the knife FK chain. */
export const ARM_UPPER_LENGTH = 0.32;
export const ARM_FOREARM_LENGTH = 0.3;

export const SHOULDER = 0;
export const ELBOW = 1;
export const WRIST = 2;
/** Proximal (0), middle (1) and distal (2) phalanx of finger `finger` (FINGERS order). */
export const fingerBone = (finger: number, segment: number): number => 3 + finger * 3 + segment;
/** Thumb metacarpal; its proximal and distal phalanges follow. */
export const THUMB = 15;

/** Thumb metacarpal base relative to the wrist, and the lengths of its three bones. */
const THUMB_BASE = [-0.012, 0.03, -0.024] as const;
export const THUMB_LENGTHS = [0.043, 0.033, 0.027] as const;

export interface BoneBind {
  readonly parent: number;
  readonly offset: THREE.Vector3;
}

/** Bind offsets of every bone relative to its parent (right side). */
export function boneBinds(): BoneBind[] {
  const binds: BoneBind[] = [
    { parent: -1, offset: new THREE.Vector3() },
    { parent: SHOULDER, offset: new THREE.Vector3(0, 0, -ARM_UPPER_LENGTH) },
    { parent: ELBOW, offset: new THREE.Vector3(0, 0, -ARM_FOREARM_LENGTH) },
  ];
  FINGERS.forEach((name, finger) => {
    const { base, lengths } = FINGER_LAYOUT[name];
    binds[fingerBone(finger, 0)] = { parent: WRIST, offset: new THREE.Vector3(...base) };
    binds[fingerBone(finger, 1)] = { parent: fingerBone(finger, 0), offset: new THREE.Vector3(0, 0, -lengths[0]) };
    binds[fingerBone(finger, 2)] = { parent: fingerBone(finger, 1), offset: new THREE.Vector3(0, 0, -lengths[1]) };
  });
  binds[THUMB] = { parent: WRIST, offset: new THREE.Vector3(...THUMB_BASE) };
  binds[THUMB + 1] = { parent: THUMB, offset: new THREE.Vector3(0, 0, -THUMB_LENGTHS[0]) };
  binds[THUMB + 2] = { parent: THUMB + 1, offset: new THREE.Vector3(0, 0, -THUMB_LENGTHS[1]) };
  return binds;
}

/** Bind-space position of every bone. */
export function bindPositions(binds: readonly BoneBind[] = boneBinds()): THREE.Vector3[] {
  const positions: THREE.Vector3[] = [];
  binds.forEach(({ parent, offset }, index) => {
    positions[index] = parent < 0 ? offset.clone() : positions[parent].clone().add(offset);
  });
  return positions;
}
