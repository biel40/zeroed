import { FOOTSTEP_VARIATION } from '../config/footsteps';

/** A variant out of `count`, never `previous` again (when there is a choice). */
export function pickFootstepVariant(count: number, previous: number, random: () => number): number {
  if (count <= 1) return 0;
  const candidate = Math.min(count - 2, Math.floor(random() * (count - 1)));
  return previous >= 0 && candidate >= previous ? candidate + 1 : candidate;
}

/** Playback rate of one step: ±3 % around the recording. */
export function footstepPlaybackRate(random: () => number): number {
  return 1 + (random() * 2 - 1) * FOOTSTEP_VARIATION.pitch;
}

/** Level of one step: ±7 % around the surface's own. */
export function footstepGainScale(random: () => number): number {
  return 1 + (random() * 2 - 1) * FOOTSTEP_VARIATION.volume;
}

/** Remembers the last variant per key (a surface), so no clip plays twice in a row. */
export class FootstepVariantPicker {
  private readonly last = new Map<string, number>();

  public constructor(private readonly random: () => number = Math.random) {}

  public next(key: string, count: number): number {
    const index = pickFootstepVariant(count, this.last.get(key) ?? -1, this.random);
    this.last.set(key, index);
    return index;
  }
}
