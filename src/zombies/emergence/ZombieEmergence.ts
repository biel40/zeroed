import * as THREE from 'three';

/**
 * A themed spot where a walker rises out of the scenery (a tomb) instead of
 * coming through an entrance. The body rises in place at `rise`, inside the
 * prop, then climbs over its rim to `exit`, clear navigable floor beside it.
 */
export interface ZombieEmergenceSite {
  readonly id: string;
  readonly floor: number;
  /** `y`: feet height of the site's floor. */
  readonly rise: { readonly x: number; readonly y: number; readonly z: number };
  readonly exit: { readonly x: number; readonly z: number };
  /** Height of the rim above the floor. */
  readonly rim: number;
  /** How far from `rise` towards `exit` the climb crosses the rim. */
  readonly rimDistance: number;
}

/** Seconds of each beat: the prop stirs with the body still hidden, the body rises in place, then climbs out. */
export interface ZombieEmergenceTiming {
  readonly stir: number;
  readonly rise: number;
  readonly climb: number;
}

/** How often and when a map's sites take a spawn. */
export interface ZombieEmergenceTuning {
  /** Chance that a walker spawning on a site's floor rises from a site instead. */
  readonly chance: number;
  /** First round the sites wake. */
  readonly minRound: number;
  /** Seconds a site rests after a body rose from it. */
  readonly cooldown: number;
  /** A site nearer the player than this stays still: nothing rises at their elbow. */
  readonly minPlayerDistance: number;
  readonly timing: ZombieEmergenceTiming;
}

/** `stir`: the prop moves with nobody seen yet. `breach`: the body starts to come out. */
export type ZombieEmergenceStage = 'stir' | 'breach';

export interface ZombieEmergencePose {
  /** Ground rise, 0 buried → 1 standing, eased like the horde's own rise. */
  rise: number;
  /** Climb over the rim, 0 → 1; also the share of the way from `rise` to `exit` covered. */
  climb: number;
}

export function emergenceDuration(timing: ZombieEmergenceTiming): number {
  return timing.stir + timing.rise + timing.climb;
}

/** Pose of a rising `elapsed` seconds after the site began to stir. */
export function emergencePose(elapsed: number, timing: ZombieEmergenceTiming, out: ZombieEmergencePose): ZombieEmergencePose {
  const { clamp } = THREE.MathUtils;
  const risen = clamp((elapsed - timing.stir) / timing.rise, 0, 1);
  out.rise = 1 - (1 - risen) * (1 - risen);
  // Linear like a window climb: the vault pose eases the body, the feet keep a steady pace.
  out.climb = clamp((elapsed - timing.stir - timing.rise) / timing.climb, 0, 1);
  return out;
}
