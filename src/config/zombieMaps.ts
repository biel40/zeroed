import type * as THREE from 'three';
import type { DeviceProfile } from '../core/DeviceProfile';
import type { TranslationKey } from '../i18n/i18n';
import { BurnedMansionArena } from '../zombies/maps/BurnedMansionArena';
import { Station33Arena } from '../zombies/maps/Station33Arena';
import type { ZombieArena } from '../zombies/maps/ZombieArena';
import type { WeaponId } from '../weapons/WeaponTypes';

export type ZombieArenaFactory = (scene: THREE.Scene, profile: DeviceProfile) => ZombieArena;

export interface ZombieMapDefinition {
  readonly id: string;
  /** Listed in the map menu when the player also has access. */
  readonly visible: boolean;
  /** Requires an allowed beta email in both the menu and direct links. */
  readonly betaOnly: boolean;
  readonly nameKey: TranslationKey;
  /** Playable in the co-op modes. */
  readonly coop: boolean;
  /** Presentation only until payments exist; does not enforce access. */
  readonly premium: boolean;
  /**
   * Weapons only this map hands out (sold by its own stations). They are
   * preloaded on this map alone, never pooled in the Mystery Box and never
   * reachable on another map or in co-op.
   */
  readonly exclusiveWeapons: readonly WeaponId[];
  readonly createArena: ZombieArenaFactory;
}

/** Supported arenas are independent from which ones the public menu exposes. */
export const ZOMBIE_MAPS = {
  'burned-mansion': {
    id: 'burned-mansion',
    visible: true,
    betaOnly: false,
    nameKey: 'map.burnedMansion',
    coop: true,
    premium: false,
    exclusiveWeapons: [],
    createArena: (scene, profile) => new BurnedMansionArena(scene, profile),
  },
  'station-33': {
    id: 'station-33',
    visible: true,
    betaOnly: true,
    nameKey: 'map.station33',
    coop: false,
    premium: true,
    exclusiveWeapons: ['fakel'],
    createArena: (scene, profile) => new Station33Arena(scene, profile),
  },
} as const satisfies Record<string, ZombieMapDefinition>;

export type ZombieMapId = keyof typeof ZOMBIE_MAPS;

/** Co-op has a single shared map; the protocol does not negotiate one. */
export const COOP_ZOMBIE_MAP_ID: ZombieMapId = 'burned-mansion';

export function isZombieMapId(value: string | null | undefined): value is ZombieMapId {
  return value != null && Object.hasOwn(ZOMBIE_MAPS, value);
}

/** Shared by menu visibility and every match entry point, including `?map=`. */
export function canAccessZombieMap(value: string | null | undefined, betaAccess: boolean): value is ZombieMapId {
  return isZombieMapId(value) && (!ZOMBIE_MAPS[value].betaOnly || betaAccess);
}

export function getZombieMapDefinition(
  value: string | undefined,
): (typeof ZOMBIE_MAPS)[ZombieMapId] | undefined {
  return isZombieMapId(value) ? ZOMBIE_MAPS[value] : undefined;
}
