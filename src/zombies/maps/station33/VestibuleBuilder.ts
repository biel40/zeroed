import type { Station33BuildContext } from './Station33BuildContext';
import { buildVestibuleDressing } from './VestibuleDressing';
import { buildVestibuleFurniture } from './VestibuleFurniture';
import { buildVestibuleShell } from './VestibuleShell';

/**
 * Phase 1 zone: the entrance vestibule (start room). Later zones get their
 * own builders and connect through the openings this one leaves.
 */
export function buildVestibule(context: Station33BuildContext): void {
  buildVestibuleShell(context);
  buildVestibuleFurniture(context);
  buildVestibuleDressing(context);
}
