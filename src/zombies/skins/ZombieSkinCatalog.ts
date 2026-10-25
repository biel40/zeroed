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
  | { readonly kind: 'medals'; readonly ribbons: readonly number[] };

export interface ZombieSkinDefinition {
  readonly regions: Readonly<Partial<Record<ZombieSkinRegion, number>>>;
  readonly accessories: readonly ZombieAccessory[];
}

const BOOT_LEATHER = 0x24201c;
const FADED_RED = 0x9c2a22;
const BRASS = 0xa88c48;

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
} as const satisfies Record<string, ZombieSkinDefinition>;

export type ZombieSkinId = keyof typeof ZOMBIE_SKINS;
