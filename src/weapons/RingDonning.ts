import * as THREE from 'three';
import type { RingFinger } from '../game/rings/RingCatalog';
import { HAND_POSES } from './HandPoses';
import type { HandRings } from './HandRings';
import type { MeleeArmDriver, SupportArmDriver } from './ViewArms';

/** Seconds from lowering the weapon to holding it again with the new ring on. */
export const RING_DONNING_DURATION = 2.2;

/**
 * Timeline, as shares of the duration: the right hand rises (and the
 * weapon dips) first; the left hand leaves the weapon with the ring and
 * meets the fingertip at RING_AT_TIP, slides it down to the seat by
 * RING_SEATED, then both hands go back to the weapon.
 */
const RING_IN_HAND = 0.12;
/** The left hand is fully off the weapon, the ring just past the fingertip. */
const HAND_ARRIVED = 0.32;
const RING_AT_TIP = 0.42;
const RING_SEATED = 0.66;
/** How far past the fingertip, along the finger, the left hand aims while it comes in (metres). */
const APPROACH_PAST_TIP = 0.05;
/** Flare of the ring as it settles on its seat. */
const SEAT_PULSE = 0.8;

/** Camera-space grip of the right hand held up before the eyes, a little right of centre. */
const RIGHT_GRIP = new THREE.Vector3(0.07, -0.13, -0.36);
/** The forearm continues the hand back toward the elbow (metres). */
const FOREARM_REACH = 0.36;

/**
 * Hand rotation (wrist frame: fingers -Z, thumb +Y, back of the hand +X on
 * the right hand and -X on the mirrored left one) whose fingers point along
 * `fingers` with the back of the hand toward `back`, in camera space.
 */
function handRotation(fingers: THREE.Vector3, back: THREE.Vector3, side: 'right' | 'left'): THREE.Quaternion {
  const z = fingers.clone().normalize().negate();
  const x = back.clone().multiplyScalar(side === 'right' ? 1 : -1);
  x.addScaledVector(z, -x.dot(z)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

const TOWARD_EYE = new THREE.Vector3(0, 0, 1);
/** Right hand: fingers up and to the left, its back to the eye, so the ring finger shows. */
const RIGHT_ROTATION = handRotation(new THREE.Vector3(-0.5, 0.8, -0.3), TOWARD_EYE, 'right');
/** Left hand: comes in from below left, fingers up and to the right, pinching the ring. */
const LEFT_ROTATION = handRotation(new THREE.Vector3(0.8, 0.35, -0.45), TOWARD_EYE, 'left');
const ELBOW_FROM_GRIP = new THREE.Vector3(0, 0, FOREARM_REACH).applyQuaternion(RIGHT_ROTATION);

const smooth = (value: number, from: number, to: number): number => THREE.MathUtils.smoothstep(value, from, to);

/**
 * Distance of the ring from its seat toward the fingertip at `progress`:
 * past the tip while the left hand comes in, then down the finger.
 */
export function ringDistanceFromSeat(progress: number, toTip: number): number {
  if (progress < RING_AT_TIP) return toTip + APPROACH_PAST_TIP * (1 - smooth(progress, HAND_ARRIVED, RING_AT_TIP));
  return toTip * (1 - smooth(progress, RING_AT_TIP, RING_SEATED));
}

/**
 * First-person putting on of a ring just bought: the weapon dips, the
 * right hand comes up with its fingers fanned out, the left hand lets go of
 * the weapon, brings the ring to the fingertip and slides it down to its
 * seat, where it flares, and both hands go back to the weapon. Borrows the
 * right arm like the knife (`MeleeArmDriver`) and the left one as its
 * `SupportArmDriver`; the ring itself is the hand's own (`HandRings`).
 * Presentation only: the ring works from the moment it is bought.
 */
export class RingDonning implements MeleeArmDriver, SupportArmDriver {
  readonly handPose = HAND_POSES.openHand;
  readonly supportPose = HAND_POSES.boltPinch;
  readonly support: SupportArmDriver = this;
  private finger: RingFinger | null = null;
  private progress = 0;
  private seated = false;
  private readonly cameraRotation = new THREE.Quaternion();

  constructor(
    /** The first-person camera the hands are posed against. */
    private readonly camera: THREE.Object3D,
    private readonly rings: HandRings,
  ) {}

  get isAnimating(): boolean {
    return this.finger !== null;
  }

  get firearmLowering(): number {
    if (!this.isAnimating) return 0;
    return smooth(this.progress, 0, 0.1) * (1 - smooth(this.progress, 0.9, 1));
  }

  get armWeight(): number {
    if (!this.isAnimating) return 0;
    return smooth(this.progress, 0, 0.14) * (1 - smooth(this.progress, 0.86, 1));
  }

  get supportWeight(): number {
    if (!this.isAnimating) return 0;
    return smooth(this.progress, 0.1, HAND_ARRIVED) * (1 - smooth(this.progress, 0.72, 0.9));
  }

  /** Starts putting the ring of `finger` on; one still going on is seated at once. */
  start(finger: RingFinger): void {
    this.finishSeating();
    this.finger = finger;
    this.progress = 0;
    this.seated = false;
    this.rings.beginDonning(finger);
  }

  update(dt: number): void {
    if (this.finger === null) return;
    this.progress = Math.min(1, this.progress + Math.max(0, dt) / RING_DONNING_DURATION);
    if (this.progress >= RING_SEATED) this.finishSeating();
    if (this.progress >= 1) this.finger = null;
  }

  /** Nothing in the hands: a new run (the rings themselves are cleared by their owner). */
  reset(): void {
    this.finger = null;
    this.progress = 0;
    this.seated = false;
  }

  readHandTarget(grip: THREE.Vector3, rotation: THREE.Quaternion, elbow: THREE.Vector3): void {
    this.camera.updateWorldMatrix(true, false);
    this.camera.localToWorld(grip.copy(RIGHT_GRIP));
    this.camera.localToWorld(elbow.copy(RIGHT_GRIP).add(ELBOW_FROM_GRIP));
    this.camera.getWorldQuaternion(rotation).multiply(RIGHT_ROTATION);
  }

  readSupportTarget(grip: THREE.Vector3, rotation: THREE.Quaternion): void {
    const finger = this.finger!;
    this.rings.alongFinger(finger, ringDistanceFromSeat(this.progress, this.rings.tipDistance(finger)), grip);
    rotation.copy(this.camera.getWorldQuaternion(this.cameraRotation)).multiply(LEFT_ROTATION);
  }

  /** The ring rides the left hand's pinch from when it shows until it is seated. */
  carry(grip: THREE.Vector3): void {
    if (this.finger === null || this.seated || this.progress < RING_IN_HAND) return;
    this.rings.hold(this.finger, grip);
  }

  private finishSeating(): void {
    if (this.finger === null || this.seated) return;
    this.seated = true;
    this.rings.seat(this.finger);
    this.rings.pulse(this.finger, SEAT_PULSE);
  }
}
