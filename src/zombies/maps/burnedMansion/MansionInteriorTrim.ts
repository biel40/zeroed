import * as THREE from 'three';
import { projectMaterialUVs, wallSpans, type WallOpening } from '../shared/ArenaStructure';
import { seededRandom } from '../shared/ProceduralNoise';
import {
  MANSION_AREA_LIGHTS,
  MANSION_BARRIERS,
  MANSION_BUNKER_CEILING_Y,
  MANSION_BUNKER_DIVIDER_X,
  MANSION_BUNKER_Y,
  MANSION_DOOR_OPENING,
  MANSION_EAST_WALL_X,
  MANSION_GROUND_CEILING_Y,
  MANSION_SECRET_ROOM,
  MANSION_STAIR_BOTTOM_Z,
  MANSION_STAIR_TOP_Z,
  MANSION_WALL_THICKNESS,
  MANSION_WINDOW_OPENING,
} from '../BurnedMansionConfig';
import type { MansionBuildContext } from './MansionBuildContext';
import { MANSION_BUNKER_FACES, MANSION_GROUND_FACES, type MansionWallFace } from './MansionLayout';

/**
 * Architecture that makes the shell read as a Victorian house: walnut
 * wainscot, chair rail, skirting and a stepped cornice on every room face,
 * cased doors and windows, and the charred joists left exposed where the
 * ceiling burnt through. Below, the bunker gets its olive paint band,
 * concrete beams and service pipes. Heights are metres above each floor.
 */

const SKIRTING = { top: 0.16, depth: 0.035 } as const;
const WAINSCOT = { top: 0.88, depth: 0.025 } as const;
const CHAIR_RAIL = { bottom: 0.88, top: 0.95, depth: 0.045 } as const;
/** Stepped cornice from the ceiling down: [bottom, top, depth]. */
const CORNICE: ReadonlyArray<readonly [number, number, number]> = [[3.1, 3.2, 0.09], [3.02, 3.1, 0.055], [2.98, 3.02, 0.03]];
const CASING = { width: 0.11, depth: 0.04, headHeight: 0.14 } as const;
/** Below the bunker M60 outline, which hangs 1.15 m above the floor. */
const BUNKER_BAND = { top: 1.1, depth: 0.012 } as const;
const JOIST = { width: 0.14, height: 0.22, spacing: 1.2 } as const;
/** Joists keep this far from a light's ceiling rose. */
const FIXTURE_CLEARANCE = 0.32;
const BEAM = { width: 0.3, height: 0.28, xs: [-5.6, -3.2, -0.8, 1.6, 4.0, 8.4] } as const;
/** The bunker ceiling is open over the stairwell between these x. */
const STAIR_APERTURE_X = [5.2, 8.1] as const;
const PIPE = { radius: 0.06, drop: 0.5, inset: 0.14 } as const;
const WINDOW_CASING = { width: 0.1, depth: 0.04 } as const;
/** Gap left in the panelling around each soul lamp. */
const MOUNT_GAP_WIDTH = 0.8;

export function buildInteriorTrim(context: MansionBuildContext): void {
  for (const face of MANSION_GROUND_FACES) addGroundFaceTrim(context, face);
  for (const face of MANSION_BUNKER_FACES) addBunkerBand(context, face);
  addWindowReveals(context);
  addGroundJoists(context);
  addBunkerBeamsAndPipes(context);
}

/**
 * Interior window casings as two instanced meshes (side casings; head and
 * stool), on the room side of every window wall.
 */
export function buildWindowCasings(context: MansionBuildContext): void {
  const { materials, profile } = context;
  const sideHeight = MANSION_WINDOW_OPENING.top - MANSION_WINDOW_OPENING.sill + 0.1;
  const headWidth = MANSION_WINDOW_OPENING.width + WINDOW_CASING.width * 2 + 0.1;
  const sideGeometry = new THREE.BoxGeometry(WINDOW_CASING.width, sideHeight, WINDOW_CASING.depth);
  const headGeometry = new THREE.BoxGeometry(headWidth, 0.09, 0.07);
  projectMaterialUVs(sideGeometry, WINDOW_CASING.width, sideHeight, WINDOW_CASING.depth, materials.trimWood, 3);
  projectMaterialUVs(headGeometry, headWidth, 0.09, 0.07, materials.trimWood, 7);
  const sides = new THREE.InstancedMesh(sideGeometry, materials.trimWood, MANSION_BARRIERS.length * 2);
  const heads = new THREE.InstancedMesh(headGeometry, materials.trimWood, MANSION_BARRIERS.length * 2);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const sideOffset = MANSION_WINDOW_OPENING.width / 2 + WINDOW_CASING.width / 2;
  MANSION_BARRIERS.forEach((barrier, index) => {
    quaternion.setFromAxisAngle(up, Math.atan2(barrier.outwardX, barrier.outwardZ));
    // Room side of the wall, the casing standing proud of the plaster.
    const inset = MANSION_WALL_THICKNESS / 2 + WINDOW_CASING.depth / 2;
    const roomX = barrier.x - barrier.outwardX * inset;
    const roomZ = barrier.z - barrier.outwardZ * inset;
    const alongX = Math.abs(barrier.outwardZ);
    const alongZ = Math.abs(barrier.outwardX);
    for (const side of [-1, 1]) {
      position.set(roomX + alongX * sideOffset * side, MANSION_WINDOW_OPENING.sill - 0.03 + sideHeight / 2, roomZ + alongZ * sideOffset * side);
      sides.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), matrix.compose(position, quaternion, scale));
    }
    const headInset = MANSION_WALL_THICKNESS / 2 + 0.035;
    for (const [slot, y] of [[0, MANSION_WINDOW_OPENING.sill - 0.015], [1, MANSION_WINDOW_OPENING.top + 0.11]] as const) {
      position.set(barrier.x - barrier.outwardX * headInset, y, barrier.z - barrier.outwardZ * headInset);
      heads.setMatrixAt(index * 2 + slot, matrix.compose(position, quaternion, scale));
    }
  });
  for (const mesh of [sides, heads]) {
    mesh.castShadow = !profile.useReducedEffects;
    mesh.receiveShadow = true;
    mesh.userData.mapRole = 'window-frames';
    context.group.add(mesh);
  }
}

/** Axis-aligned strip on a face: `from`..`to` along it, `bottom`..`top` above its floor, `depth` proud of the wall. */
function addFaceStrip(
  context: MansionBuildContext,
  material: THREE.Material,
  face: MansionWallFace,
  from: number,
  to: number,
  bottom: number,
  top: number,
  depth: number,
): void {
  if (to - from <= 0.01 || top - bottom <= 0.005) return;
  const along = (from + to) / 2;
  const across = face.plane + face.inward * depth / 2;
  const y = face.floorY + (bottom + top) / 2;
  if (face.axis === 'x') context.batch.addWorldBox(material, along, y, across, to - from, top - bottom, depth);
  else context.batch.addWorldBox(material, across, y, along, depth, top - bottom, to - from);
}

function openings(face: MansionWallFace, doorPadding: number, windowPadding: number, mountWidth = 0): WallOpening[] {
  return [
    ...(mountWidth > 0 ? face.mounts.map((center) => ({ center, width: mountWidth, bottom: 0, top: 0 })) : []),
    ...face.doors.map((center) => ({ center, width: face.doorWidth + doorPadding * 2, bottom: 0, top: MANSION_DOOR_OPENING.top })),
    ...face.windows.map((center) => ({
      center,
      width: MANSION_WINDOW_OPENING.width + windowPadding * 2,
      bottom: MANSION_WINDOW_OPENING.sill,
      top: MANSION_WINDOW_OPENING.top,
    })),
  ];
}

function addGroundFaceTrim(context: MansionBuildContext, face: MansionWallFace): void {
  const { materials } = context;
  const doorsOnly = openings({ ...face, windows: [] }, CASING.width, 0);
  const allOpenings = openings(face, CASING.width, WINDOW_CASING.width, MOUNT_GAP_WIDTH);
  for (const [from, to] of wallSpans(face.from, face.to, doorsOnly)) {
    addFaceStrip(context, materials.trimWood, face, from, to, 0, SKIRTING.top, SKIRTING.depth);
    addFaceStrip(context, materials.trimWood, face, from, to, SKIRTING.top, SKIRTING.top + 0.02, SKIRTING.depth + 0.008);
  }
  for (const [from, to] of wallSpans(face.from, face.to, allOpenings)) {
    addFaceStrip(context, materials.wainscot, face, from, to, SKIRTING.top, WAINSCOT.top, WAINSCOT.depth);
    addFaceStrip(context, materials.trimWood, face, from, to, CHAIR_RAIL.bottom, CHAIR_RAIL.top, CHAIR_RAIL.depth);
    addFaceStrip(context, materials.trimWood, face, from, to, CHAIR_RAIL.bottom - 0.025, CHAIR_RAIL.bottom, WAINSCOT.depth + 0.01);
  }
  // Below each window the panelling continues up to the sill.
  const underWindow = MANSION_WINDOW_OPENING.width / 2 + WINDOW_CASING.width;
  for (const center of face.windows) {
    addFaceStrip(context, materials.wainscot, face, center - underWindow, center + underWindow, SKIRTING.top, MANSION_WINDOW_OPENING.sill - 0.03, WAINSCOT.depth);
  }
  for (const [bottom, top, depth] of CORNICE) {
    addFaceStrip(context, materials.trimWood, face, face.from, face.to, bottom, Math.min(top, face.ceilingY - face.floorY), depth);
  }
  for (const center of face.casedDoors) addDoorCasing(context, face, center);
}

function addDoorCasing(context: MansionBuildContext, face: MansionWallFace, center: number): void {
  const { trimWood } = context.materials;
  const half = face.doorWidth / 2;
  const top = MANSION_DOOR_OPENING.top;
  for (const side of [-1, 1]) {
    const inner = center + side * half;
    const outer = inner + side * CASING.width;
    addFaceStrip(context, trimWood, face, Math.min(inner, outer), Math.max(inner, outer), 0, top + CASING.headHeight, CASING.depth);
    // Plinth block at the foot of each casing.
    addFaceStrip(context, trimWood, face, Math.min(inner, outer) - 0.01, Math.max(inner, outer) + 0.01, 0, 0.22, CASING.depth + 0.012);
  }
  const span = half + CASING.width;
  addFaceStrip(context, trimWood, face, center - span, center + span, top, top + CASING.headHeight, CASING.depth);
  addFaceStrip(context, trimWood, face, center - span - 0.04, center + span + 0.04, top + CASING.headHeight, top + CASING.headHeight + 0.05, CASING.depth + 0.02);
}

/** Olive civil-defence paint up to shoulder height, leaving the secret entrance bare. */
function addBunkerBand(context: MansionBuildContext, face: MansionWallFace): void {
  for (const [from, to] of wallSpans(face.from, face.to, openings(face, 0, 0))) {
    addFaceStrip(context, context.materials.bunkerPaint, face, from, to, 0, BUNKER_BAND.top, BUNKER_BAND.depth);
  }
}

/** Jamb liners, a sill board and the last shards of glass in every window opening. */
function addWindowReveals(context: MansionBuildContext): void {
  const { batch, materials } = context;
  const { width, sill, top } = MANSION_WINDOW_OPENING;
  const depth = MANSION_WALL_THICKNESS;
  for (const barrier of MANSION_BARRIERS) {
    const yaw = Math.atan2(barrier.outwardX, barrier.outwardZ);
    const toWorld = new THREE.Matrix4().makeRotationY(yaw).setPosition(barrier.x, 0, barrier.z);
    const local = new THREE.Matrix4();
    const piece = (material: THREE.Material, x: number, y: number, z: number, sizeX: number, sizeY: number, sizeZ: number): void => {
      const geometry = new THREE.BoxGeometry(sizeX, sizeY, sizeZ);
      projectMaterialUVs(geometry, sizeX, sizeY, sizeZ, material, Math.round(barrier.x * 7 + barrier.z * 3));
      batch.add(geometry, material, toWorld.clone().multiply(local.makeTranslation(x, y, z)));
    };
    for (const side of [-1, 1]) piece(materials.trimWood, side * (width / 2 - 0.0125), (sill + top) / 2, 0, 0.025, top - sill, depth);
    piece(materials.trimWood, 0, top - 0.0125, 0, width, 0.025, depth);
    // Kept just under the casing stool so their tops never share a plane.
    piece(materials.trimWood, 0, sill + 0.012, -0.03, width, 0.024, depth + 0.06);
    // Shards still wedged in the outer corners of the frame.
    const random = seededRandom(Math.round(barrier.x * 130 + barrier.z * 310) + 5300);
    for (const [cornerX, cornerY] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      if (random() < 0.25) continue;
      const shard = new THREE.CircleGeometry(0.12 + random() * 0.16, 3);
      shard.rotateZ(random() * Math.PI * 2);
      shard.scale(1, 0.6 + random() * 0.8, 1);
      const x = cornerX * (width / 2 - 0.08);
      const y = cornerY > 0 ? top - 0.1 : sill + 0.12;
      batch.add(shard, materials.windowGlass, toWorld.clone().multiply(local.makeTranslation(x, y, depth / 2 - 0.05)));
    }
  }
}

/** True when no ground-floor light hangs within FIXTURE_CLEARANCE of the joist's footprint. */
function clearOfFixtures(minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  return MANSION_AREA_LIGHTS.every((light) => light.floor !== 0
    || light.x < minX - FIXTURE_CLEARANCE || light.x > maxX + FIXTURE_CLEARANCE
    || light.z < minZ - FIXTURE_CLEARANCE || light.z > maxZ + FIXTURE_CLEARANCE);
}

/** Charred joists where the ceiling plaster burnt away, plus two that tore loose and sag. */
function addGroundJoists(context: MansionBuildContext): void {
  const { batch, materials } = context;
  const y = MANSION_GROUND_CEILING_Y - JOIST.height / 2;
  const half = MANSION_WALL_THICKNESS / 2;
  const joistAlongX = (minX: number, maxX: number, z: number): void => {
    if (!clearOfFixtures(minX, maxX, z - JOIST.width / 2, z + JOIST.width / 2)) return;
    batch.addBox(materials.charredWood, (minX + maxX) / 2, y, z, maxX - minX, JOIST.height, JOIST.width, 0, 0, 0, Math.round(z * 10 + minX));
  };
  // Start room: joists span its short (north-south) side.
  const startMinZ = 2 + half;
  const startMaxZ = 10.15 - half;
  for (let x = -6.4; x <= 8.5; x += JOIST.spacing) {
    if (!clearOfFixtures(x - JOIST.width / 2, x + JOIST.width / 2, startMinZ, startMaxZ)) continue;
    batch.addBox(materials.charredWood, x, y, (startMinZ + startMaxZ) / 2, JOIST.width, JOIST.height, startMaxZ - startMinZ, 0, 0, 0, Math.round(x * 10));
  }
  // Mystery Box room, east hall and stair room: joists run east-west.
  const eastFaceX = MANSION_EAST_WALL_X - half;
  for (let z = -7.4; z <= 1.5; z += JOIST.spacing) {
    joistAlongX(-7 + half, -half, z);
    joistAlongX(half, MANSION_BUNKER_DIVIDER_X - half, z);
    // Over the stairwell the shaft walls carry the joists.
    const overShaft = z < MANSION_STAIR_TOP_Z && z > MANSION_STAIR_BOTTOM_Z;
    joistAlongX(overShaft ? 5.475 : MANSION_BUNKER_DIVIDER_X + half, overShaft ? 7.825 : eastFaceX, z);
  }
  // Torn joists hanging from one end, well above head height.
  batch.addBox(materials.charredWood, 7.2, 2.72, 3.0, 2.1, JOIST.height, JOIST.width, 0, 0, -0.38);
  batch.addBox(materials.charredWood, -6.0, 2.75, -0.9, JOIST.width, JOIST.height, 1.9, 0.4, 0.15, 0);
}

/** Concrete ribs across the bunker ceiling and two service pipes along its long walls. */
function addBunkerBeamsAndPipes(context: MansionBuildContext): void {
  const { batch, materials } = context;
  const half = MANSION_WALL_THICKNESS / 2;
  const minZ = -9.5 + half;
  const maxZ = 2 - half;
  const westX = MANSION_SECRET_ROOM.entranceX + half;
  const eastX = MANSION_EAST_WALL_X - MANSION_WALL_THICKNESS;
  for (const x of BEAM.xs) {
    if (x > STAIR_APERTURE_X[0] && x < STAIR_APERTURE_X[1]) continue;
    batch.addBox(materials.bunkerCeiling, x, MANSION_BUNKER_CEILING_Y - BEAM.height / 2, (minZ + maxZ) / 2, BEAM.width, BEAM.height, maxZ - minZ, 0, 0, 0, Math.round(x * 10));
  }
  const pipeY = MANSION_BUNKER_CEILING_Y - PIPE.drop;
  const length = eastX - westX;
  for (const z of [minZ + PIPE.inset, maxZ - PIPE.inset]) {
    const pipe = new THREE.CylinderGeometry(PIPE.radius, PIPE.radius, length, 10).rotateZ(Math.PI / 2);
    pipe.translate((westX + eastX) / 2, pipeY, z);
    batch.add(pipe, materials.metal);
    const towardWall = z < 0 ? -1 : 1;
    for (let x = westX + 0.6; x < eastX; x += 1.6) {
      batch.addBox(materials.metal, x, pipeY + 0.04, z + towardWall * 0.05, 0.05, 0.2, 0.12);
    }
  }
  // Floor drain grates under the pipes' condensation.
  for (const [x, z] of [[-3.8, -8.6], [2.6, 1.0]] as const) {
    batch.addBox(materials.metal, x, MANSION_BUNKER_Y + 0.004, z, 0.45, 0.008, 0.45);
  }
}
