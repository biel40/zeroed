/** Seconds the first-person body takes to collapse before the verdict shows. */
export const DEATH_FALL_DURATION = 1.1;

/** Camera offsets (relative to the standing eye) at the end of the fall. */
const FALL_DROP = 1.45;
const FALL_ROLL = 1.25;
const FALL_PITCH = -0.32;
const FALL_SIDE_SHIFT = 0.22;

export interface DeathFallPose {
  /** Metres below the standing eye height. */
  readonly drop: number;
  /** Sideways shift along the camera's local X, so the head lands beside the body. */
  readonly sideShift: number;
  readonly pitch: number;
  readonly roll: number;
}

/**
 * Pose of the dying player's camera `elapsed` seconds into the collapse:
 * knees buckle first (slow start), the body tips over and hits the floor
 * with a short rebound. Clamped at both ends so callers can feed raw time.
 */
export function deathFallPose(elapsed: number): DeathFallPose {
  const t = Math.min(Math.max(elapsed / DEATH_FALL_DURATION, 0), 1);
  const fall = t * t * (3 - 2 * t) * t;
  // A small bump once the head meets the floor sells the impact.
  const impact = t > 0.8 ? Math.sin(((t - 0.8) / 0.2) * Math.PI) * 0.06 : 0;
  return {
    drop: FALL_DROP * fall - impact,
    sideShift: FALL_SIDE_SHIFT * fall,
    pitch: FALL_PITCH * fall,
    roll: FALL_ROLL * fall,
  };
}
