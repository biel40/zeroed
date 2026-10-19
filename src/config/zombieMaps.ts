import type * as THREE from 'three';
import type { DeviceProfile } from '../core/DeviceProfile';
import type { TranslationKey } from '../i18n/i18n';
import { BurnedMansionArena } from '../zombies/maps/BurnedMansionArena';
import { Station33Arena } from '../zombies/maps/Station33Arena';
import type { ZombieArena } from '../zombies/maps/ZombieArena';

export type ZombieArenaFactory = (scene: THREE.Scene, profile: DeviceProfile) => ZombieArena;

export interface ZombieMapDefinition {
  readonly id: string;
  /** Listed in the map menu; hidden maps still start through `?map=`. */
  readonly visible: boolean;
  readonly nameKey: TranslationKey;
  /** Playable in the co-op modes. */
  readonly coop: boolean;
  /** Sold separately once payments exist; the closed beta unlocks it for testers. */
  readonly premium: boolean;
  readonly createArena: ZombieArenaFactory;
}

/** Supported arenas are independent from which ones the public menu exposes. */
export const ZOMBIE_MAPS = {
  'burned-mansion': {
    id: 'burned-mansion',
    visible: true,
    nameKey: 'map.burnedMansion',
    coop: true,
    premium: false,
    createArena: (scene, profile) => new BurnedMansionArena(scene, profile),
  },
  'station-33': {
    id: 'station-33',
    visible: true,
    nameKey: 'map.station33',
    coop: false,
    premium: true,
    createArena: (scene, profile) => new Station33Arena(scene, profile),
  },
} as const satisfies Record<string, ZombieMapDefinition>;

export type ZombieMapId = keyof typeof ZOMBIE_MAPS;

/** Co-op has a single shared map; the protocol does not negotiate one. */
export const COOP_ZOMBIE_MAP_ID: ZombieMapId = 'burned-mansion';

export function isZombieMapId(value: string | null | undefined): value is ZombieMapId {
  return value != null && Object.hasOwn(ZOMBIE_MAPS, value);
}

export function getZombieMapDefinition(
  value: string | undefined,
): (typeof ZOMBIE_MAPS)[ZombieMapId] | undefined {
  return isZombieMapId(value) ? ZOMBIE_MAPS[value] : undefined;
}
