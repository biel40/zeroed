/** Seconds of a roar: on landing and on entering each new phase. */
export const ROAR_SECONDS = 1.1;
/** Share of a roar spent rearing up into it, and letting go of it. */
const ROAR_RISE = 0.2;
const ROAR_FALL = 0.3;

/**
 * Windup curve, 0..1 over the windup's progress: a slow coil that
 * quickens towards the release, so the strike reads as loaded.
 */
export function anticipation(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return p * p;
}

/** Weight of the roar overlay `time` seconds into it: rears up, holds, lets go. */
export function roarWeight(time: number): number {
  if (time <= 0 || time >= ROAR_SECONDS) return 0;
  const share = time / ROAR_SECONDS;
  if (share < ROAR_RISE) return smooth(share / ROAR_RISE);
  if (share > 1 - ROAR_FALL) return smooth((1 - share) / ROAR_FALL);
  return 1;
}

/** Hermite ease, 0..1 over 0..1 (clamped). */
export function smooth(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}
