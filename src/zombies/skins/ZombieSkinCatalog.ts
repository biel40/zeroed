/**
 * Looks for the walker rig: recolored body regions plus rigid accessories
 * fused into its single skinned draw (see ZombieSkinBuilder). Pure data; maps
 * pick their looks through `ZombieArena.zombieSkins`.
 *
 * Insignia stay generic (plain stars, stripes, discs): no identifiable
 * emblems or political symbols, as the Station 33 art direction requires.
 */

/** Walker body areas a skin can recolor; anything left out keeps the asset color. */
export type ZombieSkinRegion =
  /** The torn shirt: chest, back and short sleeves. */
  | 'tunic'
  /** Bare forearms, covered by long sleeves. */
  | 'sleeves'
  | 'gloves'
  /** Trousers from the waist to the knees. */
  | 'thighs'
  /** Trousers below the knees: tall boot shafts or trouser legs. */
  | 'shins'
  /** Bare feet: boots or shoes. */
  | 'feet';

export type ZombieAccessory =
  /** Pilotka: soft side cap with a small star. */
  | { readonly kind: 'sideCap'; readonly cloth: number; readonly star: number }
  /** Furazhka: peaked cap with colored band, black visor and a badge. */
  | { readonly kind: 'peakedCap'; readonly crown: number; readonly band: number; readonly visor: number; readonly badge: number }
  /** SSh-40 style steel helmet. */
  | { readonly kind: 'helmet'; readonly shell: number; readonly star?: number }
  /** Ushanka with its ear flaps tied up. */
  | { readonly kind: 'furHat'; readonly fur: number; readonly star: number }
  | { readonly kind: 'belt'; readonly leather: number; readonly buckle: number }
  /** Officer's shoulder strap, right shoulder to left hip. */
  | { readonly kind: 'crossStrap'; readonly leather: number }
  | { readonly kind: 'shoulderBoards'; readonly cloth: number; readonly stripe: number }
  /** Rolled greatcoat worn over the left shoulder. */
  | { readonly kind: 'coatRoll'; readonly cloth: number }
  /** Two cartridge pouches on the front of the belt. */
  | { readonly kind: 'ammoPouches'; readonly leather: number }
  /** Cloth hood drawn over the head and ears, open at the face. */
  | { readonly kind: 'hood'; readonly cloth: number }
  /** Scarf wound around the neck with one end hanging down the chest. */
  | { readonly kind: 'scarf'; readonly cloth: number }
  /** Flask hanging from the belt on the right hip. */
  | { readonly kind: 'canteen'; readonly flask: number }
  /** Canvas map case on the left hip. */
  | { readonly kind: 'satchel'; readonly canvas: number }
  /** Medal ribbons on the left breast, one bar per color. */
  | { readonly kind: 'medals'; readonly ribbons: readonly number[] }
  | ZombieVestment;

/** Where a long garment ends. */
export type GarmentHem = 'knee' | 'shin' | 'ankle';

/**
 * Medieval clergy garments (13th-15th century inspired). Long cloth hangs
 * from the hips between both thighs instead of riding one bone, so robes
 * follow the stride without cloth simulation (see ZombieGarmentDrape).
 */
export type ZombieVestment =
  /** Skirt of a cassock, alb or habit from the waist down; `layer` 1 sits over a layer 0 robe (rochet). */
  | { readonly kind: 'robe'; readonly cloth: number; readonly hem: GarmentHem; readonly layer?: 0 | 1; readonly tatter?: number }
  /** Gothic chasuble: front and back panels open at the sides, pointed hems and a cross orphrey. */
  | { readonly kind: 'chasuble'; readonly cloth: number; readonly orphrey: number }
  /** Stole ends hanging below the chasuble, frayed at the tips. */
  | { readonly kind: 'stole'; readonly cloth: number }
  /** Tall two-horned Gothic mitre with orphrey bands and lappets. */
  | { readonly kind: 'mitre'; readonly cloth: number; readonly orphrey: number }
  /** Square cap with three ridges and a tuft. */
  | { readonly kind: 'biretta'; readonly cloth: number; readonly tuft: number }
  /** Short buttoned cape over the shoulders. */
  | { readonly kind: 'mozzetta'; readonly cloth: number; readonly buttons: number }
  /** Wide cloth sash round the waist with tails on the left hip. */
  | { readonly kind: 'sash'; readonly cloth: number }
  /** Pectoral cross on a chain. */
  | { readonly kind: 'pectoralCross'; readonly metal: number }
  /** Deep monastic cowl whose brim shades the face. */
  | { readonly kind: 'cowl'; readonly cloth: number }
  /** Monastic scapular: long narrow front and back panels. */
  | { readonly kind: 'scapular'; readonly cloth: number }
  /** Rope girdle with a knotted end hanging down the left thigh. */
  | { readonly kind: 'cord'; readonly rope: number }
  /** Bell-shaped sleeve ends over the forearms; `tatter` frays the cuffs. */
  | { readonly kind: 'wideSleeves'; readonly cloth: number; readonly tatter?: number }
  /** Leather soles strapped over bare feet. */
  | { readonly kind: 'sandals'; readonly leather: number };

/** Charred patches spread over the whole body, face included (see ZombieSkinDamage). */
export interface ZombieSkinBurns {
  /** 0..1: roughly the share of the body the patches cover. */
  readonly coverage: number;
  /** Picks the patch layout, so two skins with the same coverage burn differently. */
  readonly seed: number;
}

/** Dried blood and grime on the clothes, plus mud rising from the hem (see ZombieGarmentWear). */
export interface ZombieSkinStains {
  /** 0..1: roughly the share of the cloth the stains cover. */
  readonly coverage: number;
  readonly seed: number;
}

/** A forearm lost below the elbow; the upper arm ends in a charred stump. */
export type ZombieSeveredLimb = 'leftForearm' | 'rightForearm';

export interface ZombieSkinDefinition {
  readonly regions: Readonly<Partial<Record<ZombieSkinRegion, number>>>;
  readonly accessories: readonly ZombieAccessory[];
  readonly burns?: ZombieSkinBurns;
  readonly stains?: ZombieSkinStains;
  readonly severedLimbs?: readonly ZombieSeveredLimb[];
}

const BOOT_LEATHER = 0x24201c;
const FADED_RED = 0x9c2a22;
const BRASS = 0xa88c48;
/** Clergy palette: muted, aged tones that sit on the cathedral stone. */
const ALB = 0xb7ad95;
const DIRTY_ALB = 0xa0967f;
const TARNISHED_GOLD = 0x8a6f34;
const FADED_OCHRE = 0x7a6640;
const CRIMSON = 0x661217;
const ROCHET_WHITE = 0xc2b9a3;
const HABIT = 0x3a2d23;

/** A Condemned Priest in a chasuble of the given color. */
function condemnedPriest(chasuble: number, seed: number): ZombieSkinDefinition {
  return {
    regions: { tunic: DIRTY_ALB, sleeves: DIRTY_ALB, thighs: DIRTY_ALB, shins: DIRTY_ALB, feet: 0x1d1814 },
    accessories: [
      { kind: 'robe', cloth: DIRTY_ALB, hem: 'ankle', tatter: 0.05 },
      { kind: 'wideSleeves', cloth: DIRTY_ALB, tatter: 0.05 },
      { kind: 'stole', cloth: chasuble },
      { kind: 'chasuble', cloth: chasuble, orphrey: FADED_OCHRE },
    ],
    stains: { coverage: 0.26, seed },
  };
}

export const ZOMBIE_SKINS = {
  /** Civilian left behind by the evacuation: worn trousers and shoes. */
  evacuee: {
    regions: { thighs: 0x4c463e, shins: 0x4c463e, feet: 0x2f2721 },
    accessories: [],
  },
  /** WW2 rifleman: khaki gymnastyorka, pilotka, rolled greatcoat, kirza boots. */
  rifleman: {
    regions: { tunic: 0x8a7d55, sleeves: 0x8a7d55, thighs: 0x6f6747, shins: BOOT_LEATHER, feet: BOOT_LEATHER },
    accessories: [
      { kind: 'sideCap', cloth: 0x7f744d, star: FADED_RED },
      { kind: 'belt', leather: 0x5c3b22, buckle: 0x8c8a80 },
      { kind: 'coatRoll', cloth: 0x6a6258 },
    ],
  },
  /** WW2 assault infantry: olive tunic, steel helmet and cartridge pouches. */
  helmetTrooper: {
    regions: { tunic: 0x6d6c48, sleeves: 0x6d6c48, thighs: 0x5e5c40, shins: BOOT_LEATHER, feet: BOOT_LEATHER },
    accessories: [
      { kind: 'helmet', shell: 0x434a32, star: FADED_RED },
      { kind: 'belt', leather: 0x4f3420, buckle: 0x8c8a80 },
      { kind: 'ammoPouches', leather: 0x5a4128 },
    ],
  },
  /** Cold War field officer: olive service dress, peaked cap and Sam Browne belt. */
  fieldOfficer: {
    regions: { tunic: 0x5f6440, sleeves: 0x5f6440, thighs: 0x535838, shins: BOOT_LEATHER, feet: BOOT_LEATHER },
    accessories: [
      { kind: 'peakedCap', crown: 0x5c6141, band: FADED_RED, visor: 0x161514, badge: BRASS },
      { kind: 'belt', leather: 0x4b2f1c, buckle: BRASS },
      { kind: 'crossStrap', leather: 0x4b2f1c },
      { kind: 'shoulderBoards', cloth: 0x5c6141, stripe: FADED_RED },
    ],
  },
  /** Winter sentry: grey greatcoat down to the knees and ushanka. */
  winterSentry: {
    regions: { tunic: 0x6e6a63, sleeves: 0x6e6a63, thighs: 0x6e6a63, shins: BOOT_LEATHER, feet: BOOT_LEATHER },
    accessories: [
      { kind: 'furHat', fur: 0x4d4237, star: FADED_RED },
      { kind: 'belt', leather: 0x4c321f, buckle: BRASS },
      { kind: 'shoulderBoards', cloth: 0x6e6a63, stripe: FADED_RED },
    ],
  },
  /** Winter veteran: padded telogreika, hood under the pilotka, scarf and field kit. */
  winterVeteran: {
    regions: { tunic: 0x8a8862, sleeves: 0x8a8862, thighs: 0x6c6a58, shins: BOOT_LEATHER, feet: BOOT_LEATHER },
    accessories: [
      { kind: 'hood', cloth: 0x5e6457 },
      { kind: 'sideCap', cloth: 0x50574a, star: FADED_RED },
      { kind: 'scarf', cloth: 0x737a6b },
      { kind: 'belt', leather: 0x6a4428, buckle: 0x9a9a90 },
      { kind: 'crossStrap', leather: 0xa8a28a },
      { kind: 'ammoPouches', leather: 0x5a3a24 },
      { kind: 'canteen', flask: 0x6e5a3e },
      { kind: 'satchel', canvas: 0xa39d84 },
    ],
  },
  /** Parade dress: sea-green tunic, white gloves, gold belt and medals. */
  paradeOfficer: {
    regions: { tunic: 0x2f4636, sleeves: 0x2f4636, gloves: 0xd9d6c8, thighs: 0x2a3d30, shins: 0x141312, feet: 0x141312 },
    accessories: [
      { kind: 'peakedCap', crown: 0x2f4636, band: FADED_RED, visor: 0x111111, badge: 0xc0a050 },
      { kind: 'belt', leather: 0xb09045, buckle: 0xc8a65a },
      { kind: 'shoulderBoards', cloth: 0xb09045, stripe: 0x2f4636 },
      { kind: 'medals', ribbons: [FADED_RED, 0xc0a050, 0x3a5a8a, 0xb0b0a8] },
    ],
  },
  /** Caught by the fire: scattered scorch marks on skin and clothes. */
  scorched: {
    regions: {},
    accessories: [],
    burns: { coverage: 0.3, seed: 11 },
  },
  /** Barely got out of the flames: large charred areas, face included. */
  charred: {
    regions: {},
    accessories: [],
    burns: { coverage: 0.55, seed: 23 },
  },
  /** Burnt and missing the left forearm. */
  leftArmStump: {
    regions: {},
    accessories: [],
    burns: { coverage: 0.35, seed: 37 },
    severedLimbs: ['leftForearm'],
  },
  /** Burnt and missing the right forearm. */
  rightArmStump: {
    regions: {},
    accessories: [],
    burns: { coverage: 0.4, seed: 53 },
    severedLimbs: ['rightForearm'],
  },
  /**
   * Corrupted Bishop: burgundy Gothic chasuble with tarnished gold orphreys
   * over an aged alb, stole ends below, pectoral cross and a tall mitre.
   */
  corruptedBishop: {
    regions: { tunic: ALB, sleeves: ALB, thighs: ALB, shins: ALB, feet: 0x2e1416 },
    accessories: [
      { kind: 'robe', cloth: ALB, hem: 'ankle' },
      { kind: 'stole', cloth: TARNISHED_GOLD },
      { kind: 'chasuble', cloth: 0x4c1418, orphrey: TARNISHED_GOLD },
      { kind: 'pectoralCross', metal: 0x9a7f3c },
      { kind: 'mitre', cloth: 0xb9ae8e, orphrey: TARNISHED_GOLD },
    ],
    stains: { coverage: 0.18, seed: 101 },
  },
  /**
   * Fallen Cardinal: crimson cassock and sash, aged white rochet with a
   * frayed lace hem, short buttoned mozzetta, pectoral cross and biretta.
   */
  fallenCardinal: {
    regions: { tunic: CRIMSON, sleeves: ROCHET_WHITE, thighs: CRIMSON, shins: CRIMSON, feet: 0x2a1112 },
    accessories: [
      { kind: 'robe', cloth: CRIMSON, hem: 'ankle' },
      { kind: 'robe', cloth: ROCHET_WHITE, hem: 'knee', layer: 1, tatter: 0.05 },
      { kind: 'sash', cloth: 0x5e0f15 },
      { kind: 'mozzetta', cloth: 0x74131a, buttons: 0x3a0a0e },
      { kind: 'pectoralCross', metal: 0x8a7444 },
      { kind: 'biretta', cloth: 0x6a1218, tuft: 0x4a0c10 },
    ],
    stains: { coverage: 0.2, seed: 131 },
  },
  /**
   * Penitent Monk: heavy brown habit with scapular, deep cowl over the face,
   * rope girdle, wide sleeves over bare decayed hands and worn sandals.
   */
  penitentMonk: {
    regions: { tunic: HABIT, sleeves: HABIT, thighs: HABIT, shins: HABIT },
    accessories: [
      { kind: 'robe', cloth: HABIT, hem: 'ankle', tatter: 0.06 },
      { kind: 'wideSleeves', cloth: HABIT, tatter: 0.03 },
      { kind: 'scapular', cloth: 0x2b221b },
      { kind: 'cord', rope: 0x7c6c4e },
      { kind: 'cowl', cloth: 0x332820 },
      { kind: 'sandals', leather: 0x3e2c1e },
    ],
    stains: { coverage: 0.22, seed: 151 },
  },
  /** Condemned Priest: dirty alb with frayed sleeves under a green Gothic chasuble. */
  condemnedPriestGreen: condemnedPriest(0x2e3b26, 171),
  /** Condemned Priest in a violet (penitential) chasuble. */
  condemnedPriestViolet: condemnedPriest(0x3a2640, 181),
  /** Condemned Priest in a burgundy chasuble. */
  condemnedPriestBurgundy: condemnedPriest(0x531a1d, 191),
} as const satisfies Record<string, ZombieSkinDefinition>;

export type ZombieSkinId = keyof typeof ZOMBIE_SKINS;
