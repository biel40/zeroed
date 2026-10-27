import * as THREE from 'three';
import { applyViewModelDepth } from '../rendering/ViewModelDepth';
import { ARM_FOREARM_LENGTH, ARM_UPPER_LENGTH } from './ArmRig';
import { buildKnifeModel } from './KnifeViewModel';
import { RIGHT_SHOULDER } from './ViewArms';
import type { MeleeArmDriver } from './ViewArms';

export const KNIFE_ATTACK_DURATION = 0.72;
export const KNIFE_RANGE = 2.4;

export function knifeDamageForRound(maxHp: number, round: number): number {
  return maxHp / Math.max(1, round);
}

/**
 * Arm chain in camera space: shoulder (yaw, pitch, roll) -> elbow (flex,
 * forearm twist) -> hand, with the shared right arm's shoulder and lengths.
 * The hand never rotates relative to the forearm, so the slash comes from
 * the whole arm instead of an isolated wrist flick. The chain carries no arm
 * geometry: the shared right hand follows it through readHandTarget().
 */
interface ArmPose {
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly flex: number;
  readonly twist: number;
}

/** Hammer grip: the handle crosses the fist at ~70 degrees to the forearm. */
const GRIP_ROTATION = new THREE.Euler(-0.987, 0.221, -0.962);
const HANDLE_CENTER = 0.075;

/**
 * Hand rotation in the forearm frame: the handle runs along the hand's
 * thumb axis (blade out of the thumb side) and the knuckles follow the
 * forearm, so the wrist stays straight while the knife is cocked.
 */
const HAND_IN_FOREARM = (() => {
  const y = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromEuler(GRIP_ROTATION));
  const z = new THREE.Vector3(0, 0, -1).addScaledVector(y, y.z).normalize().negate();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
})();

// Solved offline against hand targets, blade direction and a leading edge.
// Hidden below the right edge of the screen.
const REST: ArmPose = { yaw: -0.879, pitch: -2.067, roll: 0.394, flex: 2.009, twist: -0.851 };
// Raised on the right, edge already facing the cut.
const DRAW: ArmPose = { yaw: -0.12, pitch: 0.25, roll: -0.295, flex: 1.27, twist: -0.079 };
// Wind-up: the shoulder pulls the blade back against the cut before release.
const COCK: ArmPose = { yaw: -0.17, pitch: 0.29, roll: -0.334, flex: 1.27, twist: -0.112 };
// Blade spanning the crosshair: the instant the cut is resolved.
const CROSS: ArmPose = { yaw: 0.48, pitch: 0.37, roll: -0.22, flex: 0.668, twist: -0.034 };
// Carry the cut across at chest height before dropping into recovery.
const CUT_END: ArmPose = { yaw: 1.12, pitch: 0.48, roll: -0.24, flex: 0.443, twist: 0.202 };
const FOLLOW: ArmPose = { yaw: 1.24, pitch: 0.38, roll: -0.3, flex: 0.414, twist: 0.274 };
// Recovery drops the arm below the cut instead of retracing it.
const RETRACT: ArmPose = { yaw: 0.89, pitch: -1.404, roll: -0.045, flex: 1.765, twist: 0.503 };

// Phases: 13% raise, 4.5% wind-up, 20.5% slash, 12% follow-through, 50% recovery.
const DRAW_END = 0.13;
const COCK_END = 0.175;
const CROSSING = 0.3;
const SLASH_END = 0.38;
const FOLLOW_END = 0.5;
const RETRACT_POINT = 0.74;
// The shoulder sweep peaks at contact; the elbow, nearly straight by then,
// keeps a gentler extension so it eases through the frame instead of snapping.
const CROSS_DRIVE: ArmPose = { yaw: 2.2, pitch: 2, roll: 2, flex: 1, twist: 2 };

/** Contact is resolved when the blade crosses the centre of the screen. */
export const KNIFE_HIT_MOMENT = KNIFE_ATTACK_DURATION * CROSSING;

// The firearm dips out of the way before the hand enters and comes back up
// while the arm is still leaving, so both read as one coordinated motion.
const LOWER_IN_END = 0.09;
const LOWER_OUT_START = 0.5;

// The right hand drops off the dipping weapon grip and returns to it while
// it and the whole blade are below the screen (measured: the blade enters
// the frame after 3 % and has left it by 74 %). The knife only exists in
// between, so it never pops into view.
const ARM_TAKE_START = 0;
export const KNIFE_SHOW_PROGRESS = 0.03;
export const KNIFE_HIDE_PROGRESS = 0.77;
const ARM_GIVE_END = 0.94;

const easeOutQuad = (t: number): number => 1 - (1 - t) ** 2;
const smoothStep = (t: number): number => t * t * (3 - 2 * t);

const JOINTS = ['yaw', 'pitch', 'roll', 'flex', 'twist'] as const;

interface Key {
  readonly at: number;
  readonly pose: ArmPose;
  /** Joint velocity per unit of progress; zero where the arm settles. */
  readonly velocity: ArmPose;
}

/**
 * Hermite keys: the arm settles at the wind-up, at the end of the
 * follow-through and at rest. Elsewhere `drive` scales the tangent through the
 * neighbouring keys (1 = Catmull-Rom): the raise drifts on into the wind-up,
 * the cut accelerates to its peak speed at contact and bites hard right after
 * it, and the recovery drops in one continuous motion.
 */
function buildKeys(keys: readonly { at: number; pose: ArmPose; drive?: number | ArmPose }[]): Key[] {
  const still: ArmPose = { yaw: 0, pitch: 0, roll: 0, flex: 0, twist: 0 };
  return keys.map(({ at, pose, drive }, index) => {
    if (!drive) return { at, pose, velocity: still };
    const before = keys[index - 1];
    const after = keys[index + 1];
    const velocity: Record<(typeof JOINTS)[number], number> = { ...still };
    for (const joint of JOINTS) {
      const scale = typeof drive === 'number' ? drive : drive[joint];
      velocity[joint] = (scale * (after.pose[joint] - before.pose[joint])) / (after.at - before.at);
    }
    return { at, pose, velocity };
  });
}

const KEYS = buildKeys([
  { at: 0, pose: REST },
  { at: DRAW_END, pose: DRAW, drive: 0.35 },
  { at: COCK_END, pose: COCK },
  { at: CROSSING, pose: CROSS, drive: CROSS_DRIVE },
  { at: SLASH_END, pose: CUT_END, drive: 0.6 },
  { at: FOLLOW_END, pose: FOLLOW },
  { at: RETRACT_POINT, pose: RETRACT, drive: 1 },
  { at: 1, pose: REST },
]);

function hermite(from: Key, to: Key, joint: (typeof JOINTS)[number], s: number): number {
  const span = to.at - from.at;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * from.pose[joint]
    + (s3 - 2 * s2 + s) * span * from.velocity[joint]
    + (3 * s2 - 2 * s3) * to.pose[joint]
    + (s3 - s2) * span * to.velocity[joint];
}

/** First-person knife: the slash animation that borrows the right arm. */
export class Knife implements MeleeArmDriver {
  public readonly root = new THREE.Group();
  public onSwing: (() => void) | null = null;
  public onImpact: (() => void) | null = null;

  private readonly shoulder = new THREE.Group();
  private readonly elbow = new THREE.Group();
  private readonly hand = new THREE.Group();
  private readonly model = new THREE.Group();
  private elapsed = KNIFE_ATTACK_DURATION;
  private impactApplied = false;
  private previousTrigger = false;
  private active = false;
  private bobTime = 0;

  public constructor() {
    this.root.name = 'knife-view';
    this.buildView();
    this.applyPose(0);
    this.root.visible = false;
    applyViewModelDepth(this.root);
  }

  public get enabled(): boolean {
    return this.active;
  }

  public get isAttacking(): boolean {
    return this.elapsed < KNIFE_ATTACK_DURATION;
  }

  /** 0..1: how far the equipped firearm view must dip to clear the arm. */
  public get firearmLowering(): number {
    if (!this.active || !this.isAttacking) return 0;
    const progress = this.elapsed / KNIFE_ATTACK_DURATION;
    if (progress < LOWER_IN_END) return easeOutQuad(progress / LOWER_IN_END);
    if (progress < LOWER_OUT_START) return 1;
    return 1 - smoothStep((progress - LOWER_OUT_START) / (1 - LOWER_OUT_START));
  }

  /** 0..1 share of the right hand owned by the slash (0 = on the weapon grip). */
  public get armWeight(): number {
    if (!this.active || !this.isAttacking) return 0;
    const progress = this.elapsed / KNIFE_ATTACK_DURATION;
    const take = THREE.MathUtils.smoothstep(progress, ARM_TAKE_START, KNIFE_SHOW_PROGRESS);
    return Math.min(take, 1 - THREE.MathUtils.smoothstep(progress, KNIFE_HIDE_PROGRESS, ARM_GIVE_END));
  }

  /** Knife model shown in the hand; only while the slash owns the arm. */
  public get knifeVisible(): boolean {
    return this.root.visible && this.model.visible;
  }

  public readHandTarget(grip: THREE.Vector3, rotation: THREE.Quaternion, elbow: THREE.Vector3): void {
    this.root.updateWorldMatrix(true, true);
    this.hand.getWorldPosition(grip);
    this.elbow.getWorldQuaternion(rotation).multiply(HAND_IN_FOREARM);
    this.elbow.getWorldPosition(elbow);
  }

  public setEnabled(enabled: boolean): void {
    if (enabled === this.active) {
      // Visibility is derived state. Reasserting it here makes cleanup robust
      // if a view transition or interrupted frame changed the Object3D only.
      this.root.visible = enabled;
      return;
    }
    this.active = enabled;
    this.root.visible = enabled;
    this.elapsed = KNIFE_ATTACK_DURATION;
    this.impactApplied = false;
    this.applyPose(0);
  }

  public reset(): void {
    this.previousTrigger = false;
    this.active = false;
    this.root.visible = false;
    this.elapsed = KNIFE_ATTACK_DURATION;
    this.impactApplied = false;
    this.applyPose(0);
  }

  public trigger(): boolean {
    if (!this.active || this.isAttacking) return false;
    this.elapsed = 0;
    this.impactApplied = false;
    this.onSwing?.();
    return true;
  }

  public update(dt: number, trigger: boolean, speed01: number): void {
    const triggerEdge = trigger && !this.previousTrigger;
    this.previousTrigger = trigger;
    if (!this.active) return;

    if (triggerEdge) this.trigger();
    // Same gait as the firearm bob so the arm stays grounded while moving.
    this.bobTime += dt * (5 + speed01 * 5);
    this.root.position.set(
      Math.sin(this.bobTime) * 0.005 * speed01,
      Math.abs(Math.cos(this.bobTime)) * 0.004 * speed01,
      0,
    );
    if (!this.isAttacking) return;

    const previous = this.elapsed;
    this.elapsed = Math.min(KNIFE_ATTACK_DURATION, this.elapsed + dt);
    this.applyPose(this.elapsed / KNIFE_ATTACK_DURATION);
    if (!this.impactApplied && previous < KNIFE_HIT_MOMENT && this.elapsed >= KNIFE_HIT_MOMENT) {
      this.impactApplied = true;
      this.onImpact?.();
    }
  }

  private applyPose(progress: number): void {
    let index = 1;
    while (index < KEYS.length - 1 && progress >= KEYS[index].at) index++;
    const from = KEYS[index - 1];
    const to = KEYS[index];
    const s = THREE.MathUtils.clamp((progress - from.at) / (to.at - from.at), 0, 1);
    this.shoulder.rotation.set(
      hermite(from, to, 'pitch', s),
      hermite(from, to, 'yaw', s),
      hermite(from, to, 'roll', s),
      'YXZ',
    );
    this.elbow.rotation.set(hermite(from, to, 'flex', s), 0, hermite(from, to, 'twist', s), 'XYZ');
    this.model.visible = progress >= KNIFE_SHOW_PROGRESS && progress < KNIFE_HIDE_PROGRESS;
  }

  private buildView(): void {
    this.shoulder.name = 'knife-upper-arm';
    this.shoulder.position.copy(RIGHT_SHOULDER);
    this.root.add(this.shoulder);
    this.elbow.name = 'knife-forearm';
    this.elbow.position.z = -ARM_UPPER_LENGTH;
    this.shoulder.add(this.elbow);
    // Handle center: the point the shared hand closes on.
    this.hand.name = 'knife-hand';
    this.hand.position.z = -ARM_FOREARM_LENGTH;
    this.elbow.add(this.hand);
    const knife = this.model;
    knife.name = 'knife-model';
    knife.quaternion.setFromEuler(GRIP_ROTATION);
    knife.position.set(0, 0, -HANDLE_CENTER).applyQuaternion(knife.quaternion);
    this.hand.add(knife);

    buildKnifeModel(knife);
  }
}
