import type { ElectricArcStyle } from '../rendering/ElectricArcRibbons';
import type { ZombieDisintegrationLook } from './ZombieDisintegrationLook';

/**
 * How a body killed by the forged ZEUS-77 looks while it overloads and
 * disintegrates (ZombieVisual.disintegrate / setDisintegration): data only.
 * Purple, as the forged bolt: the skin surges with the charge, hottest as
 * the body melts, which slumps and spreads it.
 */
export const OVERLOAD_LOOK: ZombieDisintegrationLook = {
  colors: { skin: 0x9a2cff, edge: 0x8a1cff, hot: 0xe6b8ff },
  surge: { base: 0.45, spike: 1.1, meltGlow: 1.4 },
  melt: { slump: 0.55, spread: 0.2 },
  reducedAsh: 16,
};

/**
 * Charge crawling over the overloaded body: more, wider and wilder arcs
 * than the residual ZEUS-77 crackle, re-rolled faster, in violet.
 */
export const OVERLOAD_ARC_STYLE: ElectricArcStyle = {
  arcs: 14, pointsPerArc: 8, rerollInterval: 0.035, halfWidth: 0.024, jitter: 0.16, skinOffset: 0.07, color: 0xc77dff, activeChance: 0.9,
};

/** Low-end devices: half the arcs, each with fewer points. */
export const OVERLOAD_ARC_STYLE_REDUCED: ElectricArcStyle = { ...OVERLOAD_ARC_STYLE, arcs: 7, pointsPerArc: 6 };
