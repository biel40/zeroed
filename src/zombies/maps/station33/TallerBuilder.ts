import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { buildTallerDressing } from './TallerDressing';
import { buildTallerFurniture } from './TallerFurniture';
import { buildTallerShell } from './TallerShell';

/**
 * The yellow maintenance workshop reached through the substation: a crane
 * bay with a spare bogie in the middle, benches and racks along the walls,
 * and clear lanes either side for the horde.
 */
export function buildTaller(context: Station33BuildContext, lighting: Station33Lighting): void {
  buildTallerShell(context);
  buildTallerFurniture(context);
  buildTallerDressing(context, lighting);
}
