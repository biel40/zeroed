import * as THREE from 'three';
import { FINGER_LAYOUT, FINGERS } from './HandPoses';

/**
 * Skeleton of one first-person arm (right side, bind pose: every bone points
 * -Z with no rotation except the thumb, bound at its rest). The arm geometry
 * is skinned to it and the poses, IK and rings drive it; the left arm
 * mirrors X.
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

export type ArmSide = 'left' | 'right';

/** Thumb metacarpal base relative to the wrist, and the lengths of its three bones. */
const THUMB_BASE = [-0.012, 0.03, -0.024] as const;
export const THUMB_LENGTHS = [0.043, 0.029, 0.023] as const;
/**
 * Rest orientation of each hand's thumb metacarpal (XYZ Euler in the
 * right-hand convention; Z turns it about its own length). Each thumb is
 * modelled and bound near the grips that hand holds, rolled onto its side
 * with the nail outward, so a pose only bends it a little from rest and its
 * root stays smooth where it meets the palm: the shooting thumb wraps the
 * grip, the support thumb lies along a handguard or frame. Poses still set
 * its absolute rotation.
 */
export const THUMB_REST: Readonly<Record<ArmSide, readonly [number, number, number]>> = {
  right: [0.3, 0.9, 2.75],
  left: [0.65, 0.4, 1.8],
};

export interface BoneBind {
  readonly parent: number;
  readonly offset: THREE.Vector3;
  /** Bind rotation relative to the parent (XYZ Euler). */
  readonly rest: readonly [number, number, number];
}

/** Bind-space position and rotation of one bone. */
export interface BindFrame {
  readonly position: THREE.Vector3;
  readonly rotation: THREE.Quaternion;
}

const STRAIGHT = [0, 0, 0] as const;

/** Bind offsets of every bone relative to its parent, in the right-hand convention, for one hand's thumb rest. */
export function boneBinds(side: ArmSide): BoneBind[] {
  const bone = (parent: number, x: number, y: number, z: number, rest: BoneBind['rest'] = STRAIGHT): BoneBind =>
    ({ parent, offset: new THREE.Vector3(x, y, z), rest });
  const binds: BoneBind[] = [
    bone(-1, 0, 0, 0),
    bone(SHOULDER, 0, 0, -ARM_UPPER_LENGTH),
    bone(ELBOW, 0, 0, -ARM_FOREARM_LENGTH),
  ];
  FINGERS.forEach((name, finger) => {
    const { base, lengths } = FINGER_LAYOUT[name];
    binds[fingerBone(finger, 0)] = bone(WRIST, ...base);
    binds[fingerBone(finger, 1)] = bone(fingerBone(finger, 0), 0, 0, -lengths[0]);
    binds[fingerBone(finger, 2)] = bone(fingerBone(finger, 1), 0, 0, -lengths[1]);
  });
  binds[THUMB] = bone(WRIST, ...THUMB_BASE, THUMB_REST[side]);
  binds[THUMB + 1] = bone(THUMB, 0, 0, -THUMB_LENGTHS[0]);
  binds[THUMB + 2] = bone(THUMB + 1, 0, 0, -THUMB_LENGTHS[1]);
  return binds;
}

/** Bind-space position and rotation of every bone. */
export function bindFrames(binds: readonly BoneBind[]): BindFrame[] {
  const frames: BindFrame[] = [];
  binds.forEach(({ parent, offset, rest }, index) => {
    const local = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rest));
    frames[index] = parent < 0
      ? { position: offset.clone(), rotation: local }
      : {
        position: offset.clone().applyQuaternion(frames[parent].rotation).add(frames[parent].position),
        rotation: frames[parent].rotation.clone().multiply(local),
      };
  });
  return frames;
}
