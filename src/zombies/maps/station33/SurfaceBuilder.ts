import * as THREE from 'three';
import { starGeometry } from '../../../rendering/StarGeometry';
import type { GroundRect } from '../../guardians/CaptainUssrBrain';
import { seededRandom } from '../shared/ProceduralNoise';
import { addSolidProxy } from '../shared/SolidProxy';
import { placement } from '../shared/StaticMeshBatch';
import { PROTOCOL33_SURFACE, PROTOCOL33_SURFACE_Y, PROTOCOL33_TRUCK, PROTOCOL33_YARD, STATION33_WALL_THICKNESS } from '../Station33Config';
import { addOilDrums, oilDrumsFootprint } from './OilDrums';
import { addSandbagWall, SANDBAG_WALL_DEPTH } from './Sandbags';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { buildSurfaceOutskirts, WASTELAND } from './SurfaceOutskirts';

const { yard, kiosk, fenceHeight } = PROTOCOL33_SURFACE;
const GROUND = PROTOCOL33_SURFACE_Y;
const HALF_THICKNESS = STATION33_WALL_THICKNESS / 2;
/** The yard's steel gate in the north fence, in front of the truck. */
const GATE = { minX: PROTOCOL33_TRUCK.x - 2, maxX: PROTOCOL33_TRUCK.x + 2 } as const;
/** How far the truck's rear doors stand open, in radians from shut. */
const DOOR_OPEN_ANGLE = 1.75;
/** Size of a road block. */
const ROAD_BLOCK = { length: 2.4, width: 0.6, height: 0.6 } as const;
/** Truck tyres stacked flat by the fence, and their size. */
const TYRE = { radius: 0.5, width: 0.32, stack: 3 } as const;

/**
 * The abandoned surface over Station 33: a fenced concrete yard in front of
 * the stairhead, an olive evacuation truck waiting at the shut gate with
 * its box body open, one sodium lamp, road blocks, fuel drums, the gate
 * guards' sandbag nest and fire barrel, and a wasteland running off into
 * the fog towards dead tower blocks (`buildSurfaceOutskirts`). The yard's
 * ground, fence, truck and props are solids on floor 1; everything beyond
 * the fence is batched scenery. Returns the footprints of the yard's
 * solids, which the guardian walks around.
 */
export function buildSurface(context: Station33BuildContext, lighting: Station33Lighting): GroundRect[] {
  const solids: GroundRect[] = [];
  buildGround(context);
  buildFence(context);
  solids.push(...buildTruck(context, lighting));
  solids.push(...buildYardProps(context, lighting));
  buildYardWear(context);
  buildSurfaceOutskirts(context, lighting);
  return solids;
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
 * Precast concrete fence on the four sides, posts every two metres, a
 * diamond relief on each panel's inner face and barbed wire on top (with
 * a concertina coil where the device can afford it); the steel gate in
 * the north side stays shut under its red star. The south side runs into
 * the kiosk. Long sides are split under the zombies' 20 m obstacle limit.
 */
function buildFence(context: Station33BuildContext): void {
  const { structure, materials, batch } = context;
  const top = GROUND + fenceHeight;
  const west = yard.minX - HALF_THICKNESS;
  const east = yard.maxX + HALF_THICKNESS;
  const north = yard.minZ - HALF_THICKNESS;
  const south = yard.maxZ + HALF_THICKNESS;
  const middleZ = (yard.minZ + yard.maxZ) / 2;
  /** `inward`: the side of the run facing into the yard (+1 towards +x or +z). */
  const runs: ReadonlyArray<{ readonly axis: 'x' | 'z'; readonly fixed: number; readonly from: number; readonly to: number; readonly inward: number }> = [
    { axis: 'z', fixed: west, from: north - HALF_THICKNESS, to: middleZ, inward: 1 },
    { axis: 'z', fixed: west, from: middleZ, to: south + HALF_THICKNESS, inward: 1 },
    { axis: 'z', fixed: east, from: north - HALF_THICKNESS, to: middleZ, inward: -1 },
    { axis: 'z', fixed: east, from: middleZ, to: south + HALF_THICKNESS, inward: -1 },
    { axis: 'x', fixed: north, from: west - HALF_THICKNESS, to: GATE.minX, inward: 1 },
    { axis: 'x', fixed: north, from: GATE.maxX, to: east + HALF_THICKNESS, inward: 1 },
    { axis: 'x', fixed: south, from: west - HALF_THICKNESS, to: kiosk.minX, inward: -1 },
    { axis: 'x', fixed: south, from: kiosk.maxX, to: east + HALF_THICKNESS, inward: -1 },
  ];
  const coils = !context.profile.useReducedEffects;
  runs.forEach((run, index) => {
    const along = (run.from + run.to) / 2;
    const length = run.to - run.from;
    const [x, z, width, depth] = run.axis === 'x'
      ? [along, run.fixed, length, STATION33_WALL_THICKNESS]
      : [run.fixed, along, STATION33_WALL_THICKNESS, length];
    structure.addBox(x, GROUND + fenceHeight / 2, z, width, fenceHeight, depth, materials.serviceConcrete, {
      name: 'surface-fence', surface: 'concrete', mapRole: 'wall', blocksPlayer: true, castShadow: false, uvSeed: 362 + index,
    });
    const at = (s: number, out: number): readonly [number, number] => (run.axis === 'x' ? [s, run.fixed + out] : [run.fixed + out, s]);
    for (let post = run.from; post <= run.to + 1e-6; post += 2) {
      const [px, pz] = at(post, 0);
      batch.addBox(materials.serviceConcrete, px, GROUND + fenceHeight / 2 + 0.05, pz, 0.36, fenceHeight + 0.1, 0.36);
      // Steel brackets on each post carry the wire and its coil.
      batch.addBox(materials.greySteel, px, top + 0.2, pz, 0.05, 0.42, 0.05);
    }
    // The fence's diamond relief, one per two-metre panel, on the yard side.
    const face = run.inward * (HALF_THICKNESS + 0.02);
    for (let panel = run.from + 1; panel < run.to - 0.5; panel += 2) {
      const [rx, rz] = at(panel, face);
      const yaw = run.axis === 'x' ? 0 : Math.PI / 2;
      batch.add(new THREE.BoxGeometry(0.62, 0.62, 0.05).rotateZ(Math.PI / 4).rotateY(yaw), materials.serviceConcrete, placement(rx, GROUND + 1.35, rz, 0, 0, 0));
      const [bx, bz] = at(panel, face * 0.95);
      batch.addBox(materials.serviceConcrete, bx, GROUND + 0.55, bz, run.axis === 'x' ? 1.6 : 0.04, 0.08, run.axis === 'x' ? 0.04 : 1.6);
    }
    for (const y of [top + 0.12, top + 0.28]) {
      const wire = new THREE.CylinderGeometry(0.008, 0.008, length, 4).rotateZ(Math.PI / 2);
      if (run.axis === 'z') wire.rotateY(Math.PI / 2);
      batch.add(wire.translate(x, y, z), materials.greySteel);
    }
    if (!coils) return;
    for (let loop = run.from + 0.25; loop < run.to; loop += 0.55) {
      const [cx, cz] = at(loop, 0);
      const coil = new THREE.TorusGeometry(0.2, 0.007, 3, 8).rotateY(run.axis === 'x' ? Math.PI / 2 + 0.25 : 0.25);
      batch.add(coil.translate(cx, top + 0.38, cz), materials.railSteel);
    }
  });
  // The shut gate: two steel leaves between posts, a solid like the fence.
  const width = GATE.maxX - GATE.minX;
  const gateX = (GATE.minX + GATE.maxX) / 2;
  structure.addBox(gateX, GROUND + 1.35, north, width, 2.7, 0.12, materials.paintedSteel, {
    name: 'surface-gate', surface: 'metal', mapRole: 'wall', blocksPlayer: true, castShadow: false, uvSeed: 370,
  });
  batch.addBox(materials.greySteel, gateX, GROUND + 1.35, north + 0.07, 0.06, 2.6, 0.03);
  for (const x of [GATE.minX, GATE.maxX]) batch.addBox(materials.greySteel, x, GROUND + 1.5, north, 0.3, 3.0, 0.3);
  // Frame rails across both leaves, and a red star on each.
  for (const y of [0.35, 1.35, 2.5]) batch.addBox(materials.greySteel, gateX, GROUND + y, north + 0.075, width - 0.1, 0.08, 0.03);
  for (const side of [-1, 1]) {
    const star = starGeometry(0.42, 0.17, 0.03).translate(gateX + side * width / 4, GROUND + 1.85, north + 0.09);
    batch.add(star, materials.redEnamel);
  }
}

/**
 * An olive 6x6 army truck with a box body (kung), nose to the gate: bonnet
 * and cab, six wheels under mudguards, fuel tank and spare wheel, the
 * body's rear doors swung open on its dark inside with a ladder down, and
 * a battery beacon on the cab roof. Proxies make it solid; their
 * footprints are returned.
 */
function buildTruck(context: Station33BuildContext, lighting: Station33Lighting): GroundRect[] {
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
  // Mudguards over the rear bogie.
  for (const side of [-1, 1]) part(materials.paintedSteel, (axles[1] + axles[2]) / 2, 1.2, 0.48, 0.06, 2.6, side);
  part(materials.greySteel, length / 2, 0.82, 1.3, 0.2, length - 0.3);
  // Bonnet, grille, bumper, front wings and dead headlights.
  part(materials.paintedSteel, 0.6, 1.4, 2.0, 0.85, 1.2);
  part(materials.greySteel, 0.01, 1.35, 1.2, 0.6, 0.04);
  for (let slat = -2; slat <= 2; slat++) part(materials.rubber, -0.01, 1.35, 0.06, 0.52, 0.02, slat * 0.2);
  part(materials.greySteel, -0.08, 0.95, width - 0.1, 0.2, 0.16);
  for (const side of [-1, 1]) {
    const lamp = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12).rotateX(Math.PI / 2);
    batch.add(lamp.translate(x + side * 0.85, GROUND + 1.55, frontZ - 0.02), materials.windowGlass);
    part(materials.paintedSteel, axles[0], 1.1, 0.5, 0.12, 1.3, side);
    // Mirror arms out of the cab.
    part(materials.greySteel, cabOffset - 0.45, 2.1, 0.32, 0.03, 0.03, side * (width / 2 + 0.12));
    part(materials.rubber, cabOffset - 0.45, 2.1, 0.03, 0.26, 0.16, side * (width / 2 + 0.28));
  }
  // Cab with its windscreen, side windows and the battery beacon on the roof.
  const cabTop = 2.525;
  part(materials.paintedSteel, cabOffset, (0.975 + cabTop) / 2, width - 0.1, cabTop - 0.975, 1.1);
  part(materials.windowGlass, cabOffset - 0.56, 2.05, width - 0.4, 0.6, 0.03);
  for (const side of [-1, 1]) part(materials.windowGlass, cabOffset, 2.05, 0.03, 0.55, 0.7, side * (width / 2 - 0.04));
  const beacon = new THREE.CylinderGeometry(0.12, 0.14, 0.2, 12).translate(x, GROUND + cabTop + 0.1, frontZ + cabOffset);
  batch.add(beacon, lighting.circuitMaterial('emergency'));
  // Fuel tank under the body's west side, the spare wheel on its east flank.
  const tank = new THREE.CylinderGeometry(0.26, 0.26, 1.1, 14).rotateX(Math.PI / 2);
  batch.add(tank.translate(x - width / 2 + 0.2, GROUND + 0.75, frontZ + 3.1), materials.greySteel);
  const spare = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.36, 18).rotateZ(Math.PI / 2);
  batch.add(spare.translate(x + width / 2 + 0.2, GROUND + 1.85, frontZ + 3.4), materials.rubber);
  // The box body, open at the back on its dark inside, its doors swung out and a ladder down.
  const bodyFront = cabOffset + 0.65;
  const bodyBottom = 1.0;
  const bodyCenterY = GROUND + (bodyBottom + height) / 2;
  part(materials.paintedSteel, (bodyFront + length) / 2 - 0.05, (bodyBottom + height) / 2, width, height - bodyBottom, length - bodyFront - 0.1);
  // Ribs along the body and a red cross panel on each flank: the medical kung of the evacuation.
  for (let rib = bodyFront + 0.5; rib < length - 0.3; rib += 0.9) {
    part(materials.greySteel, rib, (bodyBottom + height) / 2, width + 0.04, height - bodyBottom - 0.1, 0.05);
  }
  for (const side of [-1, 1]) {
    const flank = side * (width / 2 + 0.03);
    part(materials.stucco, (bodyFront + length) / 2, 2.15, 0.02, 0.9, 0.9, flank);
    part(materials.redEnamel, (bodyFront + length) / 2, 2.15, 0.03, 0.62, 0.2, flank);
    part(materials.redEnamel, (bodyFront + length) / 2, 2.15, 0.03, 0.2, 0.62, flank);
  }
  batch.addBox(materials.rubber, x, bodyCenterY, rearZ - 0.06, width - 0.16, height - bodyBottom - 0.16, 0.02);
  const leafLength = width / 2 - 0.04;
  const solids: GroundRect[] = [];
  for (const side of [-1, 1]) {
    // Hinged on the rear corner; closed it would reach the middle, open it swings out and back.
    const hingeX = x + side * (width / 2);
    const leaf = new THREE.BoxGeometry(leafLength, height - bodyBottom - 0.1, 0.05)
      .translate(-side * leafLength / 2, 0, 0).rotateY(side * DOOR_OPEN_ANGLE).translate(hingeX, bodyCenterY, rearZ + 0.02);
    batch.add(leaf, materials.paintedSteel);
    const reachX = hingeX - side * Math.cos(DOOR_OPEN_ANGLE) * leafLength;
    const door = solid(context, 'surface-truck-door', 'metal',
      { minX: Math.min(hingeX, reachX) - 0.05, maxX: Math.max(hingeX, reachX) + 0.05, minZ: rearZ, maxZ: rearZ + Math.sin(DOOR_OPEN_ANGLE) * leafLength + 0.05 },
      GROUND + bodyBottom, GROUND + height - 0.1);
    solids.push(door);
  }
  for (const side of [-0.3, 0.3]) part(materials.greySteel, length + 0.22, 0.55, 0.04, 1.0, 0.04, side);
  for (const rung of [0.3, 0.6, 0.9]) part(materials.greySteel, length + 0.4 - rung * 0.36, rung, 0.6, 0.03, 0.05);
  solids.push(solid(context, 'surface-truck', 'metal', { minX: x - width / 2, maxX: x + width / 2, minZ: frontZ - 0.2, maxZ: rearZ + 0.1 }, GROUND, GROUND + height));
  return solids;
}

/**
 * The sodium lamp on its pole, the road blocks, the fuel drums, the gate
 * guards' sandbag nest with its fire barrel, and a stack of tyres. Returns
 * their footprints.
 */
function buildYardProps(context: Station33BuildContext, lighting: Station33Lighting): GroundRect[] {
  const { batch, materials } = context;
  const { lampPost, roadBlocks, drumHuddles, sandbagNest, fireBarrel, tyres } = PROTOCOL33_YARD;
  const solids: GroundRect[] = [];
  const { x, z, height } = lampPost;
  batch.addBox(materials.serviceConcrete, x, GROUND + height / 2, z, 0.22, height, 0.22);
  batch.addBox(materials.serviceConcrete, x + 0.5, GROUND + height - 0.1, z, 1.1, 0.1, 0.12);
  batch.addBox(materials.greySteel, x + 1.0, GROUND + height - 0.22, z, 0.5, 0.14, 0.26);
  batch.addBox(lighting.circuitMaterial('amber'), x + 1.0, GROUND + height - 0.31, z, 0.4, 0.04, 0.18);
  solids.push(solid(context, 'surface-lamp-post', 'concrete', { minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15 }, GROUND, GROUND + height));
  roadBlocks.forEach(({ x: bx, z: bz, yaw }, index) => {
    // Turned blocks stay solid through an axis-aligned box around them.
    batch.addBox(materials.serviceConcrete, bx, GROUND + ROAD_BLOCK.height / 2, bz, ROAD_BLOCK.length, ROAD_BLOCK.height, ROAD_BLOCK.width, 0, yaw, 0, 371 + index);
    batch.addBox(materials.hazardPaint, bx, GROUND + ROAD_BLOCK.height - 0.12, bz, ROAD_BLOCK.length + 0.01, 0.12, ROAD_BLOCK.width + 0.01, 0, yaw, 0);
    const halfX = Math.abs(Math.cos(yaw)) * ROAD_BLOCK.length / 2 + Math.abs(Math.sin(yaw)) * ROAD_BLOCK.width / 2;
    const halfZ = Math.abs(Math.sin(yaw)) * ROAD_BLOCK.length / 2 + Math.abs(Math.cos(yaw)) * ROAD_BLOCK.width / 2;
    solids.push(solid(context, 'surface-road-block', 'concrete', { minX: bx - halfX, maxX: bx + halfX, minZ: bz - halfZ, maxZ: bz + halfZ }, GROUND, GROUND + ROAD_BLOCK.height));
  });
  drumHuddles.forEach((drums, index) => {
    addOilDrums(context, `surface-drums-${index}`, drums, GROUND);
    solids.push(oilDrumsFootprint(drums));
  });
  addSandbagWall(context, { ...sandbagNest, y: GROUND }, 3631, 'surface-sandbags');
  solids.push({
    minX: sandbagNest.x - sandbagNest.length / 2, maxX: sandbagNest.x + sandbagNest.length / 2,
    minZ: sandbagNest.z - SANDBAG_WALL_DEPTH / 2, maxZ: sandbagNest.z + SANDBAG_WALL_DEPTH / 2,
  });
  solids.push(buildFireBarrel(context, lighting, fireBarrel.x, fireBarrel.z));
  for (let level = 0; level < TYRE.stack; level++) {
    const tyre = new THREE.TorusGeometry(TYRE.radius - TYRE.width / 2, TYRE.width / 2, 6, 16).rotateX(Math.PI / 2);
    batch.add(tyre, materials.rubber, placement(tyres.x + level * 0.05, GROUND + TYRE.width / 2 + level * TYRE.width * 0.9, tyres.z - level * 0.04, 0, level * 0.4, 0));
  }
  const leaning = new THREE.TorusGeometry(TYRE.radius - TYRE.width / 2, TYRE.width / 2, 6, 16);
  batch.add(leaning, materials.rubber, placement(tyres.x - 0.75, GROUND + TYRE.radius - 0.02, tyres.z + 0.25, 0.25, Math.PI / 2 - 0.3, 0));
  solids.push(solid(context, 'surface-tyres', 'wood',
    { minX: tyres.x - 1.15, maxX: tyres.x + TYRE.radius + 0.15, minZ: tyres.z - TYRE.radius - 0.1, maxZ: tyres.z + TYRE.radius + 0.1 }, GROUND, GROUND + TYRE.stack * TYRE.width));
  return solids;
}

/** A rusted drum with its top cut open on a bed of embers, ash heaped around its foot. */
function buildFireBarrel(context: Station33BuildContext, lighting: Station33Lighting, x: number, z: number): GroundRect {
  const { batch, materials } = context;
  const radius = 0.3;
  const height = 0.88;
  batch.add(new THREE.CylinderGeometry(radius, radius * 0.96, height, 16, 1, true), materials.railSteel, placement(x, GROUND + height / 2, z, 0, 0, 0));
  for (let hole = 0; hole < 6; hole++) {
    const angle = (hole / 6) * Math.PI * 2;
    batch.addBox(lighting.circuitMaterial('amber'), x + Math.cos(angle) * (radius + 0.003), GROUND + 0.22, z + Math.sin(angle) * (radius + 0.003), 0.06, 0.05, 0.06, 0, -angle, 0);
  }
  const embers = new THREE.CircleGeometry(radius - 0.02, 16).rotateX(-Math.PI / 2);
  batch.add(embers.translate(x, GROUND + height - 0.12, z), lighting.circuitMaterial('amber'));
  const ash = new THREE.CylinderGeometry(radius + 0.25, radius + 0.4, 0.04, 16);
  batch.add(ash.translate(x, GROUND + 0.02, z), materials.rubble);
  return solid(context, 'surface-fire-barrel', 'metal', { minX: x - radius - 0.05, maxX: x + radius + 0.05, minZ: z - radius - 0.05, maxZ: z + radius + 0.05 }, GROUND, GROUND + height);
}

/**
 * What years of neglect left on the yard, all flat and walkable: rain
 * puddles, oil and blood stains, tyre tracks to the gate, rubble and
 * leaflets from the evacuation, and weeds through the cracks.
 */
function buildYardWear(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const random = seededRandom(3637);
  const flat = (material: THREE.Material, x: number, z: number, width: number, depth: number, lift: number, yaw: number): void => {
    batch.add(new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2).rotateY(yaw).translate(x, GROUND + lift, z), material);
  };
  const puddles: ReadonlyArray<readonly [number, number, number, number]> = [
    [12.5, -88.5, 2.4, 1.6], [17.0, -84.0, 1.4, 1.0], [7.5, -91.0, 1.8, 1.2], [22.5, -86.5, 1.2, 0.9], [15.5, -97.5, 2.0, 1.1],
  ];
  puddles.forEach(([x, z, w, d], index) => flat(materials.puddle, x, z, w, d, 0.006, index * 1.3));
  flat(materials.floorGrime, PROTOCOL33_TRUCK.x, PROTOCOL33_TRUCK.z + 0.6, 2.2, 3.0, 0.004, 0.1);
  flat(materials.bloodSmear, 13.8, -82.4, 1.4, 0.8, 0.007, 0.7);
  flat(materials.bloodSplatter, 19.1, -84.6, 1.0, 1.0, 0.007, 2.1);
  flat(materials.bloodSplatter, 8.2, -96.8, 1.2, 1.1, 0.007, 0.4);
  // Tyre tracks from the gate to the stairhead, two ruts per pass.
  for (const offset of [-0.95, 0.95]) {
    flat(materials.floorGrime, PROTOCOL33_TRUCK.x + offset, -98.5, 0.42, 3.0, 0.003, 0);
    flat(materials.floorGrime, 16.5 + offset * 0.8, -82.5, 0.42, 5.0, 0.003, 0.35);
  }
  for (let index = 0; index < 26; index++) {
    const x = yard.minX + 0.6 + random() * (yard.maxX - yard.minX - 1.2);
    const z = yard.minZ + 0.6 + random() * (yard.maxZ - yard.minZ - 1.2);
    const size = 0.08 + random() * 0.16;
    batch.addBox(materials.rubble, x, GROUND + size * 0.25, z, size, size * 0.5, size * 1.2, random(), random() * Math.PI, 0);
  }
  for (let index = 0; index < 18; index++) {
    const x = yard.minX + 1 + random() * (yard.maxX - yard.minX - 2);
    const z = yard.minZ + 1 + random() * (yard.maxZ - yard.minZ - 2);
    flat(materials.paper, x, z, 0.21, 0.3, 0.008 + index * 0.0002, random() * Math.PI);
  }
  // Dry weeds along the foot of the fence.
  for (let index = 0; index < 40; index++) {
    const side = index % 4;
    const along = random();
    const x = side < 2 ? yard.minX + along * (yard.maxX - yard.minX) : side === 2 ? yard.minX + 0.15 : yard.maxX - 0.15;
    const z = side === 0 ? yard.minZ + 0.15 : side === 1 ? yard.maxZ - 0.15 : yard.minZ + along * (yard.maxZ - yard.minZ);
    if (side === 1 && x > kiosk.minX - 0.5 && x < kiosk.maxX + 0.5) continue;
    const blade = new THREE.ConeGeometry(0.05 + random() * 0.05, 0.3 + random() * 0.4, 4);
    batch.add(blade, materials.burlap, placement(x, GROUND + 0.2, z, (random() - 0.5) * 0.5, random() * Math.PI, (random() - 0.5) * 0.5));
  }
}

/** A solid proxy over `rect`, from `bottom` to `top`; returns its footprint. */
function solid(context: Station33BuildContext, name: string, surface: 'metal' | 'concrete' | 'wood', rect: GroundRect, bottom: number, top: number): GroundRect {
  addSolidProxy(context, name, { x: rect.minX, y: bottom, z: rect.minZ }, { x: rect.maxX, y: top, z: rect.maxZ }, surface, 'none');
  return rect;
}
