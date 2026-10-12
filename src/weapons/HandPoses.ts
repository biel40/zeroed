import type { HandPoseId } from './WeaponTypes';

/** Curl of the three phalanges (radians, toward the palm) and side spread. */
interface FingerPose {
  readonly curl: readonly [number, number, number];
  readonly spread: number;
}

/**
 * Finger pose of a right glove. Hand frame: the wrist is the origin, the
 * fingers point -Z, the thumb side is +Y and the palm faces -X. The left
 * glove mirrors X.
 */
export interface HandPose {
  readonly index: FingerPose;
  readonly middle: FingerPose;
  readonly ring: FingerPose;
  readonly pinky: FingerPose;
  /** Thumb base rotation (XYZ Euler) and the curl of its two phalanges. */
  readonly thumb: { readonly base: readonly [number, number, number]; readonly curl: readonly [number, number] };
  /** Center of the held part relative to the wrist. */
  readonly grip: readonly [number, number, number];
}

export const FINGERS = ['index', 'middle', 'ring', 'pinky'] as const;

const finger = (c1: number, c2: number, c3: number, spread = 0): FingerPose => ({ curl: [c1, c2, c3], spread });

/** Wrapped around a pistol/rifle grip with the index on the trigger. */
const triggerGrip = (index: FingerPose, grip: readonly [number, number, number]): HandPose => ({
  index,
  middle: finger(1.42, 1.5, 1.15, 0),
  ring: finger(1.48, 1.52, 1.12, -0.04),
  pinky: finger(1.55, 1.5, 1.05, -0.08),
  thumb: { base: [-0.32, 0.86, 0.34], curl: [0.42, 0.3] },
  grip,
});

export const HAND_POSES: Readonly<Record<HandPoseId, HandPose>> = {
  // Thick knife handle: the thumb locks over the index.
  fist: {
    index: finger(1.32, 1.3, 0.9, 0.03),
    middle: finger(1.38, 1.3, 0.88),
    ring: finger(1.42, 1.32, 0.86, -0.03),
    pinky: finger(1.48, 1.32, 0.82, -0.07),
    thumb: { base: [-0.4, 1.02, 0.55], curl: [0.62, 0.42] },
    grip: [-0.047, -0.004, -0.066],
  },
  pistolGrip: triggerGrip(finger(0.42, 0.72, 0.5, 0.06), [-0.031, -0.006, -0.064]),
  rifleGrip: triggerGrip(finger(0.48, 0.76, 0.52, 0.07), [-0.032, -0.004, -0.064]),
  // C-clamp under a handguard: fingers wrap under it, the thumb lies along
  // its far side pointing at the muzzle.
  supportHandguard: {
    index: finger(1.05, 0.95, 0.6, 0.02),
    middle: finger(1.1, 0.98, 0.62, 0),
    ring: finger(1.14, 1.0, 0.62, -0.03),
    pinky: finger(1.2, 1.02, 0.6, -0.07),
    thumb: { base: [1.2, 0.32, 0.1], curl: [0.12, 0.08] },
    grip: [-0.047, 0.004, -0.062],
  },
  // Wrapped over the shooting hand's fingers.
  supportPistol: {
    index: finger(1.12, 1.0, 0.62, 0.03),
    middle: finger(1.18, 1.04, 0.64),
    ring: finger(1.22, 1.06, 0.64, -0.04),
    pinky: finger(1.26, 1.06, 0.62, -0.08),
    thumb: { base: [0.02, 0.42, 0.12], curl: [0.14, 0.1] },
    grip: [-0.042, -0.006, -0.07],
  },
  magazineGrab: {
    index: finger(1.02, 0.92, 0.58, 0.04),
    middle: finger(1.06, 0.94, 0.6),
    ring: finger(1.1, 0.96, 0.6, -0.04),
    pinky: finger(1.14, 0.96, 0.58, -0.08),
    thumb: { base: [-0.2, 0.92, 0.22], curl: [0.34, 0.24] },
    grip: [-0.03, 0, -0.07],
  },
  // Thumb and index pinch a knob; the other fingers tuck in.
  boltPinch: {
    index: finger(0.78, 0.88, 0.56, 0.08),
    middle: finger(1.22, 1.2, 0.8),
    ring: finger(1.36, 1.28, 0.84, -0.04),
    pinky: finger(1.46, 1.34, 0.84, -0.08),
    thumb: { base: [-0.26, 0.86, 0.16], curl: [0.46, 0.32] },
    grip: [-0.022, 0.034, -0.112],
  },
  relaxed: {
    index: finger(0.28, 0.32, 0.2, 0.07),
    middle: finger(0.32, 0.36, 0.22, 0.01),
    ring: finger(0.36, 0.4, 0.24, -0.05),
    pinky: finger(0.42, 0.42, 0.28, -0.11),
    thumb: { base: [0.15, 0.36, 0.2], curl: [0.12, 0.16] },
    grip: [-0.03, -0.006, -0.07],
  },
};
