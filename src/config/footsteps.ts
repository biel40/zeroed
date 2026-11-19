import type { PlayerStance } from '../player/PlayerStance';

/** What the player's boots can land on; each map says where (`ArenaFootstepSurfaces`). */
export const FOOTSTEP_SURFACES = ['stone', 'concrete', 'metal', 'wood', 'debris', 'water', 'snow'] as const;
export type FootstepSurface = typeof FOOTSTEP_SURFACES[number];

/** Which foot landed: alternates step by step. */
export type FootSide = 'left' | 'right';

/** Where nothing more specific is known: bare concrete. */
export const FOOTSTEP_DEFAULT_SURFACE: FootstepSurface = 'concrete';

export interface FootstepSampleSet {
  /** Recorded single steps under `assets/audio/` (sources in `footsteps/SOURCES.txt`). */
  readonly files: readonly string[];
  /** Level of this surface against the others (clips are level-matched). */
  readonly gain: number;
}

function clips(surface: FootstepSurface, count: number): readonly string[] {
  return Array.from({ length: count }, (_, index) => `footsteps/${surface}_${index + 1}.wav`);
}

export const FOOTSTEP_SAMPLES: Readonly<Record<FootstepSurface, FootstepSampleSet>> = {
  stone: { files: clips('stone', 5), gain: 0.95 },
  concrete: { files: clips('concrete', 5), gain: 1 },
  metal: { files: clips('metal', 5), gain: 1.05 },
  wood: { files: clips('wood', 5), gain: 0.9 },
  debris: { files: clips('debris', 5), gain: 0.85 },
  water: { files: clips('water', 5), gain: 0.9 },
  snow: { files: clips('snow', 5), gain: 0.75 },
};

/** Per-step randomisation: playback rate within ±`pitch`, level within ±`volume`. */
export const FOOTSTEP_VARIATION = { pitch: 0.03, volume: 0.07 } as const;

export const FOOTSTEP_MIX = {
  /** Effects-bus level of a step at full pace: clearly under shots, zombies and blasts. */
  level: 0.3,
  /** Stereo offset of each foot (-left, +right). */
  footPan: 0.06,
  /** Loudness at a crawl, rising to 1 at full walking pace. */
  slowPaceLoudness: 0.55,
} as const;

/** How loud each stance walks; zero keeps it silent (crawling prone is not stepping). */
export const FOOTSTEP_STANCE_LOUDNESS: Readonly<Record<PlayerStance, number>> = {
  standing: 1,
  crouched: 0.6,
  prone: 0,
};
