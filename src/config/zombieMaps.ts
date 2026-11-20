import type * as THREE from 'three';
import type { DeviceProfile } from '../core/DeviceProfile';
import type { EntitlementProvider } from '../entitlements/EntitlementProvider';
import type { TranslationKey } from '../i18n/i18n';
import { BurnedMansionArena } from '../zombies/maps/BurnedMansionArena';
import { DieKathedraleArena } from '../zombies/maps/DieKathedraleArena';
import { Station33Arena } from '../zombies/maps/Station33Arena';
import type { ZombieArena } from '../zombies/maps/ZombieArena';
import { STATION33_WAVE_PACING, STATION33_WEAPONS } from '../zombies/maps/Station33Config';
import type { WavePacing } from '../zombies/ZombieConfig';
import type { WeaponCatalog, WeaponId } from '../weapons/WeaponTypes';
import type { ProductId } from './products';
import { WEAPON_DEFINITIONS } from './weapons';

export type ZombieArenaFactory = (scene: THREE.Scene, profile: DeviceProfile) => ZombieArena;

export interface ZombieMapDefinition {
  readonly id: string;
  /** Listed in the map menu; maps the player cannot access yet appear locked. */
  readonly visible: boolean;
  /** Still in development: requires a preview entitlement or a development build opt-in. */
  readonly workInProgress?: true;
  /** Premium maps require owning this product to play, from the menu or a direct link; free maps omit it. */
  readonly product?: ProductId;
  readonly nameKey: TranslationKey;
  /** Playable in the co-op modes. */
  readonly coop: boolean;
  /**
   * Weapons only this map hands out (sold by its own stations). They are
   * preloaded on this map alone, never pooled in the Mystery Box and never
   * reachable on another map or in co-op.
   */
  readonly exclusiveWeapons: readonly WeaponId[];
  /** How this map names and draws every weapon; gameplay always stays the shared definition's. */
  readonly weapons: WeaponCatalog;
  /** The map's own cadence for its standard waves; omitted keeps the shared curve. */
  readonly wavePacing?: WavePacing;
  readonly createArena: ZombieArenaFactory;
}

/** Supported arenas are independent from which ones the public menu exposes. */
export const ZOMBIE_MAPS = {
  'burned-mansion': {
    id: 'burned-mansion',
    visible: true,
    nameKey: 'map.burnedMansion',
    coop: true,
    exclusiveWeapons: [],
    weapons: WEAPON_DEFINITIONS,
    createArena: (scene, profile) => new BurnedMansionArena(scene, profile),
  },
  'station-33': {
    id: 'station-33',
    visible: true,
    product: 'map.station-33',
    nameKey: 'map.station33',
    coop: false,
    exclusiveWeapons: ['fakel'],
    weapons: STATION33_WEAPONS,
    wavePacing: STATION33_WAVE_PACING,
    createArena: (scene, profile) => new Station33Arena(scene, profile),
  },
  'die-kathedrale': {
    id: 'die-kathedrale',
    visible: true,
    workInProgress: true,
    product: 'map.die-kathedrale',
    nameKey: 'map.dieKathedrale',
    coop: false,
    exclusiveWeapons: [],
    weapons: WEAPON_DEFINITIONS,
    createArena: (scene, profile) => new DieKathedraleArena(scene, profile),
  },
} as const satisfies Record<string, ZombieMapDefinition>;

export type ZombieMapId = keyof typeof ZOMBIE_MAPS;

/** Co-op has a single shared map; the protocol does not negotiate one. */
export const COOP_ZOMBIE_MAP_ID: ZombieMapId = 'burned-mansion';

export function isZombieMapId(value: string | null | undefined): value is ZombieMapId {
  return value != null && Object.hasOwn(ZOMBIE_MAPS, value);
}

/** False for a work-in-progress map unless `wipMapsEnabled` (WIP_MAPS_ENABLED outside tests). */
export function isZombieMapReleased(mapId: ZombieMapId, wipMapsEnabled: boolean): boolean {
  const map: ZombieMapDefinition = ZOMBIE_MAPS[mapId];
  return map.workInProgress !== true || wipMapsEnabled;
}

/** Shared by the menu and every match entry point, including `?map=`. */
export function canAccessZombieMap(
  value: string | null | undefined,
  entitlements: EntitlementProvider,
  wipMapsEnabled: boolean,
): value is ZombieMapId {
  if (!isZombieMapId(value)) return false;
  const product: ProductId | undefined = getZombieMapProduct(value);
  if (!isZombieMapReleased(value, false) && product !== undefined && entitlements.canPreview?.(product)) return true;
  if (!isZombieMapReleased(value, wipMapsEnabled)) return false;
  return product === undefined || entitlements.owns(product);
}

/** The product a premium map is sold as; undefined for a free map. */
export function getZombieMapProduct(mapId: ZombieMapId): ProductId | undefined {
  const map: ZombieMapDefinition = ZOMBIE_MAPS[mapId];
  return map.product;
}

/** The map's cadence for its standard waves; undefined when it keeps the shared curve. */
export function getZombieMapWavePacing(mapId: ZombieMapId): WavePacing | undefined {
  const map: ZombieMapDefinition = ZOMBIE_MAPS[mapId];
  return map.wavePacing;
}

export function getZombieMapDefinition(
  value: string | undefined,
): (ZombieMapDefinition & { readonly id: ZombieMapId }) | undefined {
  return isZombieMapId(value) ? ZOMBIE_MAPS[value] : undefined;
}
