/** Seconds of a roar: on landing and on entering each new phase. */
export const ROAR_SECONDS = 1.1;
/** Share of a roar spent rearing up into it, and letting go of it. */
const ROAR_RISE = 0.2;
const ROAR_FALL = 0.3;
/** A flinch's decay (per second) and its wobble back past rest (rad/s). */
const FLINCH_DECAY = 9;
const FLINCH_WOBBLE = 18;

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

/**
 * A body's jolt from a hit: kicked to `strength`, it snaps back with a
 * short wobble past rest. A stream of hits (flames) keeps it shaking
 * without ever adding up past a full jolt. `value` is -1..1.
 */
export class Flinch {
  private amplitude = 0;
  private elapsed = 0;

  public get value(): number {
    return this.amplitude * Math.exp(-this.elapsed * FLINCH_DECAY) * Math.cos(this.elapsed * FLINCH_WOBBLE);
  }

  public kick(strength: number): void {
    const current = Math.abs(this.value);
    this.amplitude = Math.min(1, Math.max(current, Math.abs(strength)));
    this.elapsed = 0;
  }

  public update(dt: number): void {
    this.elapsed += Math.max(0, dt);
  }

  public reset(): void {
    this.amplitude = 0;
    this.elapsed = 0;
  }
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}
