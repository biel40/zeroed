import { buildConsignaDressing } from './ConsignaDressing';
import { buildConsignaFurniture } from './ConsignaFurniture';
import { buildConsignaShell } from './ConsignaShell';
import type { Station33BuildContext } from './Station33BuildContext';

/**
 * Phase 2 zone: the luggage office east of the vestibule, behind the first
 * paid door. Its ring lockers are interactive and built by the arena.
 */
export function buildConsigna(context: Station33BuildContext): void {
  buildConsignaShell(context);
  buildConsignaFurniture(context);
  buildConsignaDressing(context);
}
