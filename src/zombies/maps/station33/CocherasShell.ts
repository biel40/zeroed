import * as THREE from 'three';
import { wallSpans, type WallOpening } from '../shared/ArenaStructure';
import { seededRandom } from '../shared/ProceduralNoise';
import {
  COCHERAS,
  COCHERAS_TRACKS,
  STATION33_BARRIERS,
  STATION33_WALL_THICKNESS,
  VESTIBULE,
} from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import { COCHERAS_VAULT, vaultLunetteGeometry, vaultRibGeometry, vaultSurfaceGeometry } from './VaultProfile';
import { stationWallLine as line, stationWallOpenings, type StationWallLine } from './WallOpenings';

const HALF_THICKNESS = STATION33_WALL_THICKNESS / 2;
const { hall, wallHeight } = COCHERAS;
/** Painted wainscot on the iron rings, like the service tunnels. */
const DADO_HEIGHT = 1.2;
/** One cast-iron ring per metre along the hall. */
const RING_SPACING = 1;
/** Cable brackets along the side walls, just under the spring line. */
const CABLE_RUN_Y = 3.75;
/** How far the dead tunnel behind the west portal runs before the collapse. */
const TUNNEL_LENGTH = 6.6;
const TUNNEL_BACK_Z = hall.minZ - STATION33_WALL_THICKNESS - TUNNEL_LENGTH;
/** Steel leaf of the blast gate around the wicket the horde breaks through. */
const BLAST_GATE = { halfWidth: 2.25, top: 3.7, bottom: 0.18, depth: 0.22 } as const;

/**
 * Walls of the train sheds. The long west wall is cut in two (no solid
 * may exceed the zombie obstacle limit); the north wall opens on the west
 * track's tunnel; the south wall runs east of the vestibule, whose north
 * wall closes the rest.
 */
export function cocherasWalls(): ReadonlyArray<StationWallLine> {
  const outerMinZ = hall.minZ - STATION33_WALL_THICKNESS;
  const outerMaxZ = hall.maxZ;
  const midZ = (outerMinZ + outerMaxZ) / 2;
  const west = hall.minX - HALF_THICKNESS;
  const portal: WallOpening = {
    center: COCHERAS_TRACKS.west.x,
    width: COCHERAS_TRACKS.portal.width,
    bottom: 0,
    top: COCHERAS_TRACKS.portal.height,
  };
  return [
    line('z', west, outerMinZ, midZ, 1),
    line('z', west, midZ, outerMaxZ, 1),
    line('z', hall.maxX + HALF_THICKNESS, outerMinZ, outerMaxZ, -1),
    line('x', hall.minZ - HALF_THICKNESS, hall.minX - STATION33_WALL_THICKNESS, hall.maxX + STATION33_WALL_THICKNESS, 1, [portal]),
    line('x', hall.maxZ + HALF_THICKNESS, VESTIBULE.maxX + STATION33_WALL_THICKNESS, hall.maxX + STATION33_WALL_THICKNESS, -1),
  ];
}

/**
 * Concrete floor, cast-iron ring walls with a painted wainscot, the
 * ringed vault and its end infills, cable runs, the dead tunnel behind
 * the west portal and the blast gate over the east track.
 */
export function buildCocherasShell(context: Station33BuildContext): void {
  const { structure, materials } = context;
  const floorMinX = hall.minX - STATION33_WALL_THICKNESS;
  const floorMaxX = hall.maxX + STATION33_WALL_THICKNESS;
  const floorMinZ = hall.minZ - STATION33_WALL_THICKNESS;
  // Edge to edge with the vestibule floor, which ends on the back of its north wall.
  structure.addBox((floorMinX + floorMaxX) / 2, -0.08, (floorMinZ + hall.maxZ) / 2, floorMaxX - floorMinX, 0.16, hall.maxZ - floorMinZ, materials.depotFloor, {
    name: 'cocheras-floor', surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: 71, blocksPlayer: false,
  });

  for (const wall of cocherasWalls()) {
    structure.addWallWithOpenings(
      wall.axis, wall.fixed, wall.min, wall.max, 0, wallHeight, STATION33_WALL_THICKNESS,
      wall.openings, materials.tubbing,
      { surface: 'metal', mapRole: 'wall', castShadow: !context.profile.useReducedEffects, uvSeed: 0, worldUVs: true, blocksPlayer: true },
    );
    addDado(context, wall);
  }
  addSharedWallFacing(context);
  addVault(context);
  addCableRuns(context);
  addDeadTunnel(context);
  addBlastGate(context);
}

/** Green wainscot with a pale stripe on every solid stretch of wall. */
function addDado(context: Station33BuildContext, wall: StationWallLine): void {
  const { batch, materials } = context;
  const face = wall.fixed + wall.inward * (HALF_THICKNESS + 0.015);
  const min = Math.max(wall.min, wall.axis === 'z' ? hall.minZ : hall.minX);
  const max = Math.min(wall.max, wall.axis === 'z' ? hall.maxZ : hall.maxX);
  for (const [from, to] of wallSpans(min, max, wall.openings)) {
    const along = (from + to) / 2;
    const length = to - from;
    if (wall.axis === 'z') {
      batch.addBox(materials.paintedSteel, face, DADO_HEIGHT / 2, along, 0.03, DADO_HEIGHT, length, 0, 0, 0, along);
      batch.addBox(materials.stucco, face, DADO_HEIGHT + 0.03, along, 0.035, 0.06, length);
    } else {
      batch.addBox(materials.paintedSteel, along, DADO_HEIGHT / 2, face, length, DADO_HEIGHT, 0.03, 0, 0, 0, along);
      batch.addBox(materials.stucco, along, DADO_HEIGHT + 0.03, face, length, 0.06, 0.035);
    }
  }
}

/**
 * Where the sheds meet the vestibule's marble north wall: iron facing on
 * the shed side (around the service door) and a header up to the shed's
 * spring line, kept off the vestibule lunette's plane.
 */
function addSharedWallFacing(context: Station33BuildContext): void {
  const { batch, materials, structure } = context;
  const wallZ = VESTIBULE.minZ - HALF_THICKNESS;
  const face = hall.maxZ - 0.012;
  // Also hides the end of the vestibule's east wall, which reaches the sheds.
  const sharedMaxX = VESTIBULE.maxX + STATION33_WALL_THICKNESS;
  const openings = stationWallOpenings('x', wallZ, hall.minX, sharedMaxX);
  for (const [from, to] of wallSpans(hall.minX, sharedMaxX, openings)) {
    const along = (from + to) / 2;
    batch.addBox(materials.tubbing, along, VESTIBULE.wallHeight / 2, face, to - from, VESTIBULE.wallHeight, 0.02, 0, 0, 0, from);
    batch.addBox(materials.paintedSteel, along, DADO_HEIGHT / 2, face - 0.025, to - from, DADO_HEIGHT, 0.03, 0, 0, 0, along);
    batch.addBox(materials.stucco, along, DADO_HEIGHT + 0.03, face - 0.025, to - from, 0.06, 0.035);
  }
  for (const opening of openings) {
    const height = VESTIBULE.wallHeight - opening.top;
    batch.addBox(materials.tubbing, opening.center, opening.top + height / 2, face, opening.width, height, 0.02, 0, 0, 0, opening.center);
  }
  const headerMinX = hall.minX - STATION33_WALL_THICKNESS;
  const headerMaxX = VESTIBULE.maxX + STATION33_WALL_THICKNESS;
  const headerHeight = wallHeight - VESTIBULE.wallHeight;
  structure.addBox(
    (headerMinX + headerMaxX) / 2, VESTIBULE.wallHeight + headerHeight / 2, wallZ - 0.01,
    headerMaxX - headerMinX, headerHeight, STATION33_WALL_THICKNESS - 0.02, materials.tubbing,
    { name: 'cocheras-header', surface: 'metal', mapRole: 'wall', castShadow: false, uvSeed: 0, worldUVs: true, blocksPlayer: false },
  );
}

/** Ringed cast-iron vault with an infill at each end. */
function addVault(context: Station33BuildContext): void {
  const { materials, structure, group, batch } = context;
  const metersPerTile = materials.tubbing.userData.metersPerTile as number;
  const vault = new THREE.Mesh(vaultSurfaceGeometry(COCHERAS_VAULT, hall.minZ - 0.15, hall.maxZ + 0.15, metersPerTile), materials.tubbing);
  vault.name = 'cocheras-vault';
  vault.receiveShadow = true;
  vault.userData.surface = 'metal';
  vault.userData.mapRole = 'ceiling';
  group.add(vault);
  structure.addSolid(vault, false);
  for (const [z, facing] of [[hall.minZ, 1], [hall.maxZ, -1]] as const) {
    const lunette = new THREE.Mesh(vaultLunetteGeometry(COCHERAS_VAULT, z, facing, metersPerTile), materials.tubbing);
    lunette.name = facing > 0 ? 'cocheras-north-lunette' : 'cocheras-south-lunette';
    lunette.userData.surface = 'metal';
    lunette.userData.mapRole = 'lunette';
    group.add(lunette);
    structure.addSolid(lunette, false);
  }
  for (let z = hall.minZ + RING_SPACING / 2; z < hall.maxZ; z += RING_SPACING) {
    batch.add(vaultRibGeometry(COCHERAS_VAULT, z, 0.1, 0.12), materials.greySteel);
  }
}

/** Steel brackets carrying bundles of power cables along both side walls. */
function addCableRuns(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const length = hall.maxZ - hall.minZ;
  const centerZ = (hall.minZ + hall.maxZ) / 2;
  for (const [face, inward] of [[hall.minX, 1], [hall.maxX, -1]] as const) {
    for (let z = hall.minZ + 0.8; z < hall.maxZ; z += 1.6) {
      batch.addBox(materials.greySteel, face + inward * 0.18, CABLE_RUN_Y, z, 0.36, 0.04, 0.05);
    }
    for (let cable = 0; cable < 4; cable++) {
      const geometry = new THREE.CylinderGeometry(0.028, 0.028, length, 6).rotateX(Math.PI / 2);
      geometry.translate(face + inward * (0.08 + cable * 0.08), CABLE_RUN_Y + 0.05, centerZ);
      batch.add(geometry, materials.rubber);
    }
  }
}

/**
 * The west track's tunnel behind the north wall: a short ringed tube the
 * trailer car fills, then ceiling slabs and spoil where it caved in.
 */
function addDeadTunnel(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { width, height } = COCHERAS_TRACKS.portal;
  const x = COCHERAS_TRACKS.west.x;
  const startZ = hall.minZ - STATION33_WALL_THICKNESS;
  const centerZ = (startZ + TUNNEL_BACK_Z) / 2;
  batch.addBox(materials.trackBed, x, -0.08, centerZ, width, 0.16, TUNNEL_LENGTH);
  batch.addBox(materials.tubbing, x, height + 0.1, centerZ, width + 0.6, 0.2, TUNNEL_LENGTH);
  for (const side of [-1, 1]) {
    batch.addBox(materials.tubbing, x + side * (width / 2 + 0.15), height / 2, centerZ, 0.3, height, TUNNEL_LENGTH);
  }
  for (let z = startZ - 0.5; z > TUNNEL_BACK_Z; z -= RING_SPACING) {
    batch.addBox(materials.greySteel, x, height - 0.04, z, width, 0.08, 0.12);
    for (const side of [-1, 1]) batch.addBox(materials.greySteel, x + side * (width / 2 - 0.04), height / 2, z, 0.08, height, 0.12);
  }
  // Concrete lintel and hazard-striped jambs on the hall face of the portal.
  const face = hall.minZ + 0.06;
  batch.addBox(materials.serviceConcrete, x, height + 0.2, face, width + 0.5, 0.4, 0.12);
  for (const side of [-1, 1]) batch.addBox(materials.hazardPaint, x + side * (width / 2 + 0.1), height / 2, face, 0.2, height, 0.12);
  const random = seededRandom(3457);
  for (let index = 0; index < 18; index++) {
    const size = 0.35 + random() * 0.6;
    batch.addBox(
      materials.rubble,
      x + (random() - 0.5) * width,
      0.2 + random() * height * 0.9,
      TUNNEL_BACK_Z + 0.3 + random() * 1.2,
      size, size * 0.8, size,
      random() * Math.PI, random() * Math.PI, random() * Math.PI,
    );
  }
  batch.addBox(materials.serviceConcrete, x, height / 2, TUNNEL_BACK_Z - 0.15, width + 0.6, height + 0.4, 0.3);
}

/**
 * Closed hermetic gate over the east track: a ribbed steel leaf in a
 * hazard-striped frame, with the wicket left in it for the barrier boards,
 * a handwheel and locking bars. Decoration only; the wall stays the solid.
 */
function addBlastGate(context: Station33BuildContext): void {
  const { batch, materials, signage } = context;
  const gate = STATION33_BARRIERS.find((barrier) => barrier.id === 'cocheras-blast-gate')!;
  const wicketHalf = 0.75 + 0.06;
  const wicketTop = 2.2 + 0.06;
  const { halfWidth, top, bottom, depth } = BLAST_GATE;
  const z = hall.minZ + depth / 2;
  const leafSide = halfWidth - wicketHalf;
  for (const side of [-1, 1]) {
    batch.addBox(materials.greySteel, gate.x + side * (wicketHalf + leafSide / 2), (bottom + top) / 2, z, leafSide, top - bottom, depth);
    batch.addBox(materials.hazardPaint, gate.x + side * (halfWidth + 0.12), (top + 0.25) / 2, hall.minZ + 0.1, 0.24, top + 0.25, 0.2);
  }
  batch.addBox(materials.greySteel, gate.x, (wicketTop + top) / 2, z, wicketHalf * 2, top - wicketTop, depth);
  batch.addBox(materials.hazardPaint, gate.x, top + 0.12, hall.minZ + 0.1, halfWidth * 2 + 0.48, 0.25, 0.2);
  batch.addBox(materials.greySteel, gate.x, bottom / 2, hall.minZ + 0.12, halfWidth * 2, bottom, 0.24);
  // Horizontal stiffeners across the leaf, broken by the wicket below its top.
  for (let y = bottom + 0.45; y < top - 0.2; y += 0.7) {
    if (y < wicketTop) {
      for (const side of [-1, 1]) batch.addBox(materials.paintedSteel, gate.x + side * (wicketHalf + leafSide / 2), y, z + depth / 2 + 0.03, leafSide - 0.1, 0.08, 0.06);
    } else {
      batch.addBox(materials.paintedSteel, gate.x, y, z + depth / 2 + 0.03, halfWidth * 2 - 0.1, 0.08, 0.06);
    }
  }
  const wheelX = gate.x + wicketHalf + leafSide / 2;
  const wheel = new THREE.TorusGeometry(0.3, 0.035, 6, 20).translate(wheelX, 1.45, z + depth / 2 + 0.12);
  batch.add(wheel, materials.greySteel);
  for (const angle of [0, Math.PI / 3, (Math.PI * 2) / 3]) {
    batch.addBox(materials.greySteel, wheelX, 1.45, z + depth / 2 + 0.12, 0.58, 0.03, 0.03, 0, 0, angle);
  }
  for (const y of [0.9, 2.9]) {
    batch.addBox(materials.greySteel, gate.x - wicketHalf - leafSide / 2, y, z + depth / 2 + 0.05, leafSide + 0.2, 0.1, 0.08);
  }
  const plate = signage.signGeometry('blast-gate', 0.9, 0.45);
  plate.translate(gate.x, wicketTop + 0.5, z + depth / 2 + 0.005);
  batch.add(plate, signage.material);
}
