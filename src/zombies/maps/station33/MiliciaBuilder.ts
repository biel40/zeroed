import { buildMiliciaDressing } from './MiliciaDressing';
import { buildMiliciaFurniture } from './MiliciaFurniture';
import { buildMiliciaShell } from './MiliciaShell';
import type { Station33BuildContext } from './Station33BuildContext';

/**
 * Side zone: the station's militia post west of the vestibule, behind the
 * dearest paid door. Its Armour locker is interactive and built by the arena.
 */
export function buildMilicia(context: Station33BuildContext): void {
  buildMiliciaShell(context);
  buildMiliciaFurniture(context);
  buildMiliciaDressing(context);
}
