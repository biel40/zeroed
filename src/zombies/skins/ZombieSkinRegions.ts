import type { ZombieSkinRegion } from './ZombieSkinCatalog';

/**
 * The walker atlas is a 32x32 strip of flat colors stacked in rows (see also
 * scripts/generate-brute-asset.mjs). Rows identify the material a triangle
 * samples; the bone it rides tells which part of the body it is.
 */
export type WalkerPaletteBand = 'skin' | 'eyes' | 'mouth' | 'dark' | 'wound' | 'shirt' | 'pants' | 'blood';

const ATLAS_SIZE = 32;

/** Bands top to bottom by first atlas row; the head row splits by column. */
const BAND_ROWS: ReadonlyArray<{ readonly firstRow: number; readonly band: WalkerPaletteBand }> = [
  { firstRow: 0, band: 'skin' },
  { firstRow: 6, band: 'dark' },
  { firstRow: 11, band: 'wound' },
  { firstRow: 17, band: 'shirt' },
  { firstRow: 23, band: 'pants' },
  { firstRow: 28, band: 'blood' },
];

/** sRGB color of each band, as authored in the atlas. */
export const WALKER_BAND_COLORS: Readonly<Record<WalkerPaletteBand, readonly [number, number, number]>> = {
  skin: [176, 176, 182],
  eyes: [236, 239, 203],
  mouth: [209, 27, 54],
  dark: [41, 41, 41],
  wound: [220, 189, 116],
  shirt: [203, 189, 171],
  pants: [93, 112, 173],
  blood: [174, 0, 13],
};

/** Accessories sample the middle of the shirt band and tint it per part. */
export const ACCESSORY_BAND: WalkerPaletteBand = 'shirt';
export const ACCESSORY_UV: readonly [number, number] = [0.5, 20 / ATLAS_SIZE];

export function walkerBandAt(u: number, v: number): WalkerPaletteBand {
  const row = Math.min(ATLAS_SIZE - 1, Math.max(0, Math.floor(v * ATLAS_SIZE)));
  let band: WalkerPaletteBand = 'skin';
  for (const entry of BAND_ROWS) if (row >= entry.firstRow) band = entry.band;
  if (band !== 'skin') return band;
  const column = Math.floor(u * ATLAS_SIZE);
  return column >= 26 ? 'mouth' : column >= 20 ? 'eyes' : 'skin';
}

type WalkerLimb = 'arm' | 'hand' | 'thigh' | 'shin' | 'foot';

function limbOf(bone: string): WalkerLimb | null {
  if (/^(Left|Right)(Arm|ForeArm)$/.test(bone)) return 'arm';
  if (/^(Left|Right)Hand/.test(bone)) return 'hand';
  if (/^(Left|Right)UpLeg$/.test(bone)) return 'thigh';
  if (/^(Left|Right)Leg$/.test(bone)) return 'shin';
  if (/^(Left|Right)(Foot|Toe)/.test(bone)) return 'foot';
  return null;
}

/**
 * Body region of a walker vertex, or null when no skin may recolor it (head,
 * eyes, mouth, blood and the belly wound keep the asset look).
 */
export function walkerSkinRegion(band: WalkerPaletteBand, bone: string): ZombieSkinRegion | null {
  const limb = limbOf(bone);
  switch (band) {
    case 'shirt':
      return 'tunic';
    case 'pants':
      return limb === 'shin' || limb === 'foot' ? 'shins' : 'thighs';
    case 'wound':
      // Torn trouser legs bare thin strips of leg: the uniform covers them.
      return limb === 'shin' ? 'shins' : limb === 'thigh' ? 'thighs' : null;
    case 'skin':
      if (limb === 'arm') return 'sleeves';
      if (limb === 'hand') return 'gloves';
      return limb === 'shin' || limb === 'foot' ? 'feet' : null;
    default:
      return null;
  }
}
