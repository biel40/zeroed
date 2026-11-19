import { WALK_BOB } from '../config/walkBob';
import type { WalkGaitSample } from './WalkGait';

/** What the bob reads of the gait: where in the stride and how strongly. */
type BobGait = Pick<WalkGaitSample, 'phase' | 'intensity'>;

/** Camera-space offset of the head, metres. */
export interface HeadBobOffset {
  x: number;
  y: number;
}

/** Offset and tilt of a first-person weapon or arm, in camera space. */
export interface WeaponBobPose {
  x: number;
  y: number;
  roll: number;
  pitch: number;
}

export function createHeadBobOffset(): HeadBobOffset {
  return { x: 0, y: 0 };
}

export function createWeaponBobPose(): WeaponBobPose {
  return { x: 0, y: 0, roll: 0, pitch: 0 };
}

/**
 * Head motion at `gait` into `out` (no allocation): a dip at each footfall
 * and a shift towards the supporting foot. `amount` scales it (aim, setting).
 */
export function headBobOffset(gait: BobGait, amount: number, out: HeadBobOffset): HeadBobOffset {
  const { vertical, lateral } = WALK_BOB.head;
  const scale = gait.intensity * amount;
  out.x = Math.sin(gait.phase) * lateral * scale;
  out.y = -Math.cos(gait.phase * 2) * vertical * scale;
  return out;
}

/**
 * Weapon motion at `gait` into `out` (no allocation): a figure of eight that
 * trails the head slightly, rolling with the stride and dipping the muzzle on
 * each footfall. `amount` scales it (weapon handling, aim, setting).
 */
export function weaponBobPose(gait: BobGait, amount: number, out: WeaponBobPose): WeaponBobPose {
  const { vertical, lateral, roll, pitch, phaseLag } = WALK_BOB.weapon;
  const scale = gait.intensity * amount;
  const phase = gait.phase - phaseLag;
  const side = Math.sin(phase) * scale;
  const fall = Math.cos(phase * 2) * scale;
  out.x = side * lateral;
  out.y = -fall * vertical;
  out.roll = side * roll;
  out.pitch = -fall * pitch;
  return out;
}
