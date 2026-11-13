/**
 * How a body killed by a forged weapon looks while it disintegrates
 * (ZombieVisual.disintegrate / setDisintegration): data only. Each kind
 * keeps its own values (ZombieOverloadLook, ZombieCinderLook).
 */
export interface ZombieDisintegrationLook {
  /** Skin surge while overwhelmed, the dissolve rim and the hot core of the rim and ash. */
  readonly colors: { readonly skin: number; readonly edge: number; readonly hot: number };
  /**
   * Skin surge: a base glow plus random spikes while the body is
   * overwhelmed; `meltGlow` adds the heat of the disintegration at its peak.
   */
  readonly surge: { readonly base: number; readonly spike: number; readonly meltGlow: number };
  /** How far the body slumps (height lost) and spreads (width gained) as it melts, at full disintegration. */
  readonly melt: { readonly slump: number; readonly spread: number };
  /** Ash motes drawn by the disintegration on low-end devices (all of them otherwise). */
  readonly reducedAsh: number;
}
