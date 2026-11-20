import { EXTERIOR_AREAS } from '../../DieKathedraleExteriorConfig';
import type { FloorRect } from '../../DieKathedraleConfig';
import { addSolidProxy } from '../../shared/SolidProxy';
import { StaticMeshBatch } from '../../shared/StaticMeshBatch';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { addStoneWall } from '../DieKathedraleWalls';
import { dressCourtyard, dressEsplanade, dressSidePassage } from './ExteriorDressing';
import { addEastFacade } from './MiradorPortal';
import { buildPalauSteps } from './PalauSteps';

const NO_SHADOWS = { castShadow: false, receiveShadow: false };
const CORNER_OVERLAP = 0.15;
const { esplanade, sidePassage, sideCourtyard } = EXTERIOR_AREAS;

/** Preserves the entrance plaza and joins the new eastern precinct to its side wall. */
export function buildExterior(context: DieKathedraleBuildContext): void {
  buildEsplanade(context);
  const passage = { ...context, batch: new StaticMeshBatch() };
  buildSidePassage(passage);
  passage.batch.build(passage.group, 'die-kathedrale-palau-passage', NO_SHADOWS);
  const courtyard = { ...context, batch: new StaticMeshBatch() };
  buildCourtyard(courtyard);
  courtyard.batch.build(courtyard.group, 'die-kathedrale-side-courtyard', NO_SHADOWS);
}

function buildEsplanade(context: DieKathedraleBuildContext): void {
  const { minX, maxX, minZ, maxZ } = esplanade;
  addPaving(context, 'mirador-esplanade-floor', esplanade);
  addStoneWall(context, 'mirador-north-wall', {
    axis: 'x', fixed: minZ, min: minX - CORNER_OVERLAP, max: maxX + CORNER_OVERLAP, height: 3.4,
  });
  addStoneWall(context, 'mirador-courtyard-wall', {
    axis: 'z', fixed: maxX, min: minZ, max: maxZ, height: 3.5,
    breaks: [sideCourtyard.minZ, sideCourtyard.maxZ],
  });
  addStoneWall(context, 'mirador-south-wall', {
    axis: 'x', fixed: maxZ, min: sidePassage.maxX - CORNER_OVERLAP, max: maxX + CORNER_OVERLAP, height: 2.8,
  });
  addEastFacade(context, [-35, -28, -21, -14]);
  dressEsplanade(context);
}

function buildSidePassage(context: DieKathedraleBuildContext): void {
  const { minX, maxX, minZ, maxZ } = sidePassage;
  addPaving(context, 'palau-side-passage-floor', sidePassage);
  addStoneWall(context, 'palau-side-wall', {
    axis: 'z', fixed: maxX, min: minZ, max: 8.5, height: 2.75, breaks: [-4],
  });
  addStoneWall(context, 'palau-side-parapet', {
    axis: 'z', fixed: maxX, min: 8.5, max: maxZ + CORNER_OVERLAP, height: 1.28,
  });
  addStoneWall(context, 'palau-sea-parapet', {
    axis: 'x', fixed: maxZ + CORNER_OVERLAP, min: minX - CORNER_OVERLAP, max: maxX + CORNER_OVERLAP, height: 1.28,
  });
  // The existing plaza façade has a corner turret that is now inside a playable sector.
  addSolidProxy(context, 'palau-front-corner-turret',
    { x: 14.3, y: 0, z: -0.2 }, { x: 16.5, y: 6, z: 2 }, 'concrete', 'none');
  buildPalauSteps(context);
  dressSidePassage(context);
}

function buildCourtyard(context: DieKathedraleBuildContext): void {
  const { minX, maxX, minZ, maxZ } = sideCourtyard;
  addPaving(context, 'side-courtyard-floor', sideCourtyard);
  for (const z of [minZ, maxZ]) {
    addStoneWall(context, `side-courtyard-wall-${z}`, {
      axis: 'x', fixed: z, min: minX, max: maxX + CORNER_OVERLAP, height: 3.6,
    });
  }
  addStoneWall(context, 'side-courtyard-east-wall', {
    axis: 'z', fixed: maxX, min: minZ, max: maxZ, height: 3.6,
  });
  dressCourtyard(context);
}

function addPaving(context: DieKathedraleBuildContext, name: string, area: FloorRect): void {
  const width = area.maxX - area.minX;
  const depth = area.maxZ - area.minZ;
  context.structure.addBox(area.minX + width / 2, -0.1, area.minZ + depth / 2, width, 0.2, depth,
    context.materials.plazaPaving, { name, surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: 12, worldUVs: true, blocksPlayer: false });
}
