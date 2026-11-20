import * as THREE from 'three';
import { EYE_HEIGHT, type FloorTransitionZone, type StairRamp } from '../../../../player/PlayerController';
import type { StainFaces } from '../../../GibWalls';
import {
  CATACOMB_FLOOR,
  CATACOMB_FLOOR_Y,
  CATACOMB_WALL_THICKNESS,
  CRYPT_LANDING,
  CRYPT_STAIR,
  CRYPT_STAIR_WALL_XS,
  CRYPT_STAIR_X,
} from '../../DieKathedraleCatacombsConfig';
import { DIE_KATHEDRALE_DOORS } from '../../DieKathedraleConfig';
import { seededRandom } from '../../shared/ProceduralNoise';
import type { PlayerBounds } from '../../ZombieArena';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { archPoints, ribGeometries } from '../GothicVault';
import { addHangingRoot, addRubble, addSkull, addWallStain, addWallTorch } from './CatacombDecor';

const { minX, maxX, headZ, topZ, bottomZ, steps, headroom } = CRYPT_STAIR;
const WIDTH = maxX - minX;
const RUN = topZ - bottomZ;
const RISE = -CATACOMB_FLOOR_Y;
const SLOPE = Math.atan2(RISE, RUN);
const SLOPE_LENGTH = Math.hypot(RISE, RUN);
/** The stair walls rise from the catacomb floor past the head landing's ceiling. */
const WALL_TOP = headroom + 0.2;
/** Where the stair walls end at the foot: the far face of the landing's south wall. */
const WALL_FOOT_Z = bottomZ + CATACOMB_WALL_THICKNESS;

/** Ground height of the flight at `z`: 0 at its head, the catacomb floor at its foot. */
export function cryptStairY(z: number): number {
  return -THREE.MathUtils.clamp((topZ - z) / RUN, 0, 1) * RISE;
}

/**
 * The flight between the crossing (floor 0) and the catacombs (floor -1).
 * Inside its volume height follows the slope for the player and the horde;
 * each floor changes on the far landing, as on the mansion's stair.
 */
export function cryptStairTransitions(groundBounds: PlayerBounds, catacombBounds: PlayerBounds): ReadonlyArray<FloorTransitionZone> {
  const ramp: StairRamp = {
    // Each end runs on past its landing further than a frame's walk, so the last step on the slope is always level.
    box: new THREE.Box3(new THREE.Vector3(minX, CATACOMB_FLOOR_Y - 0.2, bottomZ - 0.15), new THREE.Vector3(maxX, headroom - 0.9, topZ + 0.15)),
    top: { x: CRYPT_STAIR_X, y: 0, z: topZ },
    bottom: { x: CRYPT_STAIR_X, y: CATACOMB_FLOOR_Y, z: bottomZ },
    // In front of the crypt gate, so a body coming across the crossing lines up with the flight.
    topApproach: { x: CRYPT_STAIR_X, y: 0, z: headZ + 2.2 },
  };
  return [
    {
      box: new THREE.Box3(new THREE.Vector3(minX + 0.05, CATACOMB_FLOOR_Y - 0.2, bottomZ - 0.35), new THREE.Vector3(maxX - 0.05, 1, bottomZ + 0.15)),
      sourceFloor: 0,
      targetFloor: CATACOMB_FLOOR,
      targetY: CATACOMB_FLOOR_Y + EYE_HEIGHT,
      bounds: catacombBounds,
      ramp,
    },
    {
      box: new THREE.Box3(new THREE.Vector3(minX + 0.05, -0.5, topZ - 0.2), new THREE.Vector3(maxX - 0.05, 2.2, topZ + 0.15)),
      sourceFloor: CATACOMB_FLOOR,
      targetFloor: 0,
      targetY: EYE_HEIGHT,
      bounds: groundBounds,
      ramp,
    },
  ];
}

/**
 * The stairway of the condemned: a weathered surround round the crypt gate
 * in the crossing, a cramped head landing behind it, then one long flight
 * of worn steps under a ceiling that follows them down, between damp walls
 * with roots coming through, one torch at the head and one at the foot.
 */
export function buildCryptStair(context: DieKathedraleBuildContext): void {
  buildShaft(context);
  buildFlight(context);
  dressGateSurround(context);
  dressShaft(context);
}

function buildShaft(context: DieKathedraleBuildContext): void {
  const { structure, materials, batch } = context;
  const length = headZ - WALL_FOOT_Z;
  for (const [index, x] of CRYPT_STAIR_WALL_XS.entries()) {
    structure.addBox(x, (CATACOMB_FLOOR_Y + WALL_TOP) / 2, (headZ + WALL_FOOT_Z) / 2, CATACOMB_WALL_THICKNESS, WALL_TOP - CATACOMB_FLOOR_Y, length, materials.cryptStone, {
      name: `crypt-stair-wall-${index}`, surface: 'concrete', mapRole: 'wall', castShadow: false, uvSeed: 70 + index, worldUVs: true, blocksPlayer: true,
    });
  }
  // The head landing: a slab level with the crossing and a flat ceiling over it.
  const landingDepth = headZ - topZ;
  structure.addBox(CRYPT_STAIR_X, -0.08, (headZ + topZ) / 2, WIDTH, 0.16, landingDepth, materials.cryptFloor, {
    name: 'crypt-stair-head-floor', surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: 73, worldUVs: true, blocksPlayer: false,
  });
  batch.addBox(materials.cryptStone, CRYPT_STAIR_X, headroom + 0.1, (headZ + topZ) / 2, WIDTH + 0.02, 0.2, landingDepth + 0.02, 0, 0, 0, 74);
}

/** Worn steps, the sloping ceiling over them and the slope bullets hit. */
function buildFlight(context: DieKathedraleBuildContext): void {
  const { batch, materials, structure, group } = context;
  const run = RUN / steps;
  const rise = RISE / steps;
  const random = seededRandom(7101);
  for (let step = 0; step < steps; step++) {
    const top = -rise * (step + 1);
    const z = topZ - run * (step + 0.5);
    // Each tread a little dished and uneven: centuries of feet.
    const tilt = (random() - 0.5) * 0.02;
    batch.addBox(materials.cryptStone, CRYPT_STAIR_X, top - (rise + 0.25) / 2, z, WIDTH, rise + 0.25, run, tilt, 0, 0, 75 + step);
    batch.addBox(materials.dressedStone, CRYPT_STAIR_X, top - 0.03, z + run / 2 - 0.04, WIDTH - 0.3 - random() * 0.4, 0.06, 0.08, 0, 0, 0, 100 + step);
  }
  const middleZ = (topZ + bottomZ) / 2;
  // Parallel to the treads, `headroom` above them: it meets the head landing's ceiling and the landing's south wall.
  batch.addBox(materials.cryptStone, CRYPT_STAIR_X, -RISE / 2 + headroom + 0.1, middleZ, WIDTH + 0.02, 0.2, SLOPE_LENGTH + 0.3, -SLOPE, 0, 0, 120);
  // Transverse arches carry the sloping ceiling every few steps.
  for (let arch = 1; arch < 4; arch++) {
    const z = topZ - RUN * arch / 4;
    const spring = cryptStairY(z) + headroom - 0.5;
    const points = archPoints(minX, z, maxX, z, spring, 0.42, 6);
    for (const geometry of ribGeometries(points, 0.22, 0.24)) batch.add(geometry, materials.dressedStone);
  }
  // Raycast-only surface (as on the mansion's stair): treads are batched visuals.
  const slope = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, 0.08, SLOPE_LENGTH), context.collider);
  slope.position.set(CRYPT_STAIR_X, -RISE / 2 - 0.04, middleZ);
  slope.rotation.x = -SLOPE;
  slope.name = 'crypt-stair-ramp';
  slope.userData.surface = 'concrete';
  slope.userData.mapRole = 'walkable-stair-ramp';
  slope.userData.walkableSurface = true;
  slope.userData.stainFaces = 'none' satisfies StainFaces;
  structure.addSolid(slope, false);
  group.add(slope);
}

/** A pointed stone surround, older and rougher than the crossing round it, with iron studs. */
function dressGateSurround(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const gate = DIE_KATHEDRALE_DOORS.find((door) => door.id === 'crypt-gate');
  if (!gate) return;
  // The crossing side of the nave's north wall.
  const face = gate.z + 0.2;
  const half = 0.98;
  for (const side of [-1, 1]) {
    batch.addBox(materials.cryptStone, gate.x + side * half, 1.15, face, 0.3, 2.3, 0.14, 0, 0, 0, 130 + side);
  }
  const head = archPoints(gate.x - half, face, gate.x + half, face, 2.2, 0.8, 6);
  for (const geometry of ribGeometries(head, 0.26, 0.16)) batch.add(geometry, materials.cryptStone);
  // A worn skull carved over the keystone: the dead below.
  addSkull(batch, materials, gate.x, 3.1, face + 0.02, 0, -0.2);
  addWallStain(batch, materials, gate.x + 1.4, 0, face - 0.04, 0, 1, 1.2, 1.6);
}

function dressShaft(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const random = seededRandom(7102);
  addWallTorch(context, maxX, 2.2, topZ - 0.3, -1, 0);
  addWallTorch(context, CRYPT_LANDING.minX, CATACOMB_FLOOR_Y + 2.2, -62.3, 1, 0);
  // Roots forcing the joints of the sloping ceiling, and damp running down the walls.
  for (const z of [-53.4, -56.9]) {
    const ceiling = cryptStairY(z) + headroom;
    addHangingRoot(batch, materials, minX + 0.05, ceiling, z, 1, 0, 1.3 + random() * 0.6, random);
  }
  for (const [x, facing] of [[minX, 1], [maxX, -1]] as const) {
    for (const z of [-52.2, -55.6, -58.8]) {
      addWallStain(batch, materials, x, cryptStairY(z) - 0.2, z, facing, 0, 1 + random() * 0.8, 1.6 + random() * 1.2);
    }
  }
  addRubble(batch, materials, CRYPT_STAIR_X + 0.7, CATACOMB_FLOOR_Y, bottomZ - 1.4, 9, 1.4, random);
  // Water seeping from the vault pools at the foot of the landing's west wall, under a damp streak.
  const puddleX = (CRYPT_LANDING.minX + CRYPT_LANDING.maxX) / 2 - 1.6;
  const puddleZ = CRYPT_LANDING.minZ + 1.6;
  batch.add(new THREE.CylinderGeometry(0.85, 0.85, 0.008, 18).scale(1, 1, 0.75).translate(puddleX, CATACOMB_FLOOR_Y + 0.006, puddleZ), materials.iron);
  addWallStain(batch, materials, CRYPT_LANDING.minX, CATACOMB_FLOOR_Y, puddleZ, 1, 0, 1.1, 3.2);
}
