import * as THREE from 'three';
import { addSolidProxy } from '../shared/SolidProxy';
import type { StaticMeshBatch } from '../shared/StaticMeshBatch';
import { KOVKA, KOVKA_CORRIDOR } from '../Station33Config';
import type { KovkaMaterials } from './KovkaMaterials';
import { KOVKA_PILASTER_DEPTH, kovkaBayLines } from './KovkaShell';
import type { Station33BuildContext } from './Station33BuildContext';

const { hall, pit } = KOVKA;
/** Rails stand just off the rim, on the deck. */
const RAIL_OFFSET = 0.06;
const RAIL = { height: 1.05, midHeight: 0.52, postSpacing: 2, post: 0.05, bar: 0.04 } as const;
/** Low enough for bullets to fly over into the pit, tall enough to stop bodies on floor 0. */
const RAIL_PROXY = { thickness: 0.12, height: 0.6 } as const;
/** Service catwalks along both side walls, over the lanes, reached by caged ladders at their north ends. */
const CATWALK = { y: 2.6, width: 1.12, southGap: 2.4, ladderDepth: 0.75 } as const;
const LADDER = { width: 0.5, rungSpacing: 0.3, cageFrom: 2.0, top: 3.6 } as const;
/** Maintenance stair down the pit's east side, from a landing behind the reactor to the pit floor. */
const PIT_STAIR = { width: 0.9, run: 0.26, landing: 0.9 } as const;
/** Service pipes along both side walls, above the catwalks. */
const WALL_PIPE_YS = [3.75, 4.02, 4.29] as const;

type Axis = 'x' | 'z';

/**
 * Steelwork of the chamber: rails all round the pit (the solids that fence
 * it off floor 0), the stair down into it, catwalks along both side walls
 * with their caged ladders, and the service pipes and duct.
 */
export function buildKovkaWalkways(context: Station33BuildContext, kovka: KovkaMaterials): void {
  addPitRails(context, kovka);
  addPitStair(context, kovka);
  for (const side of [-1, 1] as const) addCatwalk(context, kovka, side);
  addServiceRuns(context, kovka);
}

/** Posts, top and mid rails and a toe board along one straight run between `a` and `b`, at deck height `baseY`. */
function addRailing(batch: StaticMeshBatch, material: THREE.Material, axis: Axis, fixed: number, a: number, b: number, baseY: number): void {
  const from = Math.min(a, b);
  const length = Math.abs(b - a);
  const along = from + length / 2;
  const box = (at: number, y: number, size: number, height: number, thickness: number): void => {
    if (axis === 'x') batch.addBox(material, at, y, fixed, size, height, thickness);
    else batch.addBox(material, fixed, y, at, thickness, height, size);
  };
  const posts = Math.max(1, Math.ceil(length / RAIL.postSpacing));
  for (let index = 0; index <= posts; index++) box(from + (length * index) / posts, baseY + RAIL.height / 2, RAIL.post, RAIL.height, RAIL.post);
  box(along, baseY + RAIL.height, length, RAIL.bar, RAIL.bar * 1.4);
  box(along, baseY + RAIL.midHeight, length, RAIL.bar, RAIL.bar);
  box(along, baseY + 0.06, length, 0.12, 0.012);
}

/**
 * Primer-red rails round the rim on all four sides, a chain across the
 * stair's head, hazard stripes on the deck along them, and one low proxy
 * per side: bodies never cross onto the pit, bullets fly over the rails.
 */
function addPitRails(context: Station33BuildContext, kovka: KovkaMaterials): void {
  const { batch, materials } = context;
  const west = pit.minX - RAIL_OFFSET;
  const east = pit.maxX + RAIL_OFFSET;
  const north = pit.minZ - RAIL_OFFSET;
  const south = pit.maxZ + RAIL_OFFSET;
  const stairMinX = pit.maxX - PIT_STAIR.width;
  addRailing(batch, kovka.primer, 'x', south, west, east, 0);
  addRailing(batch, kovka.primer, 'x', north, west, stairMinX, 0);
  addRailing(batch, kovka.primer, 'z', west, north, south, 0);
  addRailing(batch, kovka.primer, 'z', east, north, south, 0);
  // The stair's head is closed by a sagging chain between two posts.
  for (const x of [stairMinX, east]) batch.addBox(kovka.primer, x, RAIL.height / 2, north, RAIL.post, RAIL.height, RAIL.post);
  const chain = new THREE.CatmullRomCurve3([
    new THREE.Vector3(stairMinX, 0.95, north),
    new THREE.Vector3((stairMinX + east) / 2, 0.72, north),
    new THREE.Vector3(east, 0.95, north),
  ]);
  batch.add(new THREE.TubeGeometry(chain, 8, 0.018, 4), materials.greySteel);

  const stripe = 0.15;
  const out = RAIL_PROXY.thickness + stripe / 2;
  batch.addBox(materials.hazardPaint, (west + east) / 2, 0.006, pit.maxZ + out, east - west + 2 * out, 0.012, stripe);
  batch.addBox(materials.hazardPaint, (west + east) / 2, 0.006, pit.minZ - out, east - west + 2 * out, 0.012, stripe);
  // The side stripes stop where the end stripes, which cover the corners, begin.
  const sideLength = pit.maxZ - pit.minZ + 2 * RAIL_PROXY.thickness;
  batch.addBox(materials.hazardPaint, pit.minX - out, 0.006, (pit.minZ + pit.maxZ) / 2, stripe, 0.012, sideLength);
  batch.addBox(materials.hazardPaint, pit.maxX + out, 0.006, (pit.minZ + pit.maxZ) / 2, stripe, 0.012, sideLength);

  const { thickness, height } = RAIL_PROXY;
  const sides: ReadonlyArray<readonly [string, number, number, number, number]> = [
    ['south', pit.minX - thickness, pit.maxX + thickness, pit.maxZ, pit.maxZ + thickness],
    ['north', pit.minX - thickness, pit.maxX + thickness, pit.minZ - thickness, pit.minZ],
    ['west', pit.minX - thickness, pit.minX, pit.minZ, pit.maxZ],
    ['east', pit.maxX, pit.maxX + thickness, pit.minZ, pit.maxZ],
  ];
  for (const [name, minX, maxX, minZ, maxZ] of sides) {
    addSolidProxy(context, `kovka-pit-rail-${name}`, { x: minX, y: 0, z: minZ }, { x: maxX, y: height, z: maxZ }, 'metal', 'none');
  }
}

/** A landing behind the reactor and a straight steel flight down the pit's east wall to its floor. Out of reach: visual only. */
function addPitStair(context: Station33BuildContext, kovka: KovkaMaterials): void {
  const { batch, materials } = context;
  const x = pit.maxX - PIT_STAIR.width / 2;
  const steps = Math.ceil(-pit.floorY / 0.2);
  const rise = -pit.floorY / steps;
  const topZ = pit.minZ + PIT_STAIR.landing;
  batch.addBox(materials.checkerPlate, x, -0.03, pit.minZ + PIT_STAIR.landing / 2, PIT_STAIR.width, 0.06, PIT_STAIR.landing);
  for (let step = 1; step <= steps; step++) {
    batch.addBox(materials.checkerPlate, x, -step * rise - 0.02, topZ + (step - 0.5) * PIT_STAIR.run, PIT_STAIR.width - 0.08, 0.04, PIT_STAIR.run);
  }
  const length = steps * PIT_STAIR.run;
  const slope = Math.atan2(-pit.floorY, length);
  const midZ = topZ + length / 2;
  const midY = pit.floorY / 2;
  const flight = Math.hypot(length, pit.floorY);
  for (const side of [-1, 1]) {
    batch.addBox(kovka.primer, x + side * (PIT_STAIR.width / 2 - 0.03), midY - 0.12, midZ, 0.05, 0.22, flight, slope);
  }
  // Handrail on the open side, towards the reactor.
  batch.addBox(kovka.primer, x - PIT_STAIR.width / 2, midY + 0.9, midZ, RAIL.bar, RAIL.bar, flight, slope);
}

/** One side wall's catwalk (`side` -1 west, 1 east): grating, brackets on the pilasters, an outer rail and its caged ladder. */
function addCatwalk(context: Station33BuildContext, kovka: KovkaMaterials, side: -1 | 1): void {
  const { batch, materials } = context;
  const wallX = side < 0 ? hall.minX : hall.maxX;
  const inward = -side;
  const innerX = wallX + inward * KOVKA_PILASTER_DEPTH;
  const outerX = innerX + inward * CATWALK.width;
  const centerX = (innerX + outerX) / 2;
  const minZ = hall.minZ + CATWALK.ladderDepth;
  // The east one stops short of the corridor's mouth.
  const maxZ = side > 0 ? KOVKA_CORRIDOR.minZ - CATWALK.southGap / 4 : hall.maxZ - CATWALK.southGap;
  const { y } = CATWALK;
  batch.addBox(materials.checkerPlate, centerX, y - 0.03, (minZ + maxZ) / 2, CATWALK.width, 0.06, maxZ - minZ);
  batch.addBox(kovka.primer, outerX, y - 0.1, (minZ + maxZ) / 2, 0.06, 0.14, maxZ - minZ);
  for (const z of kovkaBayLines().filter((line) => line > minZ && line < maxZ)) {
    batch.addBox(kovka.primer, centerX, y - 0.14, z, CATWALK.width, 0.1, 0.08);
    const strut = Math.hypot(CATWALK.width, 0.9);
    batch.addBox(kovka.primer, centerX, y - 0.6, z, strut, 0.06, 0.06, 0, 0, inward * Math.atan2(0.9, CATWALK.width));
  }
  addRailing(batch, kovka.primer, 'z', outerX, minZ, maxZ, y);
  addRailing(batch, kovka.primer, 'x', maxZ, innerX, outerX, y);
  addLadder(context, kovka, centerX);
}

/** Caged steel ladder against the north wall, from the deck to a catwalk's north end; a solid for bodies. */
function addLadder(context: Station33BuildContext, kovka: KovkaMaterials, x: number): void {
  const { batch } = context;
  const z = hall.minZ + 0.18;
  const half = LADDER.width / 2;
  for (const side of [-1, 1]) batch.addBox(kovka.primer, x + side * half, LADDER.top / 2, z, 0.05, LADDER.top, 0.06);
  for (let rung = LADDER.rungSpacing; rung < CATWALK.y + 0.01; rung += LADDER.rungSpacing) {
    batch.addBox(kovka.primer, x, rung, z, LADDER.width, 0.03, 0.03);
  }
  const cageZ = z + 0.38;
  for (let hoopY = LADDER.cageFrom; hoopY <= LADDER.top; hoopY += 0.8) {
    batch.addBox(kovka.primer, x, hoopY, cageZ, LADDER.width + 0.2, 0.03, 0.03);
    for (const side of [-1, 1]) batch.addBox(kovka.primer, x + side * (half + 0.1), hoopY, (z + cageZ) / 2, 0.03, 0.03, cageZ - z);
  }
  for (const offset of [-0.25, 0, 0.25]) {
    const height = LADDER.top - LADDER.cageFrom;
    batch.addBox(kovka.primer, x + offset, LADDER.cageFrom + height / 2, cageZ, 0.02, height, 0.04);
  }
  addSolidProxy(context, 'kovka-ladder', { x: x - half - 0.15, y: 0, z: hall.minZ }, { x: x + half + 0.15, y: CATWALK.y, z: cageZ + 0.05 }, 'metal', 'none');
}

/** Three pipes on brackets along each side wall over the catwalks, and a ventilation duct along the north wall. */
function addServiceRuns(context: Station33BuildContext, kovka: KovkaMaterials): void {
  const { batch, materials } = context;
  const length = hall.maxZ - hall.minZ;
  const centerZ = (hall.minZ + hall.maxZ) / 2;
  for (const [wallX, inward] of [[hall.minX, 1], [hall.maxX, -1]] as const) {
    const pipeX = wallX + inward * (KOVKA_PILASTER_DEPTH + 0.12);
    WALL_PIPE_YS.forEach((y, index) => {
      const radius = index === 0 ? 0.11 : 0.07;
      batch.add(new THREE.CylinderGeometry(radius, radius, length, 8).rotateX(Math.PI / 2).translate(pipeX, y, centerZ), index === 1 ? kovka.copper : materials.greySteel);
    });
    for (const z of kovkaBayLines()) {
      batch.addBox(materials.greySteel, wallX + inward * (KOVKA_PILASTER_DEPTH + 0.1), (WALL_PIPE_YS[0] + WALL_PIPE_YS[2]) / 2, z, 0.2, 0.75, 0.06);
    }
  }
  const ductWidth = hall.maxX - hall.minX - 1.6;
  batch.addBox(materials.greySteel, (hall.minX + hall.maxX) / 2, 4.05, hall.minZ + 0.32, ductWidth, 0.5, 0.6);
  for (let x = hall.minX + 0.8 + 2; x < hall.maxX - 0.8; x += 4) {
    batch.addBox(materials.greySteel, x, 4.05, hall.minZ + 0.32, 0.06, 0.58, 0.68);
  }
}
