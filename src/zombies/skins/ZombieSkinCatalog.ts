/**
 * Looks for the walker rig: recolored body regions plus accessories and
 * garments fused into its single skinned draw (see ZombieSkinBuilder). Pure
 * data; maps pick their looks through `ZombieArena.zombieSkins` or
 * `zombieSkinShares`.
 *
 * Insignia stay generic (plain stars, stripes, discs): no identifiable
 * emblems or political symbols, as the Station 33 art direction requires.
 */

import type { GarmentPattern } from './ZombieGarmentPatterns';

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
 * Medieval cathedral garments (13th-15th century inspired). Long cloth hangs
 * from the hips between both thighs instead of riding one bone, so robes
 * follow the stride without cloth simulation (see ZombieGarmentDrape).
 */
export type ZombieVestment =
  /**
   * Skirt of an alb, habit or mail hauberk from the waist down; `surface`
   * defaults to torn cloth and `lace` adds a lace band of that color at the hem.
   */
  | {
    readonly kind: 'robe'; readonly cloth: number; readonly hem: GarmentHem; readonly tatter?: number;
    readonly surface?: GarmentPattern; readonly lace?: number;
    /** Cut wider to hang over another robe, as a rochet over a cassock. */
    readonly over?: boolean;
  }
  /**
   * Gothic chasuble: front and back panels open at the sides, pointed hems and
   * a gold cross orphrey; `ample` cuts it wider, over the arms, with a gold border.
   */
  | { readonly kind: 'chasuble'; readonly cloth: number; readonly orphrey: number; readonly ample?: boolean }
  /** Stole ends hanging below the chasuble, frayed at the tips. */
  | { readonly kind: 'stole'; readonly cloth: number }
  /** Tall two-horned Gothic mitre with orphrey bands and lappets; `broken` snaps the front horn. */
  | { readonly kind: 'mitre'; readonly cloth: number; readonly orphrey: number; readonly broken?: boolean }
  /** Nun's veil: a close hood open at the face, falling over the shoulders and down the back. */
  | { readonly kind: 'veil'; readonly cloth: number }
  /** Mail coif: a close hood over the skull, open at the face, its cape over the shoulders. */
  | { readonly kind: 'coif'; readonly mail: number }
  /** Wimple framing the face and chin, with a bib over the shoulders and breast. */
  | { readonly kind: 'wimple'; readonly cloth: number }
  /** Knight's surcoat: long front and back panels open at the sides, a cross on the breast. */
  | { readonly kind: 'surcoat'; readonly cloth: number; readonly cross: number }
  /** Broad leather sword belt over the surcoat, with buckle and pouch. */
  | { readonly kind: 'swordBelt'; readonly leather: number; readonly buckle: number }
  /** Mail sleeves over the upper arms and forearms. */
  | { readonly kind: 'mailSleeves'; readonly mail: number }
  /** Tall leather boots with a turned-down cuff under the knee. */
  | { readonly kind: 'boots'; readonly leather: number }
  /** Pectoral cross on a chain. */
  | { readonly kind: 'pectoralCross'; readonly metal: number }
  /** Deep monastic cowl whose brim shades the face. */
  | { readonly kind: 'cowl'; readonly cloth: number }
  /** Monastic scapular: long narrow front and back panels. */
  | { readonly kind: 'scapular'; readonly cloth: number; readonly surface?: GarmentPattern; readonly trim?: number }
  /** Rope girdle with a knotted end hanging down the left thigh. */
  | { readonly kind: 'cord'; readonly rope: number }
  /** Bell-shaped sleeve ends over the forearms; `tatter` frays the cuffs. */
  | { readonly kind: 'wideSleeves'; readonly cloth: number; readonly tatter?: number; readonly surface?: GarmentPattern }
  /** Square cap with three ridges and a tuft. */
  | { readonly kind: 'biretta'; readonly cloth: number; readonly tuft: number }
  /** Pilgrim's wide-brimmed hat, turned up at the front over a scallop shell. */
  | { readonly kind: 'pilgrimHat'; readonly felt: number; readonly shell: number }
  /** Torn shoulder cape (mozzetta or pilgrim's cape), with a gold hem band or a cross on the breast. */
  | { readonly kind: 'cape'; readonly cloth: number; readonly trim?: number; readonly cross?: number }
  /** Long cloak open at the front; with an `orphrey` it is a cope, with gold edges and a back shield. */
  | {
    readonly kind: 'cloak'; readonly cloth: number; readonly hem: GarmentHem;
    readonly surface?: GarmentPattern; readonly orphrey?: number;
  }
  /** Dalmatic: wide tunic panels to the knee with two clavi and a hem band. */
  | { readonly kind: 'dalmatic'; readonly cloth: number; readonly surface: GarmentPattern; readonly trim: number }
  /** Cloth strips wound round the shins. */
  | { readonly kind: 'legWraps'; readonly cloth: number }
  /** Pilgrim's scrip on a strap and a drinking gourd. */
  | { readonly kind: 'pilgrimGear'; readonly leather: number; readonly gourd: number }
  /** A book bound to hang from the belt. */
  | { readonly kind: 'girdleBook'; readonly cover: number; readonly clasp: number }
  /** Ring of large iron keys at the belt. */
  | { readonly kind: 'keys'; readonly metal: number }
  /** Small lantern hanging from the belt. */
  | { readonly kind: 'lantern'; readonly metal: number; readonly glass: number }
  /** Crozier planted at the right side. */
  | { readonly kind: 'crozier'; readonly metal: number };

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
/** Die Kathedrale palette: muted, aged tones that sit on the cathedral stone. */
const IVORY_ALB = 0xb3a88f;
const TARNISHED_GOLD = 0x8f7334;
const CRIMSON = 0x5e1418;
const HABIT_BROWN = 0x36291f;
const HABIT_BLACK = 0x1b1918;
const AGED_LINEN = 0xc4bba8;
const CHAINMAIL = 0x5b5852;
const OLD_LEATHER = 0x3a2a1d;
const ROPE = 0x7f6f50;
/** Tint for brocades, whose pattern bakes its own colors: near-white, a little aged. */
const BAKED = 0xe6dfd2;

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
   * Condemned Monk: dark brown habit torn to rags, deep cowl over a short
   * shoulder cape, scapular, knotted rope girdle with tassels, wooden cross,
   * wide frayed sleeves over decayed hands, bare feet.
   */
  condemnedMonk: {
    regions: { tunic: HABIT_BROWN, sleeves: HABIT_BROWN, thighs: HABIT_BROWN, shins: HABIT_BROWN },
    accessories: [
      { kind: 'robe', cloth: HABIT_BROWN, hem: 'ankle', tatter: 0.07 },
      { kind: 'wideSleeves', cloth: HABIT_BROWN, tatter: 0.04 },
      { kind: 'scapular', cloth: 0x2a2019 },
      { kind: 'cord', rope: ROPE },
      { kind: 'pectoralCross', metal: 0x4a3322 },
      { kind: 'cowl', cloth: 0x30241b },
    ],
    stains: { coverage: 0.24, seed: 151 },
  },
  /**
   * Profaned Priest: dirty ivory alb with a lace hem and frayed sleeves under
   * a crimson Gothic chasuble with gold-embroidered cross orphreys, crimson
   * embroidered stole ends, old boots.
   */
  profanedPriest: {
    regions: { tunic: IVORY_ALB, sleeves: IVORY_ALB, thighs: IVORY_ALB, shins: IVORY_ALB, feet: 0x1f1915 },
    accessories: [
      { kind: 'robe', cloth: IVORY_ALB, hem: 'ankle', tatter: 0.06, lace: AGED_LINEN },
      { kind: 'wideSleeves', cloth: IVORY_ALB, tatter: 0.05 },
      { kind: 'stole', cloth: CRIMSON },
      { kind: 'chasuble', cloth: CRIMSON, orphrey: TARNISHED_GOLD },
    ],
    stains: { coverage: 0.3, seed: 171 },
  },
  /**
   * Undead Nun: black habit and scapular, aged white wimple and bib, torn
   * black veil down the back, rope girdle and a small cross.
   */
  undeadNun: {
    regions: { tunic: HABIT_BLACK, sleeves: HABIT_BLACK, thighs: HABIT_BLACK, shins: HABIT_BLACK, feet: 0x2a1f17 },
    accessories: [
      { kind: 'robe', cloth: HABIT_BLACK, hem: 'ankle', tatter: 0.07 },
      { kind: 'wideSleeves', cloth: HABIT_BLACK, tatter: 0.05 },
      { kind: 'scapular', cloth: 0x161414 },
      { kind: 'cord', rope: ROPE },
      { kind: 'wimple', cloth: AGED_LINEN },
      { kind: 'veil', cloth: 0x141212 },
      { kind: 'pectoralCross', metal: TARNISHED_GOLD },
    ],
    stains: { coverage: 0.22, seed: 191 },
  },
  /**
   * Cathedral Guardian: rusted mail coif, sleeves and hauberk skirt under a
   * torn linen surcoat with a faded red cross, sword belt and tall boots.
   */
  cathedralGuardian: {
    regions: {
      tunic: CHAINMAIL, sleeves: CHAINMAIL, gloves: OLD_LEATHER, thighs: CHAINMAIL, shins: OLD_LEATHER, feet: OLD_LEATHER,
    },
    accessories: [
      { kind: 'robe', cloth: CHAINMAIL, hem: 'knee', tatter: 0.02, surface: 'chainmail' },
      { kind: 'mailSleeves', mail: CHAINMAIL },
      { kind: 'boots', leather: OLD_LEATHER },
      { kind: 'coif', mail: CHAINMAIL },
      { kind: 'surcoat', cloth: 0xb2a78e, cross: 0x8a1c18 },
      { kind: 'swordBelt', leather: OLD_LEATHER, buckle: 0x7a6844 },
    ],
    stains: { coverage: 0.3, seed: 211 },
  },
  /**
   * Fallen Bishop: ample crimson Gothic chasuble with gold-embroidered
   * orphreys and border over an aged alb with a lace hem, gold stole ends,
   * a large pectoral cross and a broken mitre.
   */
  fallenBishop: {
    regions: { tunic: IVORY_ALB, sleeves: IVORY_ALB, thighs: IVORY_ALB, shins: IVORY_ALB, feet: 0x2e1416 },
    accessories: [
      { kind: 'robe', cloth: IVORY_ALB, hem: 'ankle', tatter: 0.06, lace: AGED_LINEN },
      { kind: 'wideSleeves', cloth: IVORY_ALB, tatter: 0.03 },
      { kind: 'stole', cloth: TARNISHED_GOLD },
      { kind: 'chasuble', cloth: 0x6a161b, orphrey: TARNISHED_GOLD, ample: true },
      { kind: 'pectoralCross', metal: 0xa08440 },
      { kind: 'mitre', cloth: 0xbcae86, orphrey: TARNISHED_GOLD, broken: true },
    ],
    stains: { coverage: 0.34, seed: 101 },
  },
  /**
   * Cathedral Canon: black cassock under a knee-length lace rochet, torn
   * crimson mozzetta with a gold hem band, lace sleeves, gold pectoral cross
   * and a black biretta.
   */
  cathedralCanon: {
    regions: { tunic: AGED_LINEN, sleeves: AGED_LINEN, thighs: HABIT_BLACK, shins: HABIT_BLACK, feet: 0x1c1714 },
    accessories: [
      { kind: 'robe', cloth: HABIT_BLACK, hem: 'ankle', tatter: 0.06 },
      { kind: 'robe', cloth: AGED_LINEN, hem: 'knee', tatter: 0.03, surface: 'weave', lace: AGED_LINEN, over: true },
      { kind: 'wideSleeves', cloth: AGED_LINEN, tatter: 0.02, surface: 'lace' },
      { kind: 'cape', cloth: 0x5a1219, trim: TARNISHED_GOLD },
      { kind: 'pectoralCross', metal: 0xa08440 },
      { kind: 'biretta', cloth: 0x161413, tuft: 0x2a2220 },
    ],
    stains: { coverage: 0.32, seed: 223 },
  },
  /**
   * Cantor: ivory alb with a lace hem under a blue dalmatic brocaded with
   * gold lilies, gold clavi and hem band, blue brocade sleeves, leather belt
   * and a girdle book of chants.
   */
  cantor: {
    regions: { tunic: 0x1e2742, sleeves: IVORY_ALB, thighs: IVORY_ALB, shins: IVORY_ALB, feet: 0x1f1915 },
    accessories: [
      { kind: 'robe', cloth: IVORY_ALB, hem: 'ankle', tatter: 0.06, lace: AGED_LINEN },
      { kind: 'wideSleeves', cloth: BAKED, tatter: 0.04, surface: 'brocadeAzure' },
      { kind: 'dalmatic', cloth: BAKED, surface: 'brocadeAzure', trim: TARNISHED_GOLD },
      { kind: 'swordBelt', leather: OLD_LEATHER, buckle: 0x7a6844 },
      { kind: 'girdleBook', cover: 0x4a2a1c, clasp: 0x8f7334 },
    ],
    stains: { coverage: 0.3, seed: 227 },
  },
  /**
   * Dominican Friar: white habit and scapular under a long black cloak and
   * hood with a shoulder cape, knotted white cord with tassels, wooden cross.
   */
  dominicanFriar: {
    regions: { tunic: AGED_LINEN, sleeves: AGED_LINEN, thighs: AGED_LINEN, shins: AGED_LINEN, feet: 0x1f1915 },
    accessories: [
      { kind: 'robe', cloth: AGED_LINEN, hem: 'ankle', tatter: 0.07 },
      { kind: 'wideSleeves', cloth: AGED_LINEN, tatter: 0.04 },
      { kind: 'scapular', cloth: 0xb9b09a },
      { kind: 'cord', rope: 0xb3a685 },
      { kind: 'pectoralCross', metal: 0x4a3322 },
      { kind: 'cloak', cloth: 0x161414, hem: 'shin' },
      { kind: 'cowl', cloth: 0x141212 },
    ],
    stains: { coverage: 0.3, seed: 229 },
  },
  /**
   * Pilgrim: short torn brown tunic, cape with a red cross, wide hat with
   * the scallop shell, scrip and gourd, belt, wound leg wraps and boots.
   */
  pilgrim: {
    regions: { tunic: 0x4a3828, sleeves: 0x4a3828, thighs: 0x3d3024, shins: 0x6a5a44, feet: OLD_LEATHER },
    accessories: [
      { kind: 'robe', cloth: 0x4a3828, hem: 'knee', tatter: 0.08 },
      { kind: 'legWraps', cloth: 0x7a6a50 },
      { kind: 'swordBelt', leather: OLD_LEATHER, buckle: 0x6a5a3a },
      { kind: 'pilgrimGear', leather: 0x5a3e26, gourd: 0x8a6a3a },
      { kind: 'cape', cloth: 0x54402c, cross: 0x7a1b17 },
      { kind: 'pilgrimHat', felt: 0x3e2f22, shell: 0xcfc2a2 },
    ],
    stains: { coverage: 0.34, seed: 233 },
  },
  /**
   * Cathedral Custodian: black robe under a cope of black and gold
   * scrollwork brocade with gold edges and a back shield, belt with a ring
   * of iron keys and a lantern.
   */
  cathedralCustodian: {
    regions: { tunic: HABIT_BLACK, sleeves: HABIT_BLACK, thighs: HABIT_BLACK, shins: HABIT_BLACK, feet: 0x1c1714 },
    accessories: [
      { kind: 'robe', cloth: HABIT_BLACK, hem: 'ankle', tatter: 0.06 },
      { kind: 'wideSleeves', cloth: BAKED, tatter: 0.03, surface: 'brocadeSable' },
      { kind: 'swordBelt', leather: OLD_LEATHER, buckle: 0x7a6844 },
      { kind: 'keys', metal: 0x4c4740 },
      { kind: 'lantern', metal: 0x3a352e, glass: 0xc9a868 },
      { kind: 'cloak', cloth: BAKED, hem: 'shin', surface: 'brocadeSable', orphrey: TARNISHED_GOLD },
    ],
    stains: { coverage: 0.26, seed: 239 },
  },
  /**
   * Abbess: dark crimson habit, scapular of crimson brocade with gold
   * crosses and gold edges, black veil over a white wimple, crimson belt,
   * gold pectoral cross and a crozier.
   */
  abbess: {
    regions: { tunic: 0x3a1418, sleeves: 0x2a1013, thighs: 0x2a1013, shins: 0x2a1013, feet: 0x2a1f17 },
    accessories: [
      { kind: 'robe', cloth: 0x2a1013, hem: 'ankle', tatter: 0.07 },
      { kind: 'wideSleeves', cloth: 0x1f0d10, tatter: 0.05 },
      { kind: 'scapular', cloth: BAKED, surface: 'brocadeGules', trim: TARNISHED_GOLD },
      { kind: 'swordBelt', leather: 0x4a1418, buckle: TARNISHED_GOLD },
      { kind: 'wimple', cloth: AGED_LINEN },
      { kind: 'veil', cloth: 0x141212 },
      { kind: 'pectoralCross', metal: 0xa08440 },
      { kind: 'crozier', metal: 0x9a7c3c },
    ],
    stains: { coverage: 0.24, seed: 241 },
  },
} as const satisfies Record<string, ZombieSkinDefinition>;

export type ZombieSkinId = keyof typeof ZOMBIE_SKINS;
