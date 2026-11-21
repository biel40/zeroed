import type { DieKathedraleDoor, DieKathedraleEntrance, DieKathedraleLightSite } from '../../DieKathedraleConfig';
import type { PlayerBounds, ZombieNavigationBounds } from '../../ZombieArena';

export const UPPER_FLOOR = 1;
export const UPPER_FLOOR_Y = 15.2;
export const UPPER_ZONES = ['bellTower'] as const;
export const BELL_TOWER_GROUND_MIN_X = -24.5;
export const BELL_TOWER_GATE_ID = 'bell-tower-gate';

/** Winding stair in the square bell tower, approached from the west crossing. */
export const BELL_STAIR = {
  centerX: -20,
  centerZ: -46,
  radius: 2.5,
  innerRadius: 1.2,
  outerRadius: 3.8,
  sweep: Math.PI * 7.5,
  steps: 90,
  lowerMouthX: -16.25,
  upperMouthZ: -49.7,
  lowerLandingX: -15.35,
  upperLandingZ: -50.7,
  landingHalfWidth: 1.25,
} as const;

export const BELL_CHAMBER = { minX: -25.5, maxX: -14.3, minZ: -55, maxZ: BELL_STAIR.upperMouthZ } as const;
export const BELL_LIP_Y = UPPER_FLOOR_Y + 3.35;
export const MAIN_BELL_POSITION = { x: -22.8, y: BELL_LIP_Y, z: -52.25 } as const;
export const ROOF_TERRACES = { minX: BELL_CHAMBER.maxX, maxX: -6.95, minZ: -54.5, maxZ: -28 } as const;
export const ROOF_CHAMBER_OPENING = { center: -52.3, width: 2.5, bottom: 0, top: 3.1 } as const;
export const ROOF_NAVE_OPENING = {
  center: (ROOF_TERRACES.minX + ROOF_TERRACES.maxX) / 2,
  width: ROOF_TERRACES.maxX - ROOF_TERRACES.minX - 0.6,
  bottom: 0,
  top: 3.25,
} as const;

export const UPPER_DOORS: ReadonlyArray<DieKathedraleDoor> = [
  { id: BELL_TOWER_GATE_ID, x: -14.15, z: BELL_STAIR.centerZ, outwardX: -1, outwardZ: 0, cost: 1250, kind: 'gate', zones: ['crossing', 'bellTower'] },
];

export const UPPER_ENTRANCES: ReadonlyArray<DieKathedraleEntrance> = [
  { id: 'bell-loft-door', x: -25.65, z: -52.3, outwardX: -1, outwardZ: 0, kind: 'door', zone: 'bellTower', floor: UPPER_FLOOR },
  { id: 'roof-rood-door', x: -10.25, z: -27.85, outwardX: 0, outwardZ: 1, kind: 'door', zone: 'bellTower', floor: UPPER_FLOOR },
];

/** The terrace shrine faces along the clear approach from the bell chamber. */
export const DOUBLE_TAP_SITE = { x: -10.5, y: UPPER_FLOOR_Y, z: -35.8, floor: UPPER_FLOOR, yaw: Math.PI } as const;

export const UPPER_PLAYER_BOUNDS: PlayerBounds = {
  minX: BELL_CHAMBER.minX + 0.35, maxX: ROOF_TERRACES.maxX - 0.35,
  minZ: BELL_CHAMBER.minZ + 0.35, maxZ: ROOF_TERRACES.maxZ - 0.35,
};

export const UPPER_NAVIGATION_BOUNDS: ZombieNavigationBounds = {
  floor: UPPER_FLOOR, baseY: UPPER_FLOOR_Y,
  minX: -32.6, maxX: ROOF_TERRACES.maxX + 0.6,
  minZ: BELL_CHAMBER.minZ - 0.6, maxZ: -20.9,
};

export const UPPER_LIGHT_SITES: ReadonlyArray<DieKathedraleLightSite> = [
  { id: 'bell-stair-cresset', x: -16.45, y: 2.25, z: -47.1, color: 0xffa552, intensity: 3.5, distance: 6, flicker: true },
  { id: 'bell-tower-sill', x: -21.8, y: UPPER_FLOOR_Y + 3.4, z: -54.4, color: 0x8298ca, intensity: 6, distance: 9, flicker: false },
  { id: 'rooftop-ring-candles', x: DOUBLE_TAP_SITE.x, y: UPPER_FLOOR_Y + 1.2, z: DOUBLE_TAP_SITE.z + 0.5, color: 0xffbf7c, intensity: 4, distance: 7, flicker: true },
];
