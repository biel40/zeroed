import * as THREE from 'three';
import { applyViewModelDepth } from '../rendering/ViewModelDepth';
import { ARM_DETAIL, FirstPersonArm } from './FirstPersonArm';
import type { ArmDetail } from './FirstPersonArm';
import { HAND_POSES } from './HandPoses';
import { HandRings } from './HandRings';
import type { HandPose } from './HandPoses';
import type { WeaponHands } from './WeaponHands';

/** Camera-space shoulder of the knife's authored arm chain. */
export const RIGHT_SHOULDER = new THREE.Vector3(0.27, -0.37, 0);
/**
 * Camera-space points the upper arms reach back toward while holding a
 * weapon: below and behind the screen, so the forearms leave it through the
 * bottom corners and the shoulders follow the grips instead of the wrists.
 */
const RIGHT_REACH = new THREE.Vector3(0.42, -0.3, 0.3);
const LEFT_REACH = new THREE.Vector3(-0.4, -0.34, 0.1);

/** Finger poses settle in ~0.15 s instead of snapping. */
const POSE_RATE = 22;

/**
 * Camera-space point the support hand rises from when the weapon offers it
 * no grip to start from (a one-handed hold): below the screen, left.
 */
const LEFT_REST = new THREE.Vector3(-0.28, -0.58, -0.3);

/** A mode-owned melee animation that borrows the right arm (the knife). */
export interface MeleeArmDriver {
  /** 0..1 dip of the firearm view while the melee plays. */
  readonly firearmLowering: number;
  /** 0..1 share of the right hand owned by the melee animation. */
  readonly armWeight: number;
  /** World-space grip point, hand rotation and elbow position of the melee hand. */
  readHandTarget(grip: THREE.Vector3, rotation: THREE.Quaternion, elbow: THREE.Vector3): void;
  /** Finger pose of the right hand while the animation owns it; a fist when absent. */
  readonly handPose?: HandPose;
  /** Present when the animation takes the left hand off the weapon too. */
  readonly support?: SupportArmDriver;
}

/** The left-hand half of an animation that works on the right hand (putting a ring on). */
export interface SupportArmDriver {
  /** 0..1 share of the left hand taken off the weapon. */
  readonly supportWeight: number;
  /** Finger pose of the left hand once it is mostly off the weapon. */
  readonly supportPose: HandPose;
  /** World-space grip point and rotation of the left hand, read once the right hand is placed this frame. */
  readSupportTarget(grip: THREE.Vector3, rotation: THREE.Quaternion): void;
  /** The left hand is placed and grips `grip` (world space): what it carries goes there. */
  carry(grip: THREE.Vector3): void;
}

/** The weapon view parts the arms follow. */
export interface ArmedView {
  readonly root: THREE.Object3D;
  readonly hands: WeaponHands;
}

/**
 * Both first-person arms. Each frame the hands go to the equipped weapon's
 * grips; a melee driver can take over the right hand while the left keeps
 * holding the lowered weapon. Lives on the camera; orchestration only.
 */
export class ViewArms {
  readonly root = new THREE.Group();
  readonly right: FirstPersonArm;
  readonly left: FirstPersonArm;
  /**
   * Rings ride the right hand: it wraps the grip below the sight line of
   * every weapon, while the support hand may sit near the sights.
   */
  readonly rings: HandRings;
  private lastHands: WeaponHands | null = null;

  private readonly grip = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly shoulder = new THREE.Vector3();
  private readonly meleeGrip = new THREE.Vector3();
  private readonly meleeRotation = new THREE.Quaternion();
  private readonly meleeElbow = new THREE.Vector3();
  private readonly supportGrip = new THREE.Vector3();
  private readonly supportRotation = new THREE.Quaternion();

  constructor(detail: ArmDetail = ARM_DETAIL.desktop) {
    this.root.name = 'view-arms';
    this.right = new FirstPersonArm('right', detail);
    this.left = new FirstPersonArm('left', detail);
    this.root.add(this.right.root, this.left.root);
    this.rings = new HandRings(this.right);
    applyViewModelDepth(this.root);
  }

  update(dt: number, view: ArmedView, melee: MeleeArmDriver | null): void {
    this.rings.update(dt);
    const hands = view.hands;
    // A new weapon pops in with its own grips: fingers snap with it.
    const blend = hands === this.lastHands ? 1 - Math.exp(-POSE_RATE * dt) : 1;
    this.lastHands = hands;
    view.root.updateWorldMatrix(true, true);
    const weaponVisible = view.root.visible;
    const meleeWeight = melee ? THREE.MathUtils.clamp(melee.armWeight, 0, 1) : 0;

    // Right hand: weapon grip, blended into the melee hand when it takes over.
    // Every weapon declares a right grip, so read() never returns null here.
    let pose: HandPose = hands.read('right', this.grip, this.rotation) ?? HAND_POSES.fist;
    const rightVisible = weaponVisible || meleeWeight > 0;
    this.right.root.visible = rightVisible;
    if (rightVisible) {
      // The knife's chain is authored from its own shoulder: follow it exactly while it owns the arm.
      this.shoulder.lerpVectors(RIGHT_REACH, RIGHT_SHOULDER, meleeWeight);
      if (melee && meleeWeight > 0) {
        melee.readHandTarget(this.meleeGrip, this.meleeRotation, this.meleeElbow);
        this.grip.lerp(this.meleeGrip, meleeWeight);
        this.rotation.slerp(this.meleeRotation, meleeWeight);
        if (meleeWeight >= 0.5) pose = melee.handPose ?? HAND_POSES.fist;
      }
      this.right.setHandPose(pose, blend);
      this.right.reachGrip(this.grip, this.rotation, this.root.localToWorld(this.shoulder), this.meleeElbow, meleeWeight);
    }

    // Left hand: on the weapon (it keeps holding it during the knife), unless
    // a support driver takes it off to work on the right hand.
    let leftPose = weaponVisible ? hands.read('left', this.grip, this.rotation) : null;
    const support = melee?.support ?? null;
    const supportWeight = support ? THREE.MathUtils.clamp(support.supportWeight, 0, 1) : 0;
    if (support && supportWeight > 0) {
      support.readSupportTarget(this.supportGrip, this.supportRotation);
      if (leftPose === null) {
        this.root.localToWorld(this.grip.copy(LEFT_REST));
        this.rotation.copy(this.supportRotation);
      }
      this.grip.lerp(this.supportGrip, supportWeight);
      this.rotation.slerp(this.supportRotation, supportWeight);
      if (leftPose === null || supportWeight >= 0.5) leftPose = support.supportPose;
    }
    this.left.root.visible = leftPose !== null;
    if (leftPose !== null) {
      this.left.setHandPose(leftPose, blend);
      this.left.reachGrip(this.grip, this.rotation, this.root.localToWorld(this.shoulder.copy(LEFT_REACH)));
      if (support) support.carry(this.left.getGripWorldPosition(this.supportGrip));
    }
  }
}
