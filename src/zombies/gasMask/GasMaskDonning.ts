import * as THREE from 'three';
import { applyViewModelDepth } from '../../rendering/ViewModelDepth';
import type { MeleeArmDriver } from '../../weapons/ViewArms';
import { buildGasMaskModel } from './GasMaskModel';

/** Seconds to put the mask on; taking it off plays the same motion backwards. */
export const GAS_MASK_DON_DURATION = 1.5;

/** Donning progress (0 bare face, 1 worn) where the mask meets the face... */
const AT_FACE = 0.68;
/** ...and where the masked view fully covers the screen, hiding the model. */
export const GAS_MASK_VIEW_COVERED = 0.74;
const VIEW_FADE_START = 0.55;

/**
 * Donning in camera space. The right hand brings the mask up from below the
 * screen, holds it before the eyes, presses it to the face, then pulls the
 * strap over the head and leaves through the top right. The mask rides the
 * hand (offset to its right edge) until it reaches the face.
 */
interface HandKey {
  readonly at: number;
  readonly grip: THREE.Vector3;
}

const HAND_KEYS: ReadonlyArray<HandKey> = [
  { at: 0, grip: new THREE.Vector3(0.39, -0.61, -0.32) },
  { at: 0.38, grip: new THREE.Vector3(0.15, -0.14, -0.33) },
  { at: AT_FACE, grip: new THREE.Vector3(0.11, -0.07, -0.12) },
  { at: 0.86, grip: new THREE.Vector3(0.16, 0.22, -0.08) },
  { at: 1, grip: new THREE.Vector3(0.42, -0.05, 0) },
];

interface MaskKey {
  readonly at: number;
  readonly tilt: THREE.Euler;
}

const MASK_KEYS: ReadonlyArray<MaskKey> = [
  { at: 0, tilt: new THREE.Euler(-1.1, 0.5, 0.4) },
  { at: 0.38, tilt: new THREE.Euler(0.1, 0.12, 0.06) },
  { at: AT_FACE, tilt: new THREE.Euler(0, 0, 0) },
];

/** Grip point (the mask's right rim) relative to the eyepiece centre. */
const MASK_FROM_GRIP = new THREE.Vector3(-0.11, 0.06, 0);
/** Fingers point up and forward around the rim; the back of the hand faces right. */
const HAND_ROTATION = (() => {
  const fingers = new THREE.Vector3(-0.3, 0.7, -0.55).normalize();
  const z = fingers.clone().negate();
  const x = new THREE.Vector3(1, 0, 0.3).addScaledVector(z, -new THREE.Vector3(1, 0, 0.3).dot(z)).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
})();
/** The forearm continues the hand toward the elbow (hand +z). */
const ELBOW_FROM_GRIP = new THREE.Vector3(0, 0, 0.38).applyQuaternion(HAND_ROTATION);

const smooth = (value: number, from: number, to: number): number => THREE.MathUtils.smoothstep(value, from, to);

/** Eased position between the two hand keys around `progress`. */
function handGrip(progress: number, out: THREE.Vector3): THREE.Vector3 {
  const next = HAND_KEYS.findIndex((key) => key.at >= progress);
  if (next <= 0) return out.copy(HAND_KEYS[0].grip);
  const from = HAND_KEYS[next - 1];
  const to = HAND_KEYS[next];
  return out.lerpVectors(from.grip, to.grip, smooth(progress, from.at, to.at));
}

const tiltTarget = new THREE.Quaternion();

function maskTilt(progress: number, out: THREE.Quaternion): THREE.Quaternion {
  const next = MASK_KEYS.findIndex((key) => key.at >= progress);
  if (next === -1) return out.setFromEuler(MASK_KEYS[MASK_KEYS.length - 1].tilt);
  if (next === 0) return out.setFromEuler(MASK_KEYS[0].tilt);
  const from = MASK_KEYS[next - 1];
  const to = MASK_KEYS[next];
  return out.setFromEuler(from.tilt).slerp(tiltTarget.setFromEuler(to.tilt), smooth(progress, from.at, to.at));
}

/** 0..1 strength of the masked view at a donning progress. */
export function gasMaskViewLevel(progress: number): number {
  return smooth(progress, VIEW_FADE_START, GAS_MASK_VIEW_COVERED);
}

export type GasMaskWearState = 'off' | 'donning' | 'on' | 'doffing';

/**
 * First-person gas mask: the donning animation that borrows the right arm
 * (a `MeleeArmDriver`, like the knife) and how strongly the masked view
 * shows. Lives on the camera; owns no gameplay.
 */
export class GasMaskDonning implements MeleeArmDriver {
  readonly root = new THREE.Group();
  private readonly mask = new THREE.Group();
  private readonly grip = new THREE.Vector3();
  private progress = 0;
  private direction: 1 | -1 | 0 = 0;

  constructor() {
    this.root.name = 'gas-mask-view';
    // Own materials: the view-model depth patch must never reach world props.
    const rubber = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.72 });
    const model = buildGasMaskModel({
      rubber,
      lens: new THREE.MeshStandardMaterial({ color: 0x1d2b2b, roughness: 0.12, metalness: 0.3 }),
      filter: new THREE.MeshStandardMaterial({ color: 0x4b5136, roughness: 0.6, metalness: 0.2 }),
    });
    // Worn, the mask faces away from the eyes: turned around, eyepieces centred on the origin.
    model.rotation.y = Math.PI;
    model.position.set(0, -0.03, 0.13);
    // The head harness is what the wearer sees of the mask's back.
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.008, 6, 24).scale(1, 1.2, 1).translate(0, 0, 0.04), rubber);
    this.mask.add(model, strap);
    this.root.add(this.mask);
    applyViewModelDepth(this.root);
    this.pose();
  }

  get state(): GasMaskWearState {
    if (this.direction > 0) return 'donning';
    if (this.direction < 0) return 'doffing';
    return this.progress >= 1 ? 'on' : 'off';
  }

  get isAnimating(): boolean {
    return this.direction !== 0;
  }

  /** 0..1 strength of the masked view. */
  get viewLevel(): number {
    return gasMaskViewLevel(this.progress);
  }

  get firearmLowering(): number {
    if (!this.isAnimating) return 0;
    return smooth(this.progress, 0, 0.12) * (1 - smooth(this.progress, 0.86, 1));
  }

  get armWeight(): number {
    if (!this.isAnimating) return 0;
    return smooth(this.progress, 0, 0.06) * (1 - smooth(this.progress, 0.9, 1));
  }

  readHandTarget(grip: THREE.Vector3, rotation: THREE.Quaternion, elbow: THREE.Vector3): void {
    this.root.updateWorldMatrix(true, false);
    handGrip(this.progress, this.grip);
    elbow.copy(this.grip).add(ELBOW_FROM_GRIP);
    this.root.localToWorld(elbow);
    this.root.localToWorld(grip.copy(this.grip));
    this.root.getWorldQuaternion(rotation).multiply(HAND_ROTATION);
  }

  /** Starts putting the mask on; false unless the face is bare and still. */
  putOn(): boolean {
    if (this.state !== 'off') return false;
    this.direction = 1;
    this.pose();
    return true;
  }

  /** Starts taking the mask off; false unless it is worn and still. */
  takeOff(): boolean {
    if (this.state !== 'on') return false;
    this.direction = -1;
    this.pose();
    return true;
  }

  /** Advances the animation; returns the state it just settled in, else null. */
  update(dt: number): 'on' | 'off' | null {
    if (!this.isAnimating) return null;
    this.progress = THREE.MathUtils.clamp(this.progress + (this.direction * Math.max(0, dt)) / GAS_MASK_DON_DURATION, 0, 1);
    const settled = this.direction > 0 ? this.progress >= 1 : this.progress <= 0;
    if (settled) this.direction = 0;
    this.pose();
    return settled ? this.state as 'on' | 'off' : null;
  }

  /** Bare face, nothing animating. */
  reset(): void {
    this.progress = 0;
    this.direction = 0;
    this.pose();
  }

  /** The mask model rides the hand up to the face and hides once the masked view covers it. */
  private pose(): void {
    this.mask.visible = this.isAnimating && this.progress > 0.02 && this.progress < GAS_MASK_VIEW_COVERED;
    if (!this.mask.visible) return;
    handGrip(Math.min(this.progress, AT_FACE), this.mask.position).add(MASK_FROM_GRIP);
    maskTilt(this.progress, this.mask.quaternion);
  }
}
