import { STATION33_BARRIERS, STATION33_OPENINGS, STATION33_WALL_THICKNESS, TALLER } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import { stationWallLine } from './WallOpenings';

const { hall, ceilingHeight } = TALLER;
const HALF_THICKNESS = STATION33_WALL_THICKNESS / 2;

/** Oil-stained concrete floor, flat ceiling and the yellow plaster walls of the workshop. */
export function buildTallerShell(context: Station33BuildContext): void {
  const { structure, materials } = context;
  const yellowPlaster = materials.vaultPlaster.clone();
  yellowPlaster.name = 'station33-workshop-yellow';
  yellowPlaster.color.setHex(TALLER.color);
  const centerX = (hall.minX + hall.maxX) / 2;
  const centerZ = (hall.minZ + hall.maxZ) / 2;
  const width = hall.maxX - hall.minX + 2 * STATION33_WALL_THICKNESS;
  const length = hall.maxZ - hall.minZ + STATION33_WALL_THICKNESS;
  for (const [name, y, material] of [
    ['floor', -0.08, materials.depotFloor],
    ['ceiling', ceilingHeight + 0.08, materials.serviceConcrete],
  ] as const) {
    structure.addBox(centerX, y, centerZ - HALF_THICKNESS, width, 0.16, length, material, {
      name: `taller-${name}`, surface: 'concrete', mapRole: 'slab', blocksPlayer: false, castShadow: false, uvSeed: 180,
    });
  }
  // The south wall and doorway already belong to the substation.
  const walls = [
    stationWallLine('x', hall.minZ - HALF_THICKNESS, hall.minX - STATION33_WALL_THICKNESS, hall.maxX + STATION33_WALL_THICKNESS, 1),
    stationWallLine('z', hall.minX - HALF_THICKNESS, hall.minZ, hall.maxZ, 1),
    stationWallLine('z', hall.maxX + HALF_THICKNESS, hall.minZ, hall.maxZ, -1),
  ];
  for (const wall of walls) {
    structure.addWallWithOpenings(wall.axis, wall.fixed, wall.min, wall.max, 0, ceilingHeight,
      STATION33_WALL_THICKNESS, wall.openings, yellowPlaster, {
        surface: 'concrete', mapRole: 'wall', blocksPlayer: true, castShadow: !context.profile.useReducedEffects, uvSeed: 182,
      });
  }
  addDado(context);
}

const DADO_HEIGHT = 1.1;

/**
 * Grey dado along the foot of the walls, where trolleys and boots scuffed
 * the paint, capped by a hazard-striped band. It stops at the service door.
 */
function addDado(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const gate = STATION33_BARRIERS.find((barrier) => barrier.id === 'taller-service-door')!;
  const halfGate = STATION33_OPENINGS.gate.width / 2;
  const runs: ReadonlyArray<{ readonly axis: 'x' | 'z'; readonly fixed: number; readonly min: number; readonly max: number }> = [
    { axis: 'z', fixed: hall.minX + 0.006, min: hall.minZ, max: hall.maxZ },
    { axis: 'z', fixed: hall.maxX - 0.006, min: hall.minZ, max: hall.maxZ },
    { axis: 'x', fixed: hall.minZ + 0.006, min: hall.minX, max: gate.x - halfGate },
    { axis: 'x', fixed: hall.minZ + 0.006, min: gate.x + halfGate, max: hall.maxX },
  ];
  for (const run of runs) {
    const middle = (run.min + run.max) / 2;
    const length = run.max - run.min;
    const [x, z] = run.axis === 'x' ? [middle, run.fixed] : [run.fixed, middle];
    const [width, depth] = run.axis === 'x' ? [length, 0.012] : [0.012, length];
    batch.addBox(materials.serviceConcrete, x, DADO_HEIGHT / 2, z, width, DADO_HEIGHT, depth);
    batch.addBox(materials.hazardPaint, x, DADO_HEIGHT + 0.04, z, width + 0.006, 0.08, depth + 0.006);
  }
}
