import * as THREE from 'three';
import { ARM_DETAIL, ELBOW_HINT_SHARE, FirstPersonArm } from './FirstPersonArm';
import type { ArmDetail } from './FirstPersonArm';
import type { WeaponHands } from './WeaponHands';
import type { HandPoseId } from './WeaponTypes';

/** Camera-space shoulders: below the screen, the left one forward to reach handguards. */
export const RIGHT_SHOULDER = new THREE.Vector3(0.27, -0.37, 0);
export const LEFT_SHOULDER = new THREE.Vector3(-0.1, -0.42, -0.22);

/** Finger poses settle in ~0.15 s instead of snapping. */
const POSE_RATE = 22;
/** Elbow hint distance along the anchor pole. */
const POLE_REACH = 0.4;

/** A mode-owned melee animation that borrows the right arm (the knife). */
export interface MeleeArmDriver {
  /** 0..1 dip of the firearm view while the melee plays. */
  readonly firearmLowering: number;
  /** 0..1 share of the right hand owned by the melee animation. */
  readonly armWeight: number;
  /** World-space grip point, hand rotation and elbow position of the melee hand. */
  readHandTarget(grip: THREE.Vector3, rotation: THREE.Quaternion, elbow: THREE.Vector3): void;
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
  private lastHands: WeaponHands | null = null;

  private readonly grip = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly pole = new THREE.Vector3();
  private readonly hint = new THREE.Vector3();
  private readonly meleeGrip = new THREE.Vector3();
  private readonly meleeRotation = new THREE.Quaternion();
  private readonly meleeElbow = new THREE.Vector3();

  constructor(detail: ArmDetail = ARM_DETAIL.desktop) {
    this.root.name = 'view-arms';
    this.right = new FirstPersonArm('right', detail);
    this.left = new FirstPersonArm('left', detail);
    this.right.root.position.copy(RIGHT_SHOULDER);
    this.left.root.position.copy(LEFT_SHOULDER);
    this.root.add(this.right.root, this.left.root);
  }

  update(dt: number, view: ArmedView, melee: MeleeArmDriver | null): void {
    const hands = view.hands;
    // A new weapon pops in with its own grips: fingers snap with it.
    const blend = hands === this.lastHands ? 1 - Math.exp(-POSE_RATE * dt) : 1;
    this.lastHands = hands;
    view.root.updateWorldMatrix(true, true);
    const weaponVisible = view.root.visible;
    const meleeWeight = melee ? THREE.MathUtils.clamp(melee.armWeight, 0, 1) : 0;

    // Right hand: weapon grip, blended into the melee hand when it takes over.
    // Every weapon declares a right grip, so read() never returns null here.
    let pose: HandPoseId = hands.read('right', this.grip, this.rotation, this.pole) ?? 'fist';
    const rightVisible = weaponVisible || meleeWeight > 0;
    this.right.root.visible = rightVisible;
    if (rightVisible) {
      this.right.getShoulderWorldPosition(this.hint).addScaledVector(this.pole, POLE_REACH);
      if (melee && meleeWeight > 0) {
        melee.readHandTarget(this.meleeGrip, this.meleeRotation, this.meleeElbow);
        this.grip.lerp(this.meleeGrip, meleeWeight);
        this.rotation.slerp(this.meleeRotation, meleeWeight);
        this.hint.lerp(this.meleeElbow, meleeWeight);
        if (meleeWeight >= 0.5) pose = 'fist';
      }
      this.right.setHandPose(pose, blend);
      // The knife's own elbow is authored: follow it exactly while it owns the arm.
      this.right.reachGrip(this.grip, this.rotation, this.hint, THREE.MathUtils.lerp(ELBOW_HINT_SHARE, 1, meleeWeight));
    }

    // Left hand: always on the weapon (it keeps holding it during the knife).
    const leftPose = weaponVisible ? hands.read('left', this.grip, this.rotation, this.pole) : null;
    this.left.root.visible = leftPose !== null;
    if (leftPose !== null) {
      this.left.getShoulderWorldPosition(this.hint).addScaledVector(this.pole, POLE_REACH);
      this.left.setHandPose(leftPose, blend);
      this.left.reachGrip(this.grip, this.rotation, this.hint);
    }
  }
}
