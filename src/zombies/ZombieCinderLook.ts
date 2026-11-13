import type { ZombieDisintegrationLook } from './ZombieDisintegrationLook';

/**
 * How a body killed by the forged ФАКЕЛ-33 looks while its blue fire burns
 * it to cinders (ZombieVisual.disintegrate / setDisintegration): data only.
 * The skin glows blue from the first moment, hottest as the body melts,
 * and it slumps further than an overloaded one, as if it collapsed into ash.
 */
export const CINDER_LOOK: ZombieDisintegrationLook = {
  colors: { skin: 0x1f55ff, edge: 0x1a48ff, hot: 0xd2e4ff },
  surge: { base: 0.7, spike: 0.6, meltGlow: 1.6 },
  melt: { slump: 0.7, spread: 0.15 },
  reducedAsh: 16,
};

/** The blue fire engulfing the body (ZombieFlames): its body and its white-blue heart. */
export const CINDER_FLAMES = { body: 0x1238ff, heart: 0xa8c8ff } as const;

/** Glowing cracks in the charred skin, and the embers and ash rising off it, in the same blue. */
export const CINDER_EMBERS = { crack: 0x2a66ff, edge: 0x1a48ff, hot: 0xd2e4ff } as const;
