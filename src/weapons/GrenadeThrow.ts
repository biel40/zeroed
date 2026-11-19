import * as THREE from 'three';
import { applyViewModelDepth } from '../rendering/ViewModelDepth';
import { getSettings } from '../core/PlayerSettings';
import { createWeaponBobPose, weaponBobPose } from '../player/WalkBob';
import type { WalkGaitSample } from '../player/WalkGait';
import { ARM_REST_BELOW_SCREEN, ArmChain, buildArmKeys, FIST_GRIP_ROTATION, type ArmPose } from './ArmChain';
import { F1GrenadeModel } from './F1GrenadeModel';
import type { MeleeArmDriver } from './ViewArms';

export const GRENADE_THROW_DURATION = 0.95;

// Phases (camera-space hand, checked against a 75 degree view): the fist
// rises into the right of the screen with the grenade, cocks back past the
// edge, whips forward through the upper right where it lets go, follows
// through across the bottom and drops away.
const RAISE: ArmPose = { yaw: 0.05, pitch: 0.45, roll: 0, flex: 1.15, twist: 0 };
const COCK: ArmPose = { yaw: -0.05, pitch: 0.6, roll: -0.1, flex: 1.45, twist: 0 };
const RELEASE: ArmPose = { yaw: 0.15, pitch: 0.75, roll: 0, flex: 0.25, twist: 0 };
const FOLLOW: ArmPose = { yaw: 0.45, pitch: 0.05, roll: -0.1, flex: 0.35, twist: 0.1 };
const RETRACT: ArmPose = { yaw: 0.6, pitch: -1.3, roll: 0, flex: 1.5, twist: 0.3 };

const RAISE_END = 0.26;
/** The wind-up: the arm waits here, grenade cocked, while it cooks. */
const COCK_END = 0.42;
/** The grenade leaves the hand here; the throw then follows through empty. */
export const GRENADE_RELEASE_PROGRESS = 0.55;
const FOLLOW_END = 0.68;
const RETRACT_POINT = 0.84;
/** The pin comes out as the fist reaches the screen. */
export const GRENADE_PIN_PROGRESS = 0.16;
/** The grenade exists in the hand only while the hand is on screen and holding it. */
const SHOW_PROGRESS = 0.04;

const KEYS = buildArmKeys([
  { at: 0, pose: ARM_REST_BELOW_SCREEN },
  { at: RAISE_END, pose: RAISE, drive: 0.4 },
  { at: COCK_END, pose: COCK },
  { at: GRENADE_RELEASE_PROGRESS, pose: RELEASE, drive: 1.6 },
  { at: FOLLOW_END, pose: FOLLOW, drive: 0.7 },
  { at: RETRACT_POINT, pose: RETRACT, drive: 1 },
  { at: 1, pose: ARM_REST_BELOW_SCREEN },
]);

// The firearm dips before the fist rises and comes back once it has gone.
const LOWER_IN_END = 0.1;
const LOWER_OUT_START = 0.72;
const ARM_TAKE_END = 0.05;
const ARM_GIVE_START = 0.84;
const ARM_GIVE_END = 0.96;
/** The grenade body sits in the palm, a little behind the grip point. */
const PALM_OFFSET = new THREE.Vector3(0, -0.004, 0.012);

const easeOutQuad = (t: number): number => 1 - (1 - t) ** 2;

/**
 * First-person overhand throw of a lethal grenade. Like the knife it
 * borrows the right arm while the left keeps the lowered weapon; the
 * grenade is in the fist until `onRelease`, where the mode launches the
 * real one into the world.
 */
export class GrenadeThrow implements MeleeArmDriver {
  public onPinPulled: (() => void) | null = null;
  public onRelease: (() => void) | null = null;

  private readonly chain = new ArmChain('grenade');
  public readonly root = this.chain.root;
  private readonly grenade = new F1GrenadeModel();
  private elapsed = GRENADE_THROW_DURATION;
  private pinPulled = true;
  private released = true;
  private readonly bob = createWeaponBobPose();

  public constructor() {
    this.root.name = 'grenade-throw-view';
    const holder = this.grenade.root;
    // The fuse points out of the thumb side, like the knife's blade.
    holder.quaternion.setFromEuler(FIST_GRIP_ROTATION).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
    holder.position.copy(PALM_OFFSET);
    this.chain.hand.add(holder);
    // Shown at rest, below the screen, until the first update hides it: the
    // map's shader warm-up only compiles what is visible.
    this.chain.apply(KEYS, 0);
    applyViewModelDepth(this.root);
  }

  public get isThrowing(): boolean {
    return this.elapsed < GRENADE_THROW_DURATION;
  }

  /** Held at the wind-up with the pin out: the fuse is burning in the hand. */
  public get isCooking(): boolean {
    return this.isThrowing && this.pinPulled && !this.released
      && this.elapsed >= COCK_END * GRENADE_THROW_DURATION - 1e-9;
  }

  public get firearmLowering(): number {
    if (!this.isThrowing) return 0;
    const progress = this.progress;
    if (progress < LOWER_IN_END) return easeOutQuad(progress / LOWER_IN_END);
    if (progress < LOWER_OUT_START) return 1;
    return 1 - THREE.MathUtils.smoothstep(progress, LOWER_OUT_START, 1);
  }

  public get armWeight(): number {
    if (!this.isThrowing) return 0;
    const progress = this.progress;
    const take = THREE.MathUtils.smoothstep(progress, 0, ARM_TAKE_END);
    return Math.min(take, 1 - THREE.MathUtils.smoothstep(progress, ARM_GIVE_START, ARM_GIVE_END));
  }

  public readHandTarget(grip: THREE.Vector3, rotation: THREE.Quaternion, elbow: THREE.Vector3): void {
    this.chain.readHandTarget(grip, rotation, elbow);
  }

  /** Starts a throw; false while one is already in the air of the arm. */
  public start(): boolean {
    if (this.isThrowing) return false;
    this.elapsed = 0;
    this.pinPulled = false;
    this.released = false;
    this.grenade.setPinPulled(false);
    this.root.visible = true;
    this.applyPose();
    return true;
  }

  /** `holding` keeps the arm cocked at the wind-up (cooking) until it lets go. */
  public update(dt: number, gait: WalkGaitSample, holding = false): void {
    if (!this.isThrowing) {
      this.root.visible = false;
      return;
    }
    // Same gait as the firearm bob so the arm stays grounded while moving.
    const bob = weaponBobPose(gait, getSettings().walkBob, this.bob);
    this.root.position.set(bob.x, bob.y, 0);
    const cocked = COCK_END * GRENADE_THROW_DURATION;
    const next = this.elapsed + dt;
    this.elapsed = Math.min(GRENADE_THROW_DURATION,
      holding && this.elapsed <= cocked + 1e-9 ? Math.min(next, cocked) : next);
    const progress = this.progress;
    if (!this.pinPulled && progress >= GRENADE_PIN_PROGRESS) {
      this.pinPulled = true;
      this.grenade.setPinPulled(true);
      this.onPinPulled?.();
    }
    if (!this.released && progress >= GRENADE_RELEASE_PROGRESS) {
      this.released = true;
      this.onRelease?.();
    }
    this.applyPose();
    if (!this.isThrowing) this.root.visible = false;
  }

  /** Interrupted (game over, restart): nothing in the hand, nothing thrown. */
  public reset(): void {
    this.elapsed = GRENADE_THROW_DURATION;
    this.pinPulled = this.released = true;
    this.root.visible = false;
    this.chain.apply(KEYS, 0);
  }

  private get progress(): number {
    return this.elapsed / GRENADE_THROW_DURATION;
  }

  private applyPose(): void {
    const progress = this.progress;
    this.chain.apply(KEYS, progress);
    this.grenade.root.visible = progress >= SHOW_PROGRESS && !this.released;
  }
}
