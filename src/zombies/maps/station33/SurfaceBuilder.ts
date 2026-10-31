import * as THREE from 'three';
import { addSolidProxy } from '../shared/SolidProxy';
import { PROTOCOL33_SURFACE, PROTOCOL33_SURFACE_Y, PROTOCOL33_TRUCK, STATION33_WALL_THICKNESS } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

const { yard, kiosk, fenceHeight } = PROTOCOL33_SURFACE;
const GROUND = PROTOCOL33_SURFACE_Y;
const HALF_THICKNESS = STATION33_WALL_THICKNESS / 2;
/** The yard's steel gate in the north fence, in front of the truck. */
const GATE = { minX: PROTOCOL33_TRUCK.x - 2, maxX: PROTOCOL33_TRUCK.x + 2 } as const;
/** How far the dead wasteland runs before the fog swallows it. */
const WASTELAND = { minX: -90, maxX: 120, minZ: -210, maxZ: -30 } as const;
/** The sodium lamp's concrete pole in the yard's south-west corner. */
const LAMP_POST = { x: 5.2, z: -94.5, height: 5.6 } as const;
/** How far the truck's rear doors stand open, in radians from shut. */
const DOOR_OPEN_ANGLE = 1.75;

/**
 * Panel blocks and a mast of the dead city around the station: plain
 * concrete masses with balcony bands, far enough for the surface fog to
 * leave silhouettes only. Visual only, beyond the fence.
 */
const CITY_BLOCKS: ReadonlyArray<{ readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number; readonly height: number }> = [
  { minX: -30, maxX: -8, minZ: -135, maxZ: -123, height: 33 },
  { minX: 48, maxX: 60, minZ: -130, maxZ: -90, height: 45 },
  { minX: 5, maxX: 55, minZ: -168, maxZ: -155, height: 27 },
  { minX: -46, maxX: -34, minZ: -96, maxZ: -60, height: 36 },
  { minX: 62, maxX: 74, minZ: -72, maxZ: -46, height: 24 },
];
const MAST = { x: 86, z: -150, size: 2.2, height: 64 } as const;

/**
 * The abandoned surface over Station 33: a fenced concrete yard in front of
 * the stairhead, an olive evacuation truck waiting at the shut gate with
 * its box body open, one sodium lamp, a few road blocks, and a wasteland
 * running off into the fog towards dead tower blocks. The yard's ground,
 * fence, truck and blocks are solids on floor 1; everything beyond the
 * fence is batched scenery.
 */
export function buildSurface(context: Station33BuildContext, lighting: Station33Lighting): void {
  buildGround(context);
  buildFence(context);
  buildTruck(context, lighting);
  buildYardProps(context, lighting);
  buildCity(context, lighting);
}

function buildGround(context: Station33BuildContext): void {
  const { structure, batch, materials } = context;
  const minX = yard.minX - STATION33_WALL_THICKNESS;
  const maxX = yard.maxX + STATION33_WALL_THICKNESS;
  const minZ = yard.minZ - STATION33_WALL_THICKNESS;
  // It runs under the fence and into the stairhead's doorway as its landing.
  const maxZ = yard.maxZ + STATION33_WALL_THICKNESS;
  structure.addBox((minX + maxX) / 2, GROUND - 0.08, (minZ + maxZ) / 2, maxX - minX, 0.16, maxZ - minZ, materials.depotFloor, {
    name: 'surface-yard', surface: 'concrete', mapRole: 'slab', blocksPlayer: false, castShadow: false, uvSeed: 360,
  });
  // Wasteland around the yard, leaving the kiosk's footprint open over the flight.
  const pieces: ReadonlyArray<readonly [number, number, number, number]> = [
    [WASTELAND.minX, WASTELAND.maxX, WASTELAND.minZ, minZ],
    [WASTELAND.minX, minX, minZ, WASTELAND.maxZ],
    [maxX, WASTELAND.maxX, minZ, WASTELAND.maxZ],
    [minX, kiosk.minX, maxZ, WASTELAND.maxZ],
    [kiosk.maxX, maxX, maxZ, WASTELAND.maxZ],
    [kiosk.minX, kiosk.maxX, kiosk.maxZ, WASTELAND.maxZ],
  ];
  for (const [x0, x1, z0, z1] of pieces) {
    batch.addBox(materials.trackBed, (x0 + x1) / 2, GROUND - 0.06, (z0 + z1) / 2, x1 - x0, 0.12, z1 - z0, 0, 0, 0, 361);
  }
}

/**
 * Precast concrete fence on the four sides, posts every two metres and
 * barbed wire on top; the steel gate in the north side stays shut. The
 * south side runs into the kiosk. Long sides are split under the zombies'
 * 20 m obstacle limit.
 */
function buildFence(context: Station33BuildContext): void {
  const { structure, materials, batch } = context;
  const top = GROUND + fenceHeight;
  const west = yard.minX - HALF_THICKNESS;
  const east = yard.maxX + HALF_THICKNESS;
  const north = yard.minZ - HALF_THICKNESS;
  const south = yard.maxZ + HALF_THICKNESS;
  const middleZ = (yard.minZ + yard.maxZ) / 2;
  const runs: ReadonlyArray<{ readonly axis: 'x' | 'z'; readonly fixed: number; readonly from: number; readonly to: number }> = [
    { axis: 'z', fixed: west, from: north - HALF_THICKNESS, to: middleZ },
    { axis: 'z', fixed: west, from: middleZ, to: south + HALF_THICKNESS },
    { axis: 'z', fixed: east, from: north - HALF_THICKNESS, to: middleZ },
    { axis: 'z', fixed: east, from: middleZ, to: south + HALF_THICKNESS },
    { axis: 'x', fixed: north, from: west - HALF_THICKNESS, to: GATE.minX },
    { axis: 'x', fixed: north, from: GATE.maxX, to: east + HALF_THICKNESS },
    { axis: 'x', fixed: south, from: west - HALF_THICKNESS, to: kiosk.minX },
    { axis: 'x', fixed: south, from: kiosk.maxX, to: east + HALF_THICKNESS },
  ];
  runs.forEach((run, index) => {
    const along = (run.from + run.to) / 2;
    const length = run.to - run.from;
    const [x, z, width, depth] = run.axis === 'x'
      ? [along, run.fixed, length, STATION33_WALL_THICKNESS]
      : [run.fixed, along, STATION33_WALL_THICKNESS, length];
    structure.addBox(x, GROUND + fenceHeight / 2, z, width, fenceHeight, depth, materials.serviceConcrete, {
      name: 'surface-fence', surface: 'concrete', mapRole: 'wall', blocksPlayer: true, castShadow: false, uvSeed: 362 + index,
    });
    for (let post = run.from; post <= run.to + 1e-6; post += 2) {
      const [px, pz] = run.axis === 'x' ? [post, run.fixed] : [run.fixed, post];
      batch.addBox(materials.serviceConcrete, px, GROUND + fenceHeight / 2 + 0.05, pz, 0.36, fenceHeight + 0.1, 0.36);
    }
    for (const y of [top + 0.12, top + 0.28]) {
      const wire = new THREE.CylinderGeometry(0.008, 0.008, length, 4).rotateZ(Math.PI / 2);
      if (run.axis === 'z') wire.rotateY(Math.PI / 2);
      batch.add(wire.translate(x, y, z), materials.greySteel);
    }
  });
  // The shut gate: two steel leaves between posts, a solid like the fence.
  const width = GATE.maxX - GATE.minX;
  structure.addBox((GATE.minX + GATE.maxX) / 2, GROUND + 1.35, north, width, 2.7, 0.12, materials.paintedSteel, {
    name: 'surface-gate', surface: 'metal', mapRole: 'wall', blocksPlayer: true, castShadow: false, uvSeed: 370,
  });
  batch.addBox(materials.greySteel, (GATE.minX + GATE.maxX) / 2, GROUND + 1.35, north + 0.07, 0.06, 2.6, 0.03);
  for (const x of [GATE.minX, GATE.maxX]) batch.addBox(materials.greySteel, x, GROUND + 1.5, north, 0.3, 3.0, 0.3);
}

/**
 * An olive 6x6 army truck with a box body (kung), nose to the gate: bonnet
 * and cab, six wheels, the body's rear doors swung open on its dark inside
 * with a ladder down, and a battery beacon on the cab roof. One proxy
 * makes it solid.
 */
function buildTruck(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  const { x, z, length, width, height, cabOffset } = PROTOCOL33_TRUCK;
  const frontZ = z - length / 2;
  const rearZ = z + length / 2;
  /** Box on the truck: `fromNose` metres behind the nose, `y` over the ground, `dx` across. */
  const part = (material: THREE.Material, fromNose: number, y: number, w: number, h: number, d: number, dx = 0): void =>
    batch.addBox(material, x + dx, GROUND + y, frontZ + fromNose, w, h, d);
  const wheelRadius = 0.55;
  const axles = [1.15, 4.95, 6.25];
  for (const fromNose of axles) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.4, 18).rotateZ(Math.PI / 2);
      batch.add(wheel.translate(x + side, GROUND + wheelRadius, frontZ + fromNose), materials.rubber);
      const hub = new THREE.CylinderGeometry(0.24, 0.24, 0.42, 10).rotateZ(Math.PI / 2);
      batch.add(hub.translate(x + side, GROUND + wheelRadius, frontZ + fromNose), materials.greySteel);
    }
  }
  part(materials.greySteel, length / 2, 0.82, 1.3, 0.2, length - 0.3);
  // Bonnet, grille, bumper, front wings and dead headlights.
  part(materials.paintedSteel, 0.6, 1.4, 2.0, 0.85, 1.2);
  part(materials.greySteel, 0.01, 1.35, 1.2, 0.6, 0.04);
  part(materials.greySteel, -0.08, 0.95, width - 0.1, 0.2, 0.16);
  for (const side of [-1, 1]) {
    const lamp = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12).rotateX(Math.PI / 2);
    batch.add(lamp.translate(x + side * 0.85, GROUND + 1.55, frontZ - 0.02), materials.windowGlass);
    part(materials.paintedSteel, axles[0], 1.1, 0.5, 0.12, 1.3, side);
  }
  // Cab with its windscreen, side windows and the battery beacon on the roof.
  const cabTop = 2.525;
  part(materials.paintedSteel, cabOffset, (0.975 + cabTop) / 2, width - 0.1, cabTop - 0.975, 1.1);
  part(materials.windowGlass, cabOffset - 0.56, 2.05, width - 0.4, 0.6, 0.03);
  for (const side of [-1, 1]) part(materials.windowGlass, cabOffset, 2.05, 0.03, 0.55, 0.7, side * (width / 2 - 0.04));
  const beacon = new THREE.CylinderGeometry(0.12, 0.14, 0.2, 12).translate(x, GROUND + cabTop + 0.1, frontZ + cabOffset);
  batch.add(beacon, lighting.circuitMaterial('emergency'));
  // The box body, open at the back on its dark inside, its doors swung out and a ladder down.
  const bodyFront = cabOffset + 0.65;
  const bodyBottom = 1.0;
  const bodyCenterY = GROUND + (bodyBottom + height) / 2;
  part(materials.paintedSteel, (bodyFront + length) / 2 - 0.05, (bodyBottom + height) / 2, width, height - bodyBottom, length - bodyFront - 0.1);
  batch.addBox(materials.rubber, x, bodyCenterY, rearZ - 0.06, width - 0.16, height - bodyBottom - 0.16, 0.02);
  const leafLength = width / 2 - 0.04;
  for (const side of [-1, 1]) {
    // Hinged on the rear corner; closed it would reach the middle, open it swings out and back.
    const hingeX = x + side * (width / 2);
    const leaf = new THREE.BoxGeometry(leafLength, height - bodyBottom - 0.1, 0.05)
      .translate(-side * leafLength / 2, 0, 0).rotateY(side * DOOR_OPEN_ANGLE).translate(hingeX, bodyCenterY, rearZ + 0.02);
    batch.add(leaf, materials.paintedSteel);
    const reachX = hingeX - side * Math.cos(DOOR_OPEN_ANGLE) * leafLength;
    addSolidProxy(context, 'surface-truck-door',
      { x: Math.min(hingeX, reachX) - 0.05, y: GROUND + bodyBottom, z: rearZ },
      { x: Math.max(hingeX, reachX) + 0.05, y: GROUND + height - 0.1, z: rearZ + Math.sin(DOOR_OPEN_ANGLE) * leafLength + 0.05 }, 'metal', 'none');
  }
  for (const side of [-0.3, 0.3]) part(materials.greySteel, length + 0.22, 0.55, 0.04, 1.0, 0.04, side);
  for (const rung of [0.3, 0.6, 0.9]) part(materials.greySteel, length + 0.4 - rung * 0.36, rung, 0.6, 0.03, 0.05);
  addSolidProxy(context, 'surface-truck',
    { x: x - width / 2, y: GROUND, z: frontZ - 0.2 }, { x: x + width / 2, y: GROUND + height, z: rearZ + 0.1 }, 'metal', 'none');
}

/** The sodium lamp on its pole and a few concrete road blocks left across the yard. */
function buildYardProps(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  const { x, z, height } = LAMP_POST;
  batch.addBox(materials.serviceConcrete, x, GROUND + height / 2, z, 0.22, height, 0.22);
  batch.addBox(materials.serviceConcrete, x + 0.5, GROUND + height - 0.1, z, 1.1, 0.1, 0.12);
  batch.addBox(materials.greySteel, x + 1.0, GROUND + height - 0.22, z, 0.5, 0.14, 0.26);
  batch.addBox(lighting.circuitMaterial('amber'), x + 1.0, GROUND + height - 0.31, z, 0.4, 0.04, 0.18);
  addSolidProxy(context, 'surface-lamp-post', { x: x - 0.15, y: GROUND, z: z - 0.15 }, { x: x + 0.15, y: GROUND + height, z: z + 0.15 }, 'concrete', 'none');
  const blocks: ReadonlyArray<readonly [number, number, number]> = [[9.5, -86.0, 0.2], [11.6, -96.2, -0.4], [24.6, -82.2, 1.1]];
  blocks.forEach(([bx, bz, yaw], index) => {
    // Turned blocks stay solid through an axis-aligned box around them.
    batch.addBox(materials.serviceConcrete, bx, GROUND + 0.3, bz, 2.4, 0.6, 0.6, 0, yaw, 0, 371 + index);
    const halfX = Math.abs(Math.cos(yaw)) * 1.2 + Math.abs(Math.sin(yaw)) * 0.3;
    const halfZ = Math.abs(Math.sin(yaw)) * 1.2 + Math.abs(Math.cos(yaw)) * 0.3;
    addSolidProxy(context, 'surface-road-block', { x: bx - halfX, y: GROUND, z: bz - halfZ }, { x: bx + halfX, y: GROUND + 0.6, z: bz + halfZ }, 'concrete', 'none');
  });
}

/** Tower blocks with balcony bands and a mast whose aviation lamp still blinks. */
function buildCity(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  CITY_BLOCKS.forEach((block, index) => {
    const x = (block.minX + block.maxX) / 2;
    const z = (block.minZ + block.maxZ) / 2;
    const width = block.maxX - block.minX;
    const depth = block.maxZ - block.minZ;
    batch.addBox(materials.serviceConcrete, x, GROUND + block.height / 2, z, width, block.height, depth, 0, 0, 0, 380 + index);
    for (let y = 3; y < block.height - 1; y += 2.8) {
      batch.addBox(materials.darkGranite, x, GROUND + y, z, width + 0.3, 0.16, depth + 0.3);
    }
  });
  batch.addBox(materials.greySteel, MAST.x, GROUND + MAST.height / 2, MAST.z, MAST.size, MAST.height, MAST.size);
  const lamp = new THREE.SphereGeometry(0.6, 10, 8).translate(MAST.x, GROUND + MAST.height + 0.5, MAST.z);
  batch.add(lamp, lighting.circuitMaterial('emergency'));
}
