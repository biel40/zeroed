import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { buildSubestacionDressing } from './SubestacionDressing';
import { buildSubestacionFurniture } from './SubestacionFurniture';
import { buildSubestacionShell } from './SubestacionShell';

/**
 * Phase 4 zone: the traction substation north of the train sheds, behind
 * the third paid door. Its main switch is interactive and built by the
 * arena (`PowerLever`).
 */
export function buildSubestacion(context: Station33BuildContext, lighting: Station33Lighting): void {
  buildSubestacionShell(context);
  buildSubestacionFurniture(context, lighting);
  buildSubestacionDressing(context);
}
