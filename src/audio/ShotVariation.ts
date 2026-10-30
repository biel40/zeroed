/**
 * Per-shot humanization of a sampled gunshot: the same recording repeated
 * verbatim sounds mechanical. `pitch` 0.03 plays it between 0.97x and 1.03x;
 * `volume` 0.05 scales it between 0.95 and 1, never above the configured gain.
 */
export interface ShotVariation {
  readonly pitch: number;
  readonly volume: number;
}

export function shotPlaybackRate(variation: ShotVariation | undefined, random: () => number = Math.random): number {
  return variation ? 1 + (random() * 2 - 1) * variation.pitch : 1;
}

export function shotGainScale(variation: ShotVariation | undefined, random: () => number = Math.random): number {
  return variation ? 1 - random() * variation.volume : 1;
}
