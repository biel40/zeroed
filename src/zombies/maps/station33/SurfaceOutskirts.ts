import * as THREE from 'three';
import { starGeometry } from '../../../rendering/StarGeometry';
import { seededRandom } from '../shared/ProceduralNoise';
import { placement } from '../shared/StaticMeshBatch';
import { PROTOCOL33_POWER_LINE, PROTOCOL33_ROAD, PROTOCOL33_SURFACE, PROTOCOL33_SURFACE_Y } from '../Station33Config';
import { addSnowCap, addSnowDrift } from './SnowCover';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { buildSurfaceLandmarks, SURFACE_LANDMARK_CLEARINGS } from './SurfaceLandmarks';

const GROUND = PROTOCOL33_SURFACE_Y;
const { yard } = PROTOCOL33_SURFACE;
/** How far the dead wasteland runs before the fog swallows it. */
export const WASTELAND = { minX: -90, maxX: 120, minZ: -210, maxZ: -30 } as const;
/** The road out of the gate, north into the fog. */
const ROAD = { ...PROTOCOL33_ROAD, fromZ: yard.minZ - 0.3, toZ: WASTELAND.minZ } as const;
/** The guards' watchtower outside the yard's north-west corner. */
const WATCHTOWER = { x: 0.6, z: -104.2, height: 6.2, size: 2.6 } as const;
const POWER_LINE = PROTOCOL33_POWER_LINE;
/** A burnt-out saloon nosed into the verge across the road. */
const CAR_WRECK = { x: ROAD.x + ROAD.width / 2 + 2.4, z: -114, yaw: 0.45 } as const;
/** Birches stand off the fence, off the road and off the tower (and the landmarks' own clearings). */
const BIRCH_CLEARANCE = { fence: 4, road: 2 } as const;

/**
 * Panel blocks and a mast of the dead city around the station: plain
 * concrete masses with balcony bands and window rows, a handful still
 * lit by someone, far enough for the surface fog to leave silhouettes.
 * The road and its power line run north between the two blocks across it,
 * the way the escape truck leaves.
 */
const CITY_BLOCKS: ReadonlyArray<{ readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number; readonly height: number }> = [
  { minX: -30, maxX: -8, minZ: -135, maxZ: -123, height: 33 },
  { minX: 48, maxX: 60, minZ: -130, maxZ: -90, height: 45 },
  { minX: 2, maxX: 13.5, minZ: -168, maxZ: -155, height: 27 },
  { minX: 27, maxX: 55, minZ: -168, maxZ: -155, height: 27 },
  { minX: -46, maxX: -34, minZ: -96, maxZ: -60, height: 36 },
  { minX: 62, maxX: 74, minZ: -72, maxZ: -46, height: 24 },
];
const MAST = { x: 86, z: -150, size: 2.2, height: 64 } as const;
/** The road's verges are banked with ploughed snow beyond the first stretch out of the gate, where the ending films low. */
const ROAD_BANKS = { fromZ: ROAD.fromZ - 12, toZ: -175, depth: 1.4, minHeight: 0.3, maxHeight: 0.65 } as const;
/** Storey height of the panel blocks and their window size. */
const STOREY = 2.8;
const WINDOW = { width: 1.2, height: 1.3, pitch: 3.2 } as const;

/**
 * Everything beyond the yard's fence, visual only and under snow: the
 * cracked road out of the gate with its painted line and ploughed banks, a
 * guard's sentry mushroom and the watchtower with its dead searchlight,
 * power poles sagging their wires along the road, a burnt car, dead
 * birches, heaps of rubble, the town's landmarks (`buildSurfaceLandmarks`)
 * and the tower blocks and mast of the city on the horizon.
 */
export function buildSurfaceOutskirts(context: Station33BuildContext, lighting: Station33Lighting): void {
  buildRoad(context);
  buildWatchtower(context, lighting);
  buildPowerLine(context);
  buildCarWreck(context);
  buildBirches(context);
  buildRubble(context);
  buildCity(context, lighting);
  buildSurfaceLandmarks(context, lighting);
}

/**
 * Cracked asphalt with a broken centre line, slush along its edges, snowed
 * kerbs and ploughed banks beyond them, and the sentry's striped mushroom
 * by the gate.
 */
function buildRoad(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const random = seededRandom(3701);
  const length = ROAD.fromZ - ROAD.toZ;
  const centreZ = (ROAD.fromZ + ROAD.toZ) / 2;
  batch.addBox(materials.darkGranite, ROAD.x, GROUND - 0.03, centreZ, ROAD.width, 0.07, length, 0, 0, 0, 3702);
  for (const side of [-1, 1]) {
    const kerbX = ROAD.x + side * (ROAD.width / 2 + 0.12);
    batch.addBox(materials.serviceConcrete, kerbX, GROUND + 0.04, centreZ, 0.25, 0.16, length);
    addSnowCap(batch, materials.snow, kerbX, GROUND + 0.12, centreZ, 0.25, length, 0, 0.04);
    // Wheels keep the middle clear; the snow holds on along the edges.
    addSnowCap(batch, materials.snow, ROAD.x + side * (ROAD.width / 2 - 0.4), GROUND + 0.005, centreZ, 0.8, length, 0, 0.025);
    for (let z = ROAD_BANKS.fromZ; z > ROAD_BANKS.toZ;) {
      const bank = 3 + random() * 4;
      const height = ROAD_BANKS.minHeight + random() * (ROAD_BANKS.maxHeight - ROAD_BANKS.minHeight);
      addSnowDrift(batch, materials.snow, kerbX + side * (0.2 + ROAD_BANKS.depth / 2), GROUND, z - bank / 2, bank, ROAD_BANKS.depth, height, Math.PI / 2);
      z -= bank + random() * 1.5;
    }
  }
  for (let z = ROAD.fromZ - 2; z > ROAD.toZ; z -= 6) {
    if (random() < 0.25) continue;
    batch.addBox(materials.stucco, ROAD.x, GROUND + 0.006, z, 0.14, 0.01, 2.6);
  }
  for (let crack = 0; crack < 30; crack++) {
    const z = ROAD.fromZ - random() * 70;
    batch.addBox(materials.rubber, ROAD.x + (random() - 0.5) * ROAD.width * 0.8, GROUND + 0.008, z, 0.05, 0.01, 0.6 + random() * 1.6, 0, random() * Math.PI, 0);
  }
  // The guard's mushroom: a striped pole under a round tin roof, beside the gate.
  const mushroom = { x: ROAD.x - ROAD.width / 2 - 0.9, z: yard.minZ - 2.4 };
  for (let band = 0; band < 6; band++) {
    batch.add(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 10), band % 2 === 0 ? materials.stucco : materials.redEnamel,
      placement(mushroom.x, GROUND + 0.21 + band * 0.42, mushroom.z));
  }
  batch.add(new THREE.ConeGeometry(0.9, 0.45, 18, 1, true), materials.paintedSteel, placement(mushroom.x, GROUND + 2.75, mushroom.z));
  batch.add(new THREE.CylinderGeometry(0.9, 0.9, 0.06, 18, 1, true), materials.redEnamel, placement(mushroom.x, GROUND + 2.5, mushroom.z));
  // Snow on the tin, at the roof's own pitch.
  batch.add(new THREE.ConeGeometry(0.6, 0.3, 18), materials.snow, placement(mushroom.x, GROUND + 2.865, mushroom.z));
}

/**
 * Four timber legs braced in X, a plank cabin with a snowed tin roof and a
 * red star, a ladder, and a searchlight pointed over the yard with its lens
 * still glowing faintly from the battery.
 */
function buildWatchtower(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  const { x, z, height, size } = WATCHTOWER;
  const half = size / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      batch.add(new THREE.CylinderGeometry(0.1, 0.13, height, 8), materials.varnishedWood,
        placement(x + sx * half, GROUND + height / 2, z + sz * half, sz * 0.03, 0, -sx * 0.03));
    }
  }
  // X braces on each face at two levels.
  const brace = Math.hypot(size, height / 2);
  const tilt = Math.atan2(size, height / 2);
  for (const level of [0.25, 0.75]) {
    for (const face of [-1, 1]) {
      for (const direction of [-1, 1]) {
        batch.addBox(materials.varnishedWood, x, GROUND + height * level, z + face * half, 0.08, brace, 0.08, 0, 0, direction * tilt);
        batch.addBox(materials.varnishedWood, x + face * half, GROUND + height * level, z, 0.08, brace, 0.08, direction * tilt, 0, 0);
      }
    }
  }
  const floorY = GROUND + height;
  batch.addBox(materials.varnishedWood, x, floorY, z, size + 0.6, 0.12, size + 0.6);
  // Waist-high planking and corner posts up to the roof.
  for (const side of [-1, 1]) {
    batch.addBox(materials.varnishedWood, x, floorY + 0.55, z + side * (half + 0.28), size + 0.6, 1.0, 0.06);
    batch.addBox(materials.varnishedWood, x + side * (half + 0.28), floorY + 0.55, z, 0.06, 1.0, size + 0.6);
    for (const other of [-1, 1]) batch.addBox(materials.varnishedWood, x + side * (half + 0.25), floorY + 1.2, z + other * (half + 0.25), 0.1, 2.3, 0.1);
  }
  batch.add(new THREE.ConeGeometry(half * 1.75, 0.9, 4, 1).rotateY(Math.PI / 4), materials.paintedSteel, placement(x, floorY + 2.8, z));
  // The upper part of the roof under snow, at its pitch, just proud of the tin.
  batch.add(new THREE.ConeGeometry(half * 1.75 * (0.55 / 0.9), 0.55, 4, 1).rotateY(Math.PI / 4), materials.snow, placement(x, floorY + 3.025, z));
  batch.add(starGeometry(0.34, 0.14, 0.04).rotateY(Math.PI / 2), materials.redEnamel, placement(x + half + 0.32, floorY + 0.6, z));
  for (let rung = 0.4; rung < height; rung += 0.4) batch.addBox(materials.varnishedWood, x + half + 0.35, GROUND + rung, z, 0.05, 0.05, 0.5);
  for (const side of [-0.25, 0.25]) batch.addBox(materials.varnishedWood, x + half + 0.35, GROUND + height / 2, z + side, 0.06, height, 0.06);
  // The searchlight on its yoke, aimed down into the yard.
  const aim = Math.atan2(yard.minX + yard.maxX - 2 * x, yard.minZ + yard.maxZ - 2 * z);
  const lamp = new THREE.CylinderGeometry(0.32, 0.26, 0.5, 16).rotateX(Math.PI / 2).rotateX(0.35).rotateY(aim);
  batch.add(lamp, materials.greySteel, placement(x + 0.3, floorY + 1.35, z + 0.3));
  const lens = new THREE.CircleGeometry(0.28, 16).translate(0, 0, 0.26).rotateX(0.35).rotateY(aim);
  batch.add(lens, lighting.circuitMaterial('failing'), placement(x + 0.3, floorY + 1.35, z + 0.3));
}

/** Concrete poles with a crossarm and three insulators, the wires sagging between them. */
function buildPowerLine(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, fromZ, spacing, poles, height } = POWER_LINE;
  const tops: THREE.Vector3[][] = [[], [], []];
  for (let index = 0; index < poles; index++) {
    const z = fromZ - index * spacing;
    // The third pole leans, half fallen.
    const lean = index === 2 ? 0.22 : 0;
    batch.add(new THREE.CylinderGeometry(0.12, 0.18, height, 8), materials.serviceConcrete, placement(x, GROUND + height / 2, z, 0, 0, lean));
    const topX = x - Math.sin(lean) * height;
    const topY = GROUND + Math.cos(lean) * height;
    batch.addBox(materials.varnishedWood, topX, topY - 0.4, z, 1.8, 0.12, 0.12, 0, 0, lean);
    if (lean === 0) addSnowCap(batch, materials.snow, topX, topY - 0.34, z, 1.8, 0.12, 0, 0.04);
    [-0.75, 0, 0.75].forEach((offset, wire) => {
      const insulator = new THREE.Vector3(topX + offset * Math.cos(lean), topY - 0.25 + offset * Math.sin(lean), z);
      batch.add(new THREE.CylinderGeometry(0.04, 0.05, 0.14, 6), materials.windowGlass, placement(insulator.x, insulator.y, insulator.z));
      tops[wire].push(insulator);
    });
  }
  for (const line of tops) {
    for (let index = 0; index + 1 < line.length; index++) {
      const start = line[index];
      const end = line[index + 1];
      const middle = start.clone().lerp(end, 0.5);
      middle.y -= 1.1;
      const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
      batch.add(new THREE.TubeGeometry(curve, 10, 0.012, 3), materials.rubber);
    }
  }
}

/** A boxy saloon, burnt to bare steel: body, cabin, no glass, wheels sunk on the rims, snow on its roof and boot. */
function buildCarWreck(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z, yaw } = CAR_WRECK;
  const part = (material: THREE.Material, dx: number, y: number, dz: number, w: number, h: number, d: number, tilt = 0): void => {
    const geometry = new THREE.BoxGeometry(w, h, d).rotateX(tilt).translate(dx, y, dz).rotateY(yaw);
    batch.add(geometry, material, placement(x, GROUND - 0.08, z));
  };
  part(materials.railSteel, 0, 0.55, 0, 1.6, 0.5, 4.1);
  part(materials.railSteel, 0, 1.05, 0.2, 1.45, 0.5, 2.0);
  part(materials.rubber, 0, 1.05, 0.2, 1.38, 0.42, 1.94);
  part(materials.railSteel, 0, 0.75, -1.55, 1.5, 0.05, 1.0, -0.25);
  part(materials.snow, 0, 1.33, 0.2, 1.4, 0.06, 1.9);
  part(materials.snow, 0, 0.83, 1.62, 1.5, 0.06, 0.8);
  for (const side of [-1, 1]) {
    for (const end of [-1.3, 1.3]) {
      const rim = new THREE.CylinderGeometry(0.26, 0.26, 0.16, 12).rotateZ(Math.PI / 2).translate(side * 0.72, 0.24, end).rotateY(yaw);
      batch.add(rim, materials.greySteel, placement(x, GROUND - 0.08, z));
    }
  }
  const scorch = new THREE.CircleGeometry(2.6, 18).rotateX(-Math.PI / 2);
  batch.add(scorch, materials.floorGrime, placement(x, GROUND + 0.004, z));
}

/** Leafless birches: white trunks with dark scars, a few bare branches, snow heaped at their feet, scattered off the fence and road. */
function buildBirches(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const random = seededRandom(3709);
  let planted = 0;
  for (let attempt = 0; attempt < 120 && planted < 28; attempt++) {
    const x = -40 + random() * 100;
    const z = -150 + random() * 75;
    if (x > yard.minX - BIRCH_CLEARANCE.fence && x < yard.maxX + BIRCH_CLEARANCE.fence
      && z > yard.minZ - BIRCH_CLEARANCE.fence && z < yard.maxZ + BIRCH_CLEARANCE.fence) continue;
    if (Math.abs(x - ROAD.x) < ROAD.width / 2 + BIRCH_CLEARANCE.road) continue;
    if (Math.abs(x - POWER_LINE.x) < 1.5 || Math.hypot(x - WATCHTOWER.x, z - WATCHTOWER.z) < 4) continue;
    if (Math.hypot(x - CAR_WRECK.x, z - CAR_WRECK.z) < 4) continue;
    if (SURFACE_LANDMARK_CLEARINGS.some((clearing) => Math.hypot(x - clearing.x, z - clearing.z) < clearing.radius)) continue;
    planted++;
    const height = 6 + random() * 6;
    const lean = (random() - 0.5) * 0.12;
    batch.add(new THREE.CylinderGeometry(0.07, 0.16, height, 7), materials.stucco, placement(x, GROUND + height / 2, z, lean, 0, lean));
    addSnowDrift(batch, materials.snow, x + 0.2, GROUND, z + 0.1, 1.1 + random(), 0.9, 0.25, random() * Math.PI);
    for (let scar = 0; scar < 2; scar++) {
      batch.addBox(materials.rubber, x, GROUND + 0.8 + random() * height * 0.6, z, 0.2, 0.05, 0.2, 0, random() * Math.PI, 0);
    }
    for (let branch = 0; branch < 5; branch++) {
      const along = 0.45 + random() * 0.45;
      const yaw = random() * Math.PI * 2;
      const length = 1 + random() * 1.6;
      const geometry = new THREE.CylinderGeometry(0.015, 0.04, length, 4).translate(0, length / 2, 0).rotateZ(0.7 + random() * 0.4).rotateY(yaw);
      batch.add(geometry, materials.rubber, placement(x, GROUND + height * along, z));
    }
  }
}

/** Heaps of broken concrete in the snowfield, half buried. */
function buildRubble(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const random = seededRandom(3719);
  const heaps: ReadonlyArray<readonly [number, number]> = [[-6, -108], [33, -104], [38, -84], [-10, -88], [28, -122]];
  for (const [hx, hz] of heaps) {
    for (let piece = 0; piece < 12; piece++) {
      const size = 0.3 + random() * 0.8;
      batch.addBox(materials.serviceConcrete, hx + (random() - 0.5) * 3, GROUND + size * 0.25, hz + (random() - 0.5) * 3,
        size, size * 0.5, size * 0.9, random() * 0.6, random() * Math.PI, random() * 0.6);
    }
    batch.addBox(materials.railSteel, hx + 0.4, GROUND + 0.5, hz, 0.04, 0.04, 2.2, 0.4, random() * Math.PI, 0.3);
    addSnowDrift(batch, materials.snow, hx, GROUND, hz, 3.6, 3.0, 0.4, random() * Math.PI);
  }
}

/** Tower blocks with snowed roofs and balcony bands, rows of dark windows (a few still lit) and a mast whose aviation lamp still blinks. */
function buildCity(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  const random = seededRandom(3727);
  const lit = lighting.circuitMaterial('amber');
  CITY_BLOCKS.forEach((block, index) => {
    const x = (block.minX + block.maxX) / 2;
    const z = (block.minZ + block.maxZ) / 2;
    const width = block.maxX - block.minX;
    const depth = block.maxZ - block.minZ;
    batch.addBox(materials.serviceConcrete, x, GROUND + block.height / 2, z, width, block.height, depth, 0, 0, 0, 380 + index);
    addSnowCap(batch, materials.snow, x, GROUND + block.height, z, width, depth, 0, 0.2);
    for (let y = 3; y < block.height - 1; y += STOREY) {
      batch.addBox(materials.darkGranite, x, GROUND + y, z, width + 0.3, 0.16, depth + 0.3);
    }
    // Windows on the long face turned towards the station: flat panes just proud of the wall.
    const alongX = width >= depth;
    const span = alongX ? width : depth;
    const facing = alongX ? (z > -100 ? -1 : 1) : (x > 15 ? -1 : 1);
    const faceOffset = facing * ((alongX ? depth : width) / 2 + 0.02);
    const paneYaw = alongX ? (facing > 0 ? 0 : Math.PI) : (facing > 0 ? Math.PI / 2 : -Math.PI / 2);
    for (let storey = 1; storey * STOREY < block.height - 2; storey++) {
      for (let along = -span / 2 + WINDOW.pitch / 2; along < span / 2; along += WINDOW.pitch) {
        const glow = random() < 0.025;
        const wx = alongX ? x + along : x + faceOffset;
        const wz = alongX ? z + faceOffset : z + along;
        batch.add(new THREE.PlaneGeometry(WINDOW.width, WINDOW.height).rotateY(paneYaw), glow ? lit : materials.rubber,
          placement(wx, GROUND + storey * STOREY + 1.5, wz));
      }
    }
  });
  batch.addBox(materials.greySteel, MAST.x, GROUND + MAST.height / 2, MAST.z, MAST.size, MAST.height, MAST.size);
  const lamp = new THREE.SphereGeometry(0.6, 10, 8).translate(MAST.x, GROUND + MAST.height + 0.5, MAST.z);
  batch.add(lamp, lighting.circuitMaterial('emergency'));
}
