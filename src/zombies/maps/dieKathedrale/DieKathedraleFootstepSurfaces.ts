import { surfaceArea, type ArenaFootstepSurfaces, type FootstepSurfaceZone } from '../FootstepSurfaces';
import { DIE_KATHEDRALE_SCREENS } from '../DieKathedraleConfig';

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
 * Underfoot in Die Kathedrale: worn stone slabs in the nave and chancel and
 * stone paving on the plaza, with fallen masonry round the east aisle's
 * collapsed vault.
 */
export const DIE_KATHEDRALE_FOOTSTEP_SURFACES: ArenaFootstepSurfaces = {
  fallback: 'stone',
  zones: collapseRubble(),
};
