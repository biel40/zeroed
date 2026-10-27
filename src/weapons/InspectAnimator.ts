import * as THREE from 'three';
import { accelerate, dampedWobble, impact, overshootRamp, pulse, ramp } from './AnimationCurves';
import { captureHome, poseDetachedMagazine, restoreHome, type HomePose } from './ReloadAnimator';
import type { Weapon } from './Weapon';
import type { ReloadAnimConfig, ReloadPhase, ReloadPoseConfig, ReloadStyle } from './WeaponTypes';
import { damp } from '../utils/math';

/** Reload styles whose detachable magazine the inspection draws to show its rounds. */
const MAGAZINE_CHECK_STYLES: ReadonlySet<ReloadStyle> = new Set(['rifle', 'rock', 'drum', 'pistol']);

/** Whether the inspection of a weapon with this reload includes the magazine check. */
export function checksMagazine(reload: ReloadAnimConfig | null): reload is ReloadAnimConfig {
  return reload !== null && MAGAZINE_CHECK_STYLES.has(reload.style);
}

/** Inspection beats, as fractions of INSPECT_TIME. */
export const INSPECT_TIMELINE = {
  /** Raised with the right flank (ejection side) to the eye. */
  rightFlankIn: 0.13,
  /** Rolled over to show the left flank. */
  leftFlankFrom: 0.27,
  leftFlankTo: 0.4,
  /** Turned to the magazine with the weapon's reload swap pose. */
  magazineFrom: 0.46,
  magazineTo: 0.56,
  /** Magazine check: drawn clear of the well, held to the eye, pushed back home. */
  magOut: 0.52,
  magClear: 0.6,
  magIn: 0.75,
  magSeat: 0.82,
  /** Back down to the hip, settling with a short wobble. */
  homeFrom: 0.86,
} as const;

/** Whole-weapon poses shared by every firearm; the magazine pose comes from its reload. */
const RIGHT_FLANK: ReloadPoseConfig = { shift: [-0.07, 0.09, 0.02], yaw: -0.45, roll: 0.42, tilt: 0.06 };
const LEFT_FLANK: ReloadPoseConfig = { shift: [-0.1, 0.12, 0.03], yaw: 0.6, roll: -0.38, tilt: 0.1 };
/** Magazine held clear of the well: nudged toward the eye with its top tipped up to show the rounds. */
const SHOW_OFFSET_X = -0.012;
const SHOW_TIP = 0.3;
const SHOW_TURN = 0.18;
/** How fast an interrupted inspection lets go of its pose (1/s). */
const RELEASE_RATE = 16;

/**
 * Weapon inspection choreography, driven by Weapon.inspectProgress: the
 * weapon comes up showing its right flank, rolls to the left one and, for
 * detachable box and drum magazines, draws the magazine to show the rounds it
 * carries before seating it again. Outputs a body pose layered by WeaponView;
 * an interrupted inspection lets go of it quickly instead of snapping.
 */
export class InspectAnimator {
  /** Magazine foley, wired to the same handler as the reload phases. */
  onPhase: ((phase: ReloadPhase) => void) | null = null;

  bodyTilt = 0;
  bodyRoll = 0;
  bodyYaw = 0;
  readonly bodyShift = new THREE.Vector3();

  private readonly magHome: HomePose | null = null;
  private readonly fired = new Set<ReloadPhase>();
  private progress = 0;
  private weight = 0;
  private active = false;

  constructor(
    private readonly reload: ReloadAnimConfig | null,
    private readonly magazine: THREE.Object3D | null,
  ) {
    if (magazine && checksMagazine(reload)) this.magHome = captureHome(magazine);
  }

  update(dt: number, weapon: Weapon): void {
    const p = weapon.inspectProgress;
    if (p !== null) {
      if (!this.active || p < this.progress) this.fired.clear();
      this.active = true;
      this.progress = p;
      this.weight = 1;
      this.animateMagazine(p);
    } else {
      if (this.active) this.seatMagazine();
      this.active = false;
      this.weight = this.weight < 1e-3 ? 0 : damp(this.weight, 0, RELEASE_RATE, dt);
    }
    this.animateBody(this.progress, this.weight);
  }

  /** Immediate cleanup for hidden/restarted view models. */
  reset(): void {
    if (this.active) this.seatMagazine();
    this.active = false;
    this.weight = 0;
    this.progress = 0;
    this.animateBody(0, 0);
  }

  private seatMagazine(): void {
    if (this.magazine && this.magHome) restoreHome(this.magazine, this.magHome);
  }

  private cross(p: number, threshold: number, phase: ReloadPhase): void {
    if (p < threshold || this.fired.has(phase)) return;
    this.fired.add(phase);
    this.onPhase?.(phase);
  }

  private animateMagazine(p: number): void {
    const mag = this.magazine;
    const home = this.magHome;
    if (!mag || !home || !checksMagazine(this.reload)) return;
    const T = INSPECT_TIMELINE;
    this.cross(p, T.magOut, 'magOut');
    this.cross(p, T.magIn, 'magIn');
    this.cross(p, T.magSeat, 'magSeat');
    if (p < T.magOut || p >= T.magSeat) {
      restoreHome(mag, home);
      return;
    }
    // Drawn out the way the reload strips it, then pushed home gathering speed.
    const out = p < T.magIn ? ramp(p, T.magOut, T.magClear) : 1 - accelerate(p, T.magIn, T.magSeat);
    poseDetachedMagazine(mag, home, this.reload, out);
    const show = ramp(p, T.magClear - 0.02, T.magClear + 0.04) * (1 - ramp(p, T.magIn - 0.05, T.magIn));
    mag.position.x += show * SHOW_OFFSET_X;
    mag.rotateZ(show * SHOW_TIP);
    mag.rotateY(pulse(p, T.magClear, T.magIn) * SHOW_TURN);
  }

  private animateBody(p: number, weight: number): void {
    const T = INSPECT_TIMELINE;
    const raise = overshootRamp(p, 0, T.rightFlankIn);
    const toLeft = ramp(p, T.leftFlankFrom, T.leftFlankTo);
    const toMagazine = ramp(p, T.magazineFrom, T.magazineTo);
    const homeward = ramp(p, T.homeFrom, 1);
    const right = raise * (1 - toLeft);
    const left = toLeft * (1 - toMagazine);
    const magazineView = toMagazine * (1 - homeward);
    const magazinePose = this.reload?.swapPose ?? LEFT_FLANK;

    // A slow hand drift while held, the tug of the release and the slap of the seat.
    const drift = Math.sin(p * Math.PI * 5) * 0.012 * raise * (1 - homeward);
    const handled = this.magHome !== null;
    const tug = handled ? impact(p, T.magOut, T.magOut + 0.06) : 0;
    const seat = handled ? impact(p, T.magSeat - 0.006, T.magSeat + 0.06) : 0;
    const settle = p > T.homeFrom ? dampedWobble((p - T.homeFrom) / (1 - T.homeFrom)) : 0;

    const blend = (key: 'tilt' | 'roll' | 'yaw'): number =>
      right * RIGHT_FLANK[key] + left * LEFT_FLANK[key] + magazineView * magazinePose[key];
    this.bodyTilt = weight * (blend('tilt') + drift - tug * 0.05 - seat * 0.07 + settle * 0.04);
    this.bodyRoll = weight * (blend('roll') + drift * 0.6 - tug * 0.08 + seat * 0.03 + settle * 0.06);
    this.bodyYaw = weight * blend('yaw');
    for (let axis = 0; axis < 3; axis++) {
      const shift = right * RIGHT_FLANK.shift[axis] + left * LEFT_FLANK.shift[axis] + magazineView * magazinePose.shift[axis];
      this.bodyShift.setComponent(axis, weight * shift);
    }
    this.bodyShift.y += weight * seat * 0.012;
  }
}
