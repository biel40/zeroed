import { CATACOMB_FLOOR } from '../../DieKathedraleCatacombsConfig';
import { DIE_KATHEDRALE_DOORS, siteFloor } from '../../DieKathedraleConfig';
import { seededRandom } from '../../shared/ProceduralNoise';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { addGateTrail } from '../NaveRuin';
import { buildBurialGalleries } from './BurialGalleries';
import { buildCatacombShell } from './CatacombShell';
import { buildReliquaryChamber } from './ReliquaryChamber';
import { buildRoyalPantheon } from './RoyalPantheon';
import { buildWindSanctuary } from './WindSanctuary';

/**
 * Everything below the stair's landing: the shell, then each room in turn
 * (galleries, pantheon, reliquary, sanctuary), and what was dragged through
 * the catacombs' gates. The stair itself is built apart, since it must stay
 * in view from both levels.
 */
export function buildCatacombs(context: DieKathedraleBuildContext): void {
  buildCatacombShell(context);
  buildBurialGalleries(context);
  buildRoyalPantheon(context);
  buildReliquaryChamber(context);
  buildWindSanctuary(context);
  const random = seededRandom(7701);
  for (const door of DIE_KATHEDRALE_DOORS) {
    if (door.kind === 'gate' && siteFloor(door) === CATACOMB_FLOOR) addGateTrail(context, door, random);
  }
}
