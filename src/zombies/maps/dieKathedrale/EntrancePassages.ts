import { CATACOMB_FLOOR, CATACOMB_WALL_THICKNESS } from '../DieKathedraleCatacombsConfig';
import { EXTERIOR_ZONES, passageFacesExterior } from '../DieKathedraleExteriorConfig';
import {
  DIE_KATHEDRALE_ENTRANCES,
  DIE_KATHEDRALE_OPENINGS,
  DIE_KATHEDRALE_PASSAGE,
  DIE_KATHEDRALE_WALL_THICKNESS,
  dieKathedraleFloorY,
  siteFloor,
  type DieKathedraleEntrance,
} from '../DieKathedraleConfig';
import { addEntrancePassageShell, EntranceFrame } from '../shared/EntrancePassage';
import { seededRandom } from '../shared/ProceduralNoise';
import { archPoints, ribGeometries } from './GothicVault';
import type { DieKathedraleBuildContext } from './DieKathedraleBuildContext';

/** The build contexts the entrances merge into, by where they open. */
export interface EntrancePassageContexts {
  readonly interior: DieKathedraleBuildContext;
  readonly plaza: DieKathedraleBuildContext;
  readonly catacombs: DieKathedraleBuildContext;
  readonly exterior: DieKathedraleBuildContext;
  readonly upper: DieKathedraleBuildContext;
}

/** Thickness of the wall an entrance is cut through. */
function wallThickness(entrance: DieKathedraleEntrance): number {
  return siteFloor(entrance) === CATACOMB_FLOOR ? CATACOMB_WALL_THICKNESS : DIE_KATHEDRALE_WALL_THICKNESS;
}

/**
 * The hidden side of every zombie entrance (a dark dead-end passage of rough
 * masonry, choked with rubble past the spawn) and its pointed stone surround
 * on the side the player sees. Each area takes the surrounds of its own
 * entrances, so they merge with that area and are culled with it.
 */
export function buildEntrancePassages(contexts: EntrancePassageContexts): void {
  for (const entrance of DIE_KATHEDRALE_ENTRANCES) {
    const context = surroundsFor(contexts, entrance);
    const facesExterior = passageFacesExterior(entrance);
    const frame = new EntranceFrame(entrance);
    addPassage(facesExterior ? contexts.exterior : context, entrance, frame, facesExterior);
    addSurround(context, entrance, frame);
  }
}

function surroundsFor(contexts: EntrancePassageContexts, entrance: DieKathedraleEntrance): DieKathedraleBuildContext {
  const floor = siteFloor(entrance);
  if (floor === CATACOMB_FLOOR) return contexts.catacombs;
  if (floor > 0) return contexts.upper;
  if (entrance.zone === EXTERIOR_ZONES[0] || entrance.zone === EXTERIOR_ZONES[1]) return contexts.exterior;
  return entrance.zone === 'plaza' ? contexts.plaza : contexts.interior;
}

function addPassage(context: DieKathedraleBuildContext, entrance: DieKathedraleEntrance, frame: EntranceFrame, blocksPlayer: boolean): void {
  const { structure, materials, batch } = context;
  const width = DIE_KATHEDRALE_PASSAGE.width[entrance.kind];
  const height = DIE_KATHEDRALE_PASSAGE.height[entrance.kind];
  const thickness = wallThickness(entrance);
  const baseY = dieKathedraleFloorY(siteFloor(entrance));
  addEntrancePassageShell(structure, frame, entrance.id,
    { length: DIE_KATHEDRALE_PASSAGE.length, width, height, wallThickness: thickness, baseY, blocksPlayer }, materials.roughStone, 'concrete');
  const end = thickness / 2 + DIE_KATHEDRALE_PASSAGE.length;
  const random = seededRandom(Math.round(entrance.x * 13 + entrance.z * 7));
  for (let index = 0; index < 9; index++) {
    const size = 0.3 + random() * 0.5;
    const { x, z } = frame.point(end - random() * 0.6, (random() - 0.5) * width);
    batch.addBox(materials.roughStone, x, baseY + 0.3 + random() * 1.5, z, size, size * 0.8, size, random() * 3, random() * 3, random() * 3);
  }
}

/** Jambs and a pointed head round the opening; chapel windows get a sill as well. */
function addSurround(context: DieKathedraleBuildContext, entrance: DieKathedraleEntrance, frame: EntranceFrame): void {
  const { batch, materials } = context;
  const opening = DIE_KATHEDRALE_OPENINGS[entrance.kind];
  const baseY = dieKathedraleFloorY(siteFloor(entrance));
  // How far the stone surround stands proud of the wall face.
  const surroundFace = -wallThickness(entrance) / 2 - 0.04;
  const half = opening.width / 2 + 0.1;
  for (const side of [-1, 1]) {
    const { x, z } = frame.point(surroundFace, side * half);
    const { width, depth } = frame.size(0.1, 0.2);
    batch.addBox(materials.dressedStone, x, baseY + (opening.bottom + opening.top) / 2, z, width, opening.top - opening.bottom, depth, 0, 0, 0, side + 2);
  }
  const from = frame.point(surroundFace, -half);
  const to = frame.point(surroundFace, half);
  const head = archPoints(from.x, from.z, to.x, to.z, baseY + opening.top, entrance.kind === 'door' ? 0.75 : 0.55, 6);
  for (const geometry of ribGeometries(head, 0.1, 0.2)) batch.add(geometry, materials.dressedStone);
  if (opening.bottom > 0) {
    const { x, z } = frame.point(surroundFace, 0);
    const { width, depth } = frame.size(0.16, opening.width + 0.4);
    batch.addBox(materials.dressedStone, x, baseY + opening.bottom - 0.05, z, width, 0.1, depth);
  }
}
