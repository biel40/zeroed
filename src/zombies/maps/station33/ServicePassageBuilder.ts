import * as THREE from 'three';
import { addEntrancePassageShell, EntranceFrame } from '../shared/EntrancePassage';
import { seededRandom } from '../shared/ProceduralNoise';
import {
  SERVICE_PASSAGE,
  STATION33_OPENINGS,
  STATION33_WALL_THICKNESS,
  type Station33Barrier,
} from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

const HALF_WALL = STATION33_WALL_THICKNESS / 2;

/**
 * The hidden side of every zombie entrance: a dark dead-end passage where
 * its zombies appear, and the frame of the gate or vent on the hall side.
 * The surface-stairs passage ends in the bottom steps of the buried way up.
 */
export function buildServicePassages(
  context: Station33BuildContext,
  lighting: Station33Lighting,
  barriers: ReadonlyArray<Station33Barrier>,
): void {
  for (const barrier of barriers) {
    const frame = new EntranceFrame(barrier);
    addPassage(context, lighting, barrier, frame);
    if (barrier.kind === 'gate') addGateFrame(context, frame);
    else addVentFrame(context, frame);
  }
}

function addPassage(context: Station33BuildContext, lighting: Station33Lighting, barrier: Station33Barrier, frame: EntranceFrame): void {
  const { structure, materials, batch } = context;
  const width = SERVICE_PASSAGE.width[barrier.kind];
  const height = SERVICE_PASSAGE.height[barrier.kind];
  const end = HALF_WALL + SERVICE_PASSAGE.length;
  const middle = HALF_WALL + SERVICE_PASSAGE.length / 2;
  addEntrancePassageShell(structure, frame, barrier.id,
    { length: SERVICE_PASSAGE.length, width, height, wallThickness: STATION33_WALL_THICKNESS }, materials.serviceConcrete, 'concrete');

  // Cable trays and a pipe under the ceiling, and a red battery lamp at the far end.
  for (const across of [-width / 2 + 0.2, width / 2 - 0.25]) {
    const { x, z } = frame.point(middle, across);
    const { width: sizeX, depth: sizeZ } = frame.size(SERVICE_PASSAGE.length, 0.1);
    batch.addBox(materials.greySteel, x, height - 0.12, z, sizeX, 0.08, sizeZ);
  }
  const bulb = new THREE.SphereGeometry(0.06, 8, 6);
  const lamp = frame.point(end - 0.1, 0);
  bulb.translate(lamp.x, height - 0.25, lamp.z);
  batch.add(bulb, lighting.circuitMaterial('emergency'));

  if (barrier.kind === 'gate') addBuriedStairs(context, barrier, frame, width, end);
}

/** Bottom steps of a stairway climbing towards the surface, choked with spoil past the spawn. */
function addBuriedStairs(context: Station33BuildContext, barrier: Station33Barrier, frame: EntranceFrame, width: number, end: number): void {
  const { batch, materials } = context;
  const firstStep = SERVICE_PASSAGE.spawnDepth + 0.7;
  for (let step = 0; step < 3; step++) {
    const along = firstStep + step * 0.3 + 0.15;
    if (along > end) break;
    const { x, z } = frame.point(along, 0);
    const { width: sizeX, depth: sizeZ } = frame.size(0.3, width);
    batch.addBox(materials.darkGranite, x, 0.09 + step * 0.09, z, sizeX, 0.18 + step * 0.18, sizeZ);
  }
  const random = seededRandom(Math.round(barrier.x * 13 + barrier.z * 7));
  for (let index = 0; index < 10; index++) {
    const size = 0.3 + random() * 0.5;
    const { x, z } = frame.point(end - random() * 0.6, (random() - 0.5) * width);
    batch.addBox(materials.rubble, x, 0.4 + random() * 1.6, z, size, size * 0.8, size, random() * 3, random() * 3, random() * 3);
  }
}

/** Bronze door frame around a service gate opening, flush with the hall face. */
function addGateFrame(context: Station33BuildContext, frame: EntranceFrame): void {
  const { batch, materials } = context;
  const opening = STATION33_OPENINGS.gate;
  const face = -HALF_WALL - 0.03;
  for (const side of [-1, 1]) {
    const { x, z } = frame.point(face, side * (opening.width / 2 + 0.06));
    const { width, depth } = frame.size(0.08, 0.12);
    batch.addBox(materials.bronze, x, opening.top / 2, z, width, opening.top, depth);
  }
  const { x, z } = frame.point(face, 0);
  const { width, depth } = frame.size(0.08, opening.width + 0.24);
  batch.addBox(materials.bronze, x, opening.top + 0.05, z, width, 0.1, depth);
}

/** Painted steel grille frame with the stubs of its torn louvres. */
function addVentFrame(context: Station33BuildContext, frame: EntranceFrame): void {
  const { batch, materials } = context;
  const opening = STATION33_OPENINGS.vent;
  const face = -HALF_WALL - 0.03;
  for (const side of [-1, 1]) {
    const { x, z } = frame.point(face, side * (opening.width / 2 + 0.05));
    const { width, depth } = frame.size(0.08, 0.1);
    batch.addBox(materials.paintedSteel, x, (opening.bottom + opening.top) / 2, z, width, opening.top - opening.bottom + 0.2, depth);
  }
  for (const y of [opening.bottom - 0.05, opening.top + 0.05]) {
    const { x, z } = frame.point(face, 0);
    const { width, depth } = frame.size(0.08, opening.width + 0.2);
    batch.addBox(materials.paintedSteel, x, y, z, width, 0.1, depth);
  }
  for (const y of [opening.top - 0.1, opening.top - 0.24]) {
    const { x, z } = frame.point(face + 0.06, 0.25);
    const { width, depth } = frame.size(0.1, opening.width * 0.55);
    batch.addBox(materials.paintedSteel, x, y, z, width, 0.02, depth);
  }
}
