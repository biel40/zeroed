import { grownArea, surfaceArea, surfacePatch, type ArenaFootstepSurfaces } from '../FootstepSurfaces';
import {
  MANSION_BUNKER_BOUNDS,
  MANSION_PLASTER_RUBBLE,
  MANSION_PLASTER_SPREAD,
  MANSION_STAIR_BOTTOM_Z,
  MANSION_STAIR_CENTER_X,
  MANSION_STAIR_TOP_Z,
  MANSION_STAIR_TREAD_HALF_WIDTH,
} from '../BurnedMansionConfig';

const GROUND = 0;
const BUNKER = -1;
/** The bunker bounds are inset by the player's body; the slab runs on to the walls. */
const BUNKER_SLAB_MARGIN = 1;
/** How far past its scattered pieces fallen plaster still crunches. */
const RUBBLE_MARGIN = 0.1;

/**
 * Underfoot in Burned Mansion: oak parquet through every ground-floor room,
 * board-formed concrete in the bunker and its secret room, steel tread plate
 * on the stair between them (on either floor, as it joins both) and heaps of
 * fallen ceiling plaster on the parquet.
 */
export const MANSION_FOOTSTEP_SURFACES: ArenaFootstepSurfaces = {
  fallback: 'wood',
  zones: [
    surfaceArea(grownArea(MANSION_BUNKER_BOUNDS, BUNKER_SLAB_MARGIN), 'concrete', BUNKER),
    ...MANSION_PLASTER_RUBBLE.map(([x, z]) => surfacePatch(
      x, z, MANSION_PLASTER_SPREAD.x / 2 + RUBBLE_MARGIN, MANSION_PLASTER_SPREAD.z / 2 + RUBBLE_MARGIN, 'debris', GROUND,
    )),
    surfaceArea({
      minX: MANSION_STAIR_CENTER_X - MANSION_STAIR_TREAD_HALF_WIDTH,
      maxX: MANSION_STAIR_CENTER_X + MANSION_STAIR_TREAD_HALF_WIDTH,
      minZ: MANSION_STAIR_BOTTOM_Z,
      maxZ: MANSION_STAIR_TOP_Z,
    }, 'metal'),
  ],
};
