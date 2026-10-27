import { buildMiliciaDressing } from './MiliciaDressing';
import { buildMiliciaFurniture } from './MiliciaFurniture';
import { buildMiliciaRedCorner } from './MiliciaRedCorner';
import { buildMiliciaShell } from './MiliciaShell';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

/**
 * Side zone: the station's militia post west of the vestibule, behind the
 * dearest paid door. Its Armour locker is interactive and built by the arena.
 */
export function buildMilicia(context: Station33BuildContext, lighting: Station33Lighting): void {
  buildMiliciaShell(context);
  buildMiliciaFurniture(context, lighting);
  buildMiliciaRedCorner(context, lighting);
  buildMiliciaDressing(context);
}
