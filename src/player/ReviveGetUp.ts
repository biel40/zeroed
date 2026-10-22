/** Camera offsets (relative to the standing eye) at the bottom of the slump. */
const SLUMP_DROP = 0.95;
const SLUMP_PITCH = -0.38;
const SLUMP_ROLL = 0.32;
/** Shares of the get-up: the knees give way, the body stays down, then rises. */
const COLLAPSE_END = 0.14;
const RISE_START = 0.38;
/** A small stagger while standing up, so the rise does not look like a lift. */
const STAGGER_ROLL = 0.05;

export interface GetUpPose {
  /** Metres below the standing eye height. */
  readonly drop: number;
  readonly pitch: number;
  readonly roll: number;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/**
 * Camera pose `elapsed` seconds into getting back up after a Resurrection
 * ring fires: the player drops to their knees at once, stays down a moment
 * and pushes back up with a stagger. Clamped at both ends; the pose is zero
 * once `duration` has passed.
 */
export function getUpPose(elapsed: number, duration: number): GetUpPose {
  const t = Math.min(Math.max(elapsed / duration, 0), 1);
  let slump: number;
  if (t < COLLAPSE_END) slump = smooth(t / COLLAPSE_END);
  else if (t < RISE_START) slump = 1;
  else slump = 1 - smooth((t - RISE_START) / (1 - RISE_START));
  const rising = t >= RISE_START && t < 1 ? Math.sin(((t - RISE_START) / (1 - RISE_START)) * Math.PI * 2) : 0;
  return {
    drop: SLUMP_DROP * slump,
    pitch: SLUMP_PITCH * slump,
    roll: SLUMP_ROLL * slump + STAGGER_ROLL * rising * slump,
  };
}
