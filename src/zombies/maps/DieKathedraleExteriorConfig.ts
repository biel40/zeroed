import type { DieKathedraleDoor, DieKathedraleEntrance, DieKathedraleLightSite, FloorRect } from './DieKathedraleConfig';

export const EXTERIOR_ZONES = ['esplanade', 'sideCourtyard'] as const;
export type ExteriorZoneId = typeof EXTERIOR_ZONES[number];

/** Floor 0, against the east face of the existing nave and entrance plaza. */
export const EXTERIOR_AREAS = {
  esplanade: { minX: 14.3, maxX: 32, minZ: -35, maxZ: -15 },
  sidePassage: { minX: 14.3, maxX: 24, minZ: -15, maxZ: 17 },
  sideCourtyard: { minX: 32, maxX: 42, minZ: -33, maxZ: -19 },
} as const satisfies Readonly<Record<string, FloorRect>>;

const EAST_FACADE = 14.15;
const COURTYARD_WALL = EXTERIOR_AREAS.sideCourtyard.maxX;

export const EXTERIOR_PLAYER_MAX_X = COURTYARD_WALL - 0.4;
export const EXTERIOR_NAVIGATION_MAX_X = COURTYARD_WALL + 7;

/** Two shallow flights around a raised landing, within the Palau alley walls. */
export const PALAU_STEP = { minZ: -13, maxZ: -9, landingMinZ: -11.6, landingMaxZ: -10.4, rise: 0.24 } as const;

export const MIRADOR_PORTAL = {
  // Beside the bay's confessional, which is reserved for the Wind Bow.
  id: 'mirador-portal', x: EAST_FACADE, z: -29.25, outwardX: 1, outwardZ: 0, cost: 1000, kind: 'gate', zones: ['eastAisle', 'esplanade'],
} as const satisfies DieKathedraleDoor;

export const PALAU_POSTERN = {
  id: 'palau-postern', x: EAST_FACADE, z: 12.5, outwardX: 1, outwardZ: 0, cost: 750, kind: 'gate', zones: ['plaza', 'esplanade'],
} as const satisfies DieKathedraleDoor;

export const COURTYARD_GRILLE = {
  id: 'courtyard-grille', x: EXTERIOR_AREAS.sideCourtyard.minX, z: -25.5, outwardX: 1, outwardZ: 0, cost: 750, kind: 'gate', zones: ['esplanade', 'sideCourtyard'],
} as const satisfies DieKathedraleDoor;

export const EXTERIOR_DOORS = [MIRADOR_PORTAL, PALAU_POSTERN, COURTYARD_GRILLE] as const;

export const EXTERIOR_ENTRANCES = [
  { id: 'mirador-ruined-gate', x: 25.5, z: EXTERIOR_AREAS.esplanade.minZ, outwardX: 0, outwardZ: -1, kind: 'door', zone: 'esplanade', floor: 0 },
  { id: 'courtyard-dark-gate', x: COURTYARD_WALL, z: -23, outwardX: 1, outwardZ: 0, kind: 'door', zone: 'sideCourtyard', floor: 0 },
] as const satisfies ReadonlyArray<DieKathedraleEntrance>;

/** Back edge of the votive courtyard, facing the open centre to the south. */
export const SLEIGHT_OF_HAND_SITE = { x: 39.7, z: -28.1 } as const;

/** An existing interior entrance whose passage now projects into playable grounds. */
export function passageFacesExterior(entrance: DieKathedraleEntrance): boolean {
  return (entrance.floor ?? 0) === 0 && entrance.x === EAST_FACADE && entrance.outwardX === 1
    && entrance.z > EXTERIOR_AREAS.esplanade.minZ && entrance.z < EXTERIOR_AREAS.sidePassage.maxZ;
}

/** Pooled light sources, in addition to the shared moon. */
export const EXTERIOR_LIGHT_SITES: ReadonlyArray<DieKathedraleLightSite> = [
  { id: 'mirador-moon', x: 18.5, y: 5, z: MIRADOR_PORTAL.z, color: 0x819ccc, intensity: 7, distance: 14, flicker: false },
  { id: 'palau-postern-lantern', x: 16, y: 3, z: PALAU_POSTERN.z + 1, color: 0xffb866, intensity: 7, distance: 8, flicker: true },
  { id: 'courtyard-votives', x: SLEIGHT_OF_HAND_SITE.x, y: 2, z: SLEIGHT_OF_HAND_SITE.z, color: 0xffab64, intensity: 6, distance: 7, flicker: true },
];
