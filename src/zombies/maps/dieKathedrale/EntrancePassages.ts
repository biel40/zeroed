import { DIE_KATHEDRALE_ENTRANCES, DIE_KATHEDRALE_OPENINGS, DIE_KATHEDRALE_PASSAGE, DIE_KATHEDRALE_WALL_THICKNESS, type DieKathedraleEntrance } from '../DieKathedraleConfig';
import { addEntrancePassageShell, EntranceFrame } from '../shared/EntrancePassage';
import { seededRandom } from '../shared/ProceduralNoise';
import { archPoints, ribGeometries } from './GothicVault';
import type { DieKathedraleBuildContext } from './DieKathedraleBuildContext';

const HALF_WALL = DIE_KATHEDRALE_WALL_THICKNESS / 2;
/** How far the stone surround stands proud of the wall face. */
const SURROUND_FACE = -HALF_WALL - 0.04;

/**
 * The hidden side of every zombie entrance (a dark dead-end passage of rough
 * masonry, choked with rubble past the spawn) and its pointed stone surround
 * on the side the player sees. `interior` and `plaza` each take the
 * surrounds of their own entrances, so they merge with their own area.
 */
export function buildEntrancePassages(interior: DieKathedraleBuildContext, plaza: DieKathedraleBuildContext): void {
  for (const entrance of DIE_KATHEDRALE_ENTRANCES) {
    const context = entrance.zone === 'plaza' ? plaza : interior;
    const frame = new EntranceFrame(entrance);
    addPassage(context, entrance, frame);
    addSurround(context, entrance, frame);
  }
}

function addPassage(context: DieKathedraleBuildContext, entrance: DieKathedraleEntrance, frame: EntranceFrame): void {
  const { structure, materials, batch } = context;
  const width = DIE_KATHEDRALE_PASSAGE.width[entrance.kind];
  const height = DIE_KATHEDRALE_PASSAGE.height[entrance.kind];
  addEntrancePassageShell(structure, frame, entrance.id,
    { length: DIE_KATHEDRALE_PASSAGE.length, width, height, wallThickness: DIE_KATHEDRALE_WALL_THICKNESS }, materials.roughStone, 'concrete');
  const end = HALF_WALL + DIE_KATHEDRALE_PASSAGE.length;
  const random = seededRandom(Math.round(entrance.x * 13 + entrance.z * 7));
  for (let index = 0; index < 9; index++) {
    const size = 0.3 + random() * 0.5;
    const { x, z } = frame.point(end - random() * 0.6, (random() - 0.5) * width);
    batch.addBox(materials.roughStone, x, 0.3 + random() * 1.5, z, size, size * 0.8, size, random() * 3, random() * 3, random() * 3);
  }
}

/** Jambs and a pointed head round the opening; chapel windows get a sill as well. */
function addSurround(context: DieKathedraleBuildContext, entrance: DieKathedraleEntrance, frame: EntranceFrame): void {
  const { batch, materials } = context;
  const opening = DIE_KATHEDRALE_OPENINGS[entrance.kind];
  const half = opening.width / 2 + 0.1;
  for (const side of [-1, 1]) {
    const { x, z } = frame.point(SURROUND_FACE, side * half);
    const { width, depth } = frame.size(0.1, 0.2);
    batch.addBox(materials.dressedStone, x, (opening.bottom + opening.top) / 2, z, width, opening.top - opening.bottom, depth, 0, 0, 0, side + 2);
  }
  const from = frame.point(SURROUND_FACE, -half);
  const to = frame.point(SURROUND_FACE, half);
  const head = archPoints(from.x, from.z, to.x, to.z, opening.top, entrance.kind === 'door' ? 0.75 : 0.55, 6);
  for (const geometry of ribGeometries(head, 0.1, 0.2)) batch.add(geometry, materials.dressedStone);
  if (opening.bottom > 0) {
    const { x, z } = frame.point(SURROUND_FACE, 0);
    const { width, depth } = frame.size(0.16, opening.width + 0.4);
    batch.addBox(materials.dressedStone, x, opening.bottom - 0.05, z, width, 0.1, depth);
  }
}
