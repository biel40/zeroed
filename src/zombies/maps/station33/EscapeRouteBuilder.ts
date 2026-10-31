import * as THREE from 'three';
import { EYE_HEIGHT, type FloorTransitionZone, type StairRamp } from '../../../player/PlayerController';
import type { StainFaces } from '../../GibWalls';
import { addSolidProxy } from '../shared/SolidProxy';
import {
  PROTOCOL33_ESCAPE,
  PROTOCOL33_SURFACE,
  PROTOCOL33_SURFACE_BOUNDS,
  PROTOCOL33_SURFACE_Y,
  STATION33_PLAYER_BOUNDS,
  STATION33_WALL_THICKNESS,
} from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

const { minX, maxX, corridorMaxZ, stairBottomZ, stairTopZ, height, steps } = PROTOCOL33_ESCAPE;
const { kiosk } = PROTOCOL33_SURFACE;
const CENTER_X = (minX + maxX) / 2;
const WIDTH = maxX - minX;
const RUN = stairBottomZ - stairTopZ;
const RISE = PROTOCOL33_SURFACE_Y;
const SLOPE = Math.atan2(RISE, RUN);
const SLOPE_LENGTH = Math.hypot(RISE, RUN);
const HALF_THICKNESS = STATION33_WALL_THICKNESS / 2;
/** Where the climbing ceiling meets ground level: the kiosk stands north of it. */
const KIOSK_REAR_Z = kiosk.maxZ - HALF_THICKNESS;
const KIOSK_TOP = PROTOCOL33_SURFACE_Y + kiosk.height;

/** Ground height of the flight at `z`: 0 at its foot, the surface at its head. */
function stairY(z: number): number {
  return THREE.MathUtils.clamp((stairBottomZ - z) / RUN, 0, 1) * RISE;
}

/**
 * The flight from the corridor (floor 0) to the surface (floor 1). Inside
 * its volume height follows the slope for the player and the horde; each
 * floor changes on the far landing, as on the mansion's stair.
 */
export function escapeStairTransitions(): ReadonlyArray<FloorTransitionZone> {
  const ramp: StairRamp = {
    box: new THREE.Box3(new THREE.Vector3(minX, -0.2, stairTopZ - 0.15), new THREE.Vector3(maxX, KIOSK_TOP, stairBottomZ + 0.03)),
    top: { x: CENTER_X, y: RISE, z: stairTopZ },
    bottom: { x: CENTER_X, y: 0, z: stairBottomZ },
  };
  return [
    {
      box: new THREE.Box3(new THREE.Vector3(minX, RISE - 0.5, stairTopZ - 0.35), new THREE.Vector3(maxX, KIOSK_TOP, stairTopZ + 0.15)),
      sourceFloor: 0,
      targetFloor: 1,
      targetY: RISE + EYE_HEIGHT,
      bounds: PROTOCOL33_SURFACE_BOUNDS,
      ramp,
    },
    {
      box: new THREE.Box3(new THREE.Vector3(minX, -0.5, stairBottomZ - 0.15), new THREE.Vector3(maxX, 2.6, stairBottomZ + 0.2)),
      sourceFloor: 1,
      targetFloor: 0,
      targetY: EYE_HEIGHT,
      bounds: STATION33_PLAYER_BOUNDS,
      ramp,
    },
  ];
}

/**
 * Protocol 33's way up: the bare concrete corridor behind the blast door
 * and one long flight under a climbing ceiling, lit only by battery lamps,
 * to the stairhead kiosk whose doorway opens on the yard. Walls are solids;
 * steps, ceilings and fittings are batched, and an invisible slope takes
 * the bullets on the flight.
 */
export function buildEscapeRoute(context: Station33BuildContext, lighting: Station33Lighting): void {
  buildShell(context);
  buildFlight(context);
  buildKiosk(context);
  addFittings(context, lighting);
}

function buildShell(context: Station33BuildContext): void {
  const { structure, materials } = context;
  const length = corridorMaxZ - stairBottomZ;
  const corridorZ = (corridorMaxZ + stairBottomZ) / 2;
  const outerWidth = WIDTH + 2 * STATION33_WALL_THICKNESS;
  for (const [name, y, material] of [
    ['floor', -0.08, materials.depotFloor],
    ['ceiling', height + 0.08, materials.serviceConcrete],
  ] as const) {
    structure.addBox(CENTER_X, y, corridorZ, outerWidth, 0.16, length, material, {
      name: `escape-${name}`, surface: 'concrete', mapRole: 'slab', blocksPlayer: false, castShadow: false, uvSeed: 330,
    });
  }
  // Below ground the side walls stop at the surface; past the climbing
  // ceiling they rise into the kiosk. Above the buried stretch an invisible
  // fin keeps the surface's horde on the flight.
  const buriedLength = corridorMaxZ - KIOSK_REAR_Z;
  const kioskLength = KIOSK_REAR_Z - kiosk.minZ;
  for (const side of [-1, 1] as const) {
    const x = side < 0 ? minX - HALF_THICKNESS : maxX + HALF_THICKNESS;
    structure.addBox(x, RISE / 2, (corridorMaxZ + KIOSK_REAR_Z) / 2, STATION33_WALL_THICKNESS, RISE, buriedLength, materials.serviceConcrete, {
      name: 'escape-wall', surface: 'concrete', mapRole: 'wall', blocksPlayer: true, castShadow: false, uvSeed: 331 + side,
    });
    structure.addBox(x, KIOSK_TOP / 2, (KIOSK_REAR_Z + kiosk.minZ) / 2, STATION33_WALL_THICKNESS, KIOSK_TOP, kioskLength, materials.serviceConcrete, {
      name: 'escape-kiosk-wall', surface: 'concrete', mapRole: 'wall', blocksPlayer: true, castShadow: false, uvSeed: 334 + side,
    });
    addSolidProxy(context, 'escape-surface-fin',
      { x: x - HALF_THICKNESS, y: RISE, z: KIOSK_REAR_Z }, { x: x + HALF_THICKNESS, y: KIOSK_TOP, z: stairBottomZ + 0.5 }, 'concrete', 'none');
  }
}

/** Concrete steps with steel nosings, handrails, the climbing ceiling and the slope bullets hit. */
function buildFlight(context: Station33BuildContext): void {
  const { batch, materials, structure, group } = context;
  const run = RUN / steps;
  const rise = RISE / steps;
  for (let step = 0; step < steps; step++) {
    const top = rise * (step + 1);
    const z = stairBottomZ - run * (step + 0.5);
    batch.addBox(materials.serviceConcrete, CENTER_X, top - (rise + 0.2) / 2, z, WIDTH, rise + 0.2, run, 0, 0, 0, 340 + step);
    batch.addBox(materials.greySteel, CENTER_X, top - 0.015, z + run / 2 - 0.03, WIDTH - 0.04, 0.03, 0.06);
  }
  const middleZ = (stairBottomZ + stairTopZ) / 2;
  // Parallel to the treads, `height` above them: it meets the corridor ceiling and the kiosk's lintel.
  batch.addBox(materials.serviceConcrete, CENTER_X, RISE / 2 + height + 0.1, middleZ, WIDTH + 0.02, 0.2, SLOPE_LENGTH + 0.2, SLOPE);
  batch.addBox(materials.serviceConcrete, CENTER_X, RISE + height + 0.1, (stairTopZ + kiosk.minZ) / 2, WIDTH + 0.02, 0.2, stairTopZ - kiosk.minZ);
  for (const x of [minX + 0.06, maxX - 0.06]) {
    const rail = new THREE.CylinderGeometry(0.03, 0.03, SLOPE_LENGTH, 8).rotateX(Math.PI / 2 + SLOPE);
    batch.add(rail.translate(x, RISE / 2 + 0.95, middleZ), materials.greySteel);
  }
  // Raycast-only surface (as on the mansion's stair): treads are batched visuals.
  const slope = new THREE.Mesh(new THREE.BoxGeometry(WIDTH, 0.08, SLOPE_LENGTH), context.collider);
  slope.position.set(CENTER_X, RISE / 2 - 0.04, middleZ);
  slope.rotation.x = SLOPE;
  slope.name = 'escape-stair-ramp';
  slope.userData.surface = 'concrete';
  slope.userData.mapRole = 'walkable-stair-ramp';
  slope.userData.walkableSurface = true;
  // The tilted slope's AABB floats over the treads.
  slope.userData.stainFaces = 'none' satisfies StainFaces;
  structure.addSolid(slope, false);
  group.add(slope);
}

/**
 * The stairhead on the surface: the buried flight's walls rise into a
 * squat concrete kiosk with a heavy lintel and canopy over its doorway,
 * a flat roof and a back wall where the ceiling meets the ground.
 */
function buildKiosk(context: Station33BuildContext): void {
  const { batch, materials, structure, signage } = context;
  const doorTop = PROTOCOL33_SURFACE_Y + kiosk.doorHeight;
  const frontZ = kiosk.minZ + HALF_THICKNESS;
  structure.addBox(CENTER_X, (doorTop + KIOSK_TOP) / 2, frontZ, kiosk.maxX - kiosk.minX, KIOSK_TOP - doorTop, STATION33_WALL_THICKNESS,
    materials.serviceConcrete, { name: 'escape-kiosk-lintel', surface: 'concrete', mapRole: 'wall', blocksPlayer: true, castShadow: false, uvSeed: 337 });
  const depth = kiosk.maxZ - kiosk.minZ;
  batch.addBox(materials.serviceConcrete, CENTER_X, KIOSK_TOP + 0.1, (kiosk.minZ + kiosk.maxZ) / 2, kiosk.maxX - kiosk.minX + 0.2, 0.2, depth + 0.2);
  batch.addBox(materials.serviceConcrete, CENTER_X, (RISE + KIOSK_TOP) / 2, KIOSK_REAR_Z, kiosk.maxX - kiosk.minX, kiosk.height, STATION33_WALL_THICKNESS);
  batch.addBox(materials.serviceConcrete, CENTER_X, doorTop + 0.22, kiosk.minZ - 0.5, kiosk.maxX - kiosk.minX + 0.6, 0.14, 1.0);
  batch.addBox(materials.hazardPaint, CENTER_X, doorTop - 0.05, kiosk.minZ - 0.004, WIDTH, 0.1, 0.01);
  const plate = signage.signGeometry('route-33', 0.5, 0.5).rotateY(Math.PI).translate(CENTER_X, doorTop + 0.75, kiosk.minZ - 0.012);
  batch.add(plate, signage.material);
}

/**
 * A cable tray and a water main along the flight, the exit plate at its
 * foot, battery lamps on the stair walls (the corridor's is a wall lamp)
 * and the bloody hand of someone who never reached the top.
 */
function addFittings(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials, signage } = context;
  const trayLength = corridorMaxZ - stairBottomZ;
  batch.addBox(materials.greySteel, maxX - 0.12, height - 0.35, (corridorMaxZ + stairBottomZ) / 2, 0.22, 0.05, trayLength);
  batch.addBox(materials.greySteel, maxX - 0.12, RISE / 2 + height - 0.35, (stairBottomZ + stairTopZ) / 2, 0.22, 0.05, SLOPE_LENGTH, SLOPE);
  const pipe = new THREE.CylinderGeometry(0.07, 0.07, corridorMaxZ - stairBottomZ, 10).rotateX(Math.PI / 2);
  batch.add(pipe.translate(minX + 0.12, 0.45, (corridorMaxZ + stairBottomZ) / 2), materials.paintedSteel);
  const exitPlate = signage.signGeometry('exit', 0.96, 0.24).rotateY(Math.PI / 2).translate(minX + 0.012, 2.25, stairBottomZ + 0.9);
  batch.add(exitPlate, signage.material);
  for (const z of [-69.6, -75.2]) {
    const y = stairY(z) + 2.25;
    batch.addBox(materials.greySteel, maxX - 0.03, y, z, 0.06, 0.3, 0.26);
    const globe = new THREE.SphereGeometry(0.11, 12, 8).scale(1, 1.25, 1).translate(maxX - 0.16, y, z);
    batch.add(globe, lighting.circuitMaterial('emergency'));
  }
  const smear = new THREE.PlaneGeometry(0.9, 0.7).rotateY(-Math.PI / 2).translate(maxX - 0.012, stairY(-71.0) + 1.2, -71.0);
  batch.add(smear, materials.bloodSmear);
}
