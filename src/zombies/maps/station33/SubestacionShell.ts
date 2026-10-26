import * as THREE from 'three';
import { wallSpans, type WallOpening } from '../shared/ArenaStructure';
import { STATION33_WALL_THICKNESS, SUBESTACION } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import { stationWallLine as line, type StationWallLine } from './WallOpenings';

const HALF_THICKNESS = STATION33_WALL_THICKNESS / 2;
const { gallery, hall, galleryHeight, hallHeight } = SUBESTACION;
/** Green oil-paint wainscot of a Soviet technical room. */
const DADO_HEIGHT = 1.4;
/** Steel I-beams across the hall, under its slab. */
const BEAM_SPACING = 2.4;
const BEAM_DEPTH = 0.3;

/** Walls of the gallery (its two sides) and of the hall, whose south wall opens onto the gallery. */
export function subestacionWalls(): ReadonlyArray<{ readonly wall: StationWallLine; readonly height: number }> {
  const hallSouth = hall.maxZ + HALF_THICKNESS;
  const outerMinX = hall.minX - STATION33_WALL_THICKNESS;
  const outerMaxX = hall.maxX + STATION33_WALL_THICKNESS;
  const outerMinZ = hall.minZ - STATION33_WALL_THICKNESS;
  const outerMaxZ = hall.maxZ + STATION33_WALL_THICKNESS;
  const galleryOpening: WallOpening = {
    center: (gallery.minX + gallery.maxX) / 2,
    width: gallery.maxX - gallery.minX,
    bottom: 0,
    top: galleryHeight,
  };
  return [
    { wall: line('z', gallery.minX - HALF_THICKNESS, gallery.minZ, gallery.maxZ, 1), height: galleryHeight },
    { wall: line('z', gallery.maxX + HALF_THICKNESS, gallery.minZ, gallery.maxZ, -1), height: galleryHeight },
    { wall: line('x', hallSouth, outerMinX, outerMaxX, -1, [galleryOpening]), height: hallHeight },
    { wall: line('x', hall.minZ - HALF_THICKNESS, outerMinX, outerMaxX, 1), height: hallHeight },
    { wall: line('z', hall.minX - HALF_THICKNESS, outerMinZ, outerMaxZ, 1), height: hallHeight },
    { wall: line('z', hall.maxX + HALF_THICKNESS, outerMinZ, outerMaxZ, -1), height: hallHeight },
  ];
}

/**
 * Chequered ceramic-tile floors, flat slabs, plaster walls over a green
 * wainscot, the I-beams across the hall and the cable trays and pipes that
 * feed the machines.
 */
export function buildSubestacionShell(context: Station33BuildContext): void {
  const { structure, materials } = context;
  const slab = (name: string, minX: number, maxX: number, minZ: number, maxZ: number, y: number, material: THREE.Material, seed: number): void => {
    structure.addBox((minX + maxX) / 2, y, (minZ + maxZ) / 2, maxX - minX, 0.16, maxZ - minZ, material, {
      name, surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: seed, blocksPlayer: false,
    });
  };
  // Slabs meet edge to edge: the gallery floor starts on the back of the
  // sheds' north wall and ends where the hall's begins.
  const galleryMinX = gallery.minX - STATION33_WALL_THICKNESS;
  const galleryMaxX = gallery.maxX + STATION33_WALL_THICKNESS;
  const hallMinX = hall.minX - STATION33_WALL_THICKNESS;
  const hallMaxX = hall.maxX + STATION33_WALL_THICKNESS;
  const hallMinZ = hall.minZ - STATION33_WALL_THICKNESS;
  slab('subestacion-gallery-floor', galleryMinX, galleryMaxX, gallery.minZ, gallery.maxZ, -0.08, materials.machineRoomFloor, 81);
  slab('subestacion-hall-floor', hallMinX, hallMaxX, hallMinZ, gallery.minZ, -0.08, materials.machineRoomFloor, 83);
  slab('subestacion-gallery-ceiling', galleryMinX, galleryMaxX, gallery.minZ, gallery.maxZ, galleryHeight + 0.08, materials.serviceConcrete, 85);
  slab('subestacion-hall-ceiling', hallMinX, hallMaxX, hallMinZ, gallery.minZ, hallHeight + 0.08, materials.serviceConcrete, 87);

  let seed = 90;
  for (const { wall, height } of subestacionWalls()) {
    structure.addWallWithOpenings(
      wall.axis, wall.fixed, wall.min, wall.max, 0, height, STATION33_WALL_THICKNESS,
      wall.openings, materials.vaultPlaster,
      { surface: 'concrete', mapRole: 'wall', castShadow: !context.profile.useReducedEffects, uvSeed: seed, blocksPlayer: true },
    );
    seed += 5;
    addDado(context, wall);
  }
  addBeams(context);
  addCableTrays(context);
  addPipes(context);
}

/** Wainscot and its dark stripe on every solid stretch of the room side. */
function addDado(context: Station33BuildContext, wall: StationWallLine): void {
  const { batch, materials } = context;
  const face = wall.fixed + wall.inward * (HALF_THICKNESS + 0.015);
  const room = wall.axis === 'z'
    ? { min: Math.max(wall.min, hall.minZ), max: Math.min(wall.max, gallery.maxZ) }
    : { min: Math.max(wall.min, hall.minX), max: Math.min(wall.max, hall.maxX) };
  for (const [from, to] of wallSpans(room.min, room.max, wall.openings)) {
    const along = (from + to) / 2;
    const length = to - from;
    if (wall.axis === 'z') {
      batch.addBox(materials.paintedSteel, face, DADO_HEIGHT / 2, along, 0.03, DADO_HEIGHT, length, 0, 0, 0, along);
      batch.addBox(materials.rubber, face, DADO_HEIGHT + 0.025, along, 0.035, 0.05, length);
    } else {
      batch.addBox(materials.paintedSteel, along, DADO_HEIGHT / 2, face, length, DADO_HEIGHT, 0.03, 0, 0, 0, along);
      batch.addBox(materials.rubber, along, DADO_HEIGHT + 0.025, face, length, 0.05, 0.035);
    }
  }
}

/** Riveted I-beams spanning the hall from wall to wall: web and two flanges each. */
function addBeams(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const span = hall.maxX - hall.minX;
  const centerX = (hall.minX + hall.maxX) / 2;
  for (let z = hall.maxZ - 1.2; z > hall.minZ + 0.5; z -= BEAM_SPACING) {
    const top = hallHeight - 0.02;
    batch.addBox(materials.greySteel, centerX, top - BEAM_DEPTH / 2, z, span, BEAM_DEPTH - 0.06, 0.03);
    for (const y of [top - 0.015, top - BEAM_DEPTH + 0.015]) batch.addBox(materials.greySteel, centerX, y, z, span, 0.03, 0.2);
  }
}

/** Ladder trays along both long walls, loaded with heavy feeder cables. */
function addCableTrays(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const y = hallHeight - 0.7;
  const length = hall.maxZ - hall.minZ;
  const centerZ = (hall.minZ + hall.maxZ) / 2;
  for (const [face, inward] of [[hall.minX, 1], [hall.maxX, -1]] as const) {
    batch.addBox(materials.greySteel, face + inward * 0.25, y, centerZ, 0.4, 0.03, length);
    for (let cable = 0; cable < 5; cable++) {
      const geometry = new THREE.CylinderGeometry(0.035, 0.035, length, 6).rotateX(Math.PI / 2);
      geometry.translate(face + inward * (0.1 + cable * 0.075), y + 0.05, centerZ);
      batch.add(geometry, materials.rubber);
    }
  }
}

/** Cooling-water mains along the north wall and down the gallery, flanged every few metres. */
function addPipes(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const north = hall.minZ + 0.25;
  const pipe = new THREE.CylinderGeometry(0.1, 0.1, hall.maxX - hall.minX, 12).rotateZ(Math.PI / 2);
  pipe.translate((hall.minX + hall.maxX) / 2, 3.4, north);
  batch.add(pipe, materials.paintedSteel);
  for (let x = hall.minX + 1; x < hall.maxX; x += 2.5) {
    const flange = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 12).rotateZ(Math.PI / 2).translate(x, 3.4, north);
    batch.add(flange, materials.greySteel);
  }
  const run = new THREE.CylinderGeometry(0.07, 0.07, gallery.maxZ - gallery.minZ, 10).rotateX(Math.PI / 2);
  run.translate(gallery.maxX - 0.2, galleryHeight - 0.35, (gallery.minZ + gallery.maxZ) / 2);
  batch.add(run, materials.greySteel);
}
