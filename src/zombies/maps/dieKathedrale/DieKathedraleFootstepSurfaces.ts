import { surfaceArea, surfacePatch, type ArenaFootstepSurfaces, type FootstepSurfaceZone } from '../FootstepSurfaces';
import { DIE_KATHEDRALE_SCREENS } from '../DieKathedraleConfig';
import { CATACOMB_FLOOR, CRYPT_LANDING, GALLERY_CORRIDORS, PANTHEON_CRACK, SANCTUARY } from '../DieKathedraleCatacombsConfig';

const FLOOR = 0;
/** Stone shed by the fallen vault lies mostly on the nave's side of the collapse. */
const COLLAPSE_SCATTER = { west: 1, wallSide: 3, naveSide: 5 } as const;

function collapseRubble(): FootstepSurfaceZone[] {
  const collapse = DIE_KATHEDRALE_SCREENS.find((screen) => screen.style === 'rubble');
  if (!collapse) return [];
  return [surfaceArea({
    minX: collapse.min - COLLAPSE_SCATTER.west,
    maxX: collapse.max,
    minZ: collapse.fixed - COLLAPSE_SCATTER.wallSide,
    maxZ: collapse.fixed + COLLAPSE_SCATTER.naveSide,
  }, 'debris', FLOOR)];
}

/**
 * Below ground the floor is stone too, but the galleries' corridors are
 * littered with grit and bone, rubble lies under the cracked wall of the
 * pantheon and round the shrine's fallen rock, and water stands at the
 * foot of the stair.
 */
function catacombGround(): FootstepSurfaceZone[] {
  return [
    ...GALLERY_CORRIDORS.map((corridor) => surfaceArea(corridor, 'debris', CATACOMB_FLOOR)),
    surfacePatch(PANTHEON_CRACK.x - 1, PANTHEON_CRACK.z, 1, 1.4, 'debris', CATACOMB_FLOOR),
    surfacePatch(SANCTUARY.x, SANCTUARY.z - SANCTUARY.radius + 1.2, 3.2, 1.2, 'debris', CATACOMB_FLOOR),
    surfacePatch((CRYPT_LANDING.minX + CRYPT_LANDING.maxX) / 2 - 1.6, CRYPT_LANDING.minZ + 1.6, 0.9, 0.7, 'water', CATACOMB_FLOOR),
  ];
}

/**
 * Underfoot in Die Kathedrale: worn stone slabs in the nave and chancel and
 * stone paving on the plaza, with fallen masonry round the east aisle's
 * collapsed vault, and the catacombs' own ground below.
 */
export const DIE_KATHEDRALE_FOOTSTEP_SURFACES: ArenaFootstepSurfaces = {
  fallback: 'stone',
  zones: [...collapseRubble(), ...catacombGround()],
};
