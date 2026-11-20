import type { RingId } from '../../../game/rings/RingCatalog';
import type { DieKathedraleZoneId } from '../DieKathedraleConfig';
import { SLEIGHT_OF_HAND_SITE } from '../DieKathedraleExteriorConfig';
import { DOUBLE_TAP_SITE, UPPER_FLOOR, UPPER_FLOOR_Y } from './upper/UpperCathedralConfig';

export interface DieKathedraleRingSite {
  readonly ringId: RingId;
  readonly room: string;
  readonly zone: DieKathedraleZoneId;
  readonly x: number;
  readonly z: number;
  readonly floor: number;
  readonly floorY: number;
  readonly approach: { readonly x: number; readonly z: number };
}

export const DIE_KATHEDRALE_RING_SITES = [
  {
    ringId: 'resurrection', room: 'narthex-funerary-alcove', zone: 'narthex', floor: 0, floorY: 0,
    x: 8.9, z: -1.6, approach: { x: 8.9, z: -3.2 },
  },
  {
    ringId: 'armor', room: 'chapel-west-4', zone: 'westAisle', floor: 0, floorY: 0,
    x: -12.6, z: -29.3, approach: { x: -12.6, z: -30.8 },
  },
  {
    ringId: 'sleightOfHand', room: 'sideCourtyard', zone: 'sideCourtyard', floor: 0, floorY: 0,
    x: SLEIGHT_OF_HAND_SITE.x, z: SLEIGHT_OF_HAND_SITE.z,
    approach: { x: SLEIGHT_OF_HAND_SITE.x, z: SLEIGHT_OF_HAND_SITE.z + 1.6 },
  },
  {
    ringId: 'doubleTap', room: 'roofTerraces', zone: 'bellTower', floor: UPPER_FLOOR, floorY: UPPER_FLOOR_Y,
    x: DOUBLE_TAP_SITE.x, z: DOUBLE_TAP_SITE.z,
    approach: { x: DOUBLE_TAP_SITE.x, z: DOUBLE_TAP_SITE.z - 1.5 },
  },
] as const satisfies readonly DieKathedraleRingSite[];
