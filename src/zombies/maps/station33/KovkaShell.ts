import * as THREE from 'three';
import { wallSpans, type ArenaBoxOptions, type WallOpening } from '../shared/ArenaStructure';
import { KOVKA, KOVKA_CORRIDOR, STATION33_WALL_THICKNESS } from '../Station33Config';
import type { KovkaMaterials } from './KovkaMaterials';
import type { Station33BuildContext } from './Station33BuildContext';
import { KOVKA_VAULT, vaultLunetteGeometry, vaultRibGeometry, vaultSurfaceGeometry } from './VaultProfile';
import { stationWallLine as line, type StationWallLine } from './WallOpenings';

const HALF_THICKNESS = STATION33_WALL_THICKNESS / 2;
const { hall, pit, wallHeight } = KOVKA;
const DECK_THICKNESS = 0.16;
const PIT_WALL = 0.3;
/** One concrete rib under the vault every bay, landing on a pilaster on each side wall. */
const BAY = 5;
const RIB = { thickness: 0.32, width: 0.5 } as const;
/** Shallow enough that no body ever reaches it from the lanes: visual only. */
export const KOVKA_PILASTER_DEPTH = 0.18;
/** Painted dado along the foot of the walls, like the service rooms'. */
const DADO_HEIGHT = 1.2;

/** Rib and pilaster lines along the hall, between its end walls. */
export function kovkaBayLines(): number[] {
  const lines: number[] = [];
  for (let z = hall.minZ + BAY; z < hall.maxZ - 0.5; z += BAY) lines.push(z);
  return lines;
}

/** Where the corridor from the machine room opens in the chamber's east wall. */
const CORRIDOR_MOUTH: WallOpening = {
  center: (KOVKA_CORRIDOR.minZ + KOVKA_CORRIDOR.maxZ) / 2,
  width: KOVKA_CORRIDOR.maxZ - KOVKA_CORRIDOR.minZ,
  bottom: 0,
  top: KOVKA_CORRIDOR.height,
};

/**
 * Walls of the chamber. Both side walls are cut in two (no solid may
 * exceed the zombie obstacle limit), the east one also by the corridor's
 * mouth, and the north wall by its entrances.
 */
function kovkaWalls(): ReadonlyArray<StationWallLine> {
  const outerMinZ = hall.minZ - STATION33_WALL_THICKNESS;
  const outerMaxZ = hall.maxZ + STATION33_WALL_THICKNESS;
  const midZ = (outerMinZ + outerMaxZ) / 2;
  const west = hall.minX - HALF_THICKNESS;
  const east = hall.maxX + HALF_THICKNESS;
  const outerMinX = hall.minX - STATION33_WALL_THICKNESS;
  const outerMaxX = hall.maxX + STATION33_WALL_THICKNESS;
  return [
    line('z', west, outerMinZ, midZ, 1),
    line('z', west, midZ, outerMaxZ, 1),
    line('z', east, outerMinZ, midZ, -1),
    line('z', east, midZ, outerMaxZ, -1, [CORRIDOR_MOUTH]),
    line('x', hall.minZ - HALF_THICKNESS, outerMinX, outerMaxX, 1),
    line('x', hall.maxZ + HALF_THICKNESS, outerMinX, outerMaxX, -1),
  ];
}

/**
 * Deck round the reactor pit, the pit itself, bare concrete walls with a
 * painted dado, the corridor from the machine room, and the great ribbed
 * concrete vault on its pilasters.
 */
export function buildKovkaShell(context: Station33BuildContext, kovka: KovkaMaterials): void {
  const { structure, materials } = context;
  for (const wall of kovkaWalls()) {
    structure.addWallWithOpenings(
      wall.axis, wall.fixed, wall.min, wall.max, 0, wallHeight, STATION33_WALL_THICKNESS, wall.openings, materials.serviceConcrete,
      { surface: 'concrete', mapRole: 'wall', castShadow: !context.profile.useReducedEffects, uvSeed: 0, worldUVs: true, blocksPlayer: true },
    );
    const face = wall.fixed + wall.inward * HALF_THICKNESS;
    const min = Math.max(wall.min, wall.axis === 'z' ? hall.minZ : hall.minX);
    const max = Math.min(wall.max, wall.axis === 'z' ? hall.maxZ : hall.maxX);
    for (const [from, to] of wallSpans(min, max, wall.openings)) addDado(context, wall.axis, face + wall.inward * 0.015, from, to);
  }
  addDeck(context);
  addPit(context);
  addCorridor(context);
  addVault(context, kovka);
}

function addDado(context: Station33BuildContext, axis: 'x' | 'z', face: number, from: number, to: number): void {
  const { batch, materials } = context;
  const along = (from + to) / 2;
  const length = to - from;
  if (axis === 'z') {
    batch.addBox(materials.paintedSteel, face, DADO_HEIGHT / 2, along, 0.03, DADO_HEIGHT, length, 0, 0, 0, along);
    batch.addBox(materials.stucco, face, DADO_HEIGHT + 0.03, along, 0.035, 0.06, length);
  } else {
    batch.addBox(materials.paintedSteel, along, DADO_HEIGHT / 2, face, length, DADO_HEIGHT, 0.03, 0, 0, 0, along);
    batch.addBox(materials.stucco, along, DADO_HEIGHT + 0.03, face, length, 0.06, 0.035);
  }
}

/** Oil-stained slabs on floor 0 all round the pit: the deck before the reactor, the deck behind it and both lanes. */
function addDeck(context: Station33BuildContext): void {
  const minX = hall.minX - STATION33_WALL_THICKNESS;
  const maxX = hall.maxX + STATION33_WALL_THICKNESS;
  const minZ = hall.minZ - STATION33_WALL_THICKNESS;
  const maxZ = hall.maxZ + STATION33_WALL_THICKNESS;
  const slabs: ReadonlyArray<readonly [string, number, number, number, number]> = [
    ['front', minX, maxX, pit.maxZ, maxZ],
    ['back', minX, maxX, minZ, pit.minZ],
    ['west', minX, pit.minX, pit.minZ, pit.maxZ],
    ['east', pit.maxX, maxX, pit.minZ, pit.maxZ],
  ];
  for (const [name, x0, x1, z0, z1] of slabs) {
    context.structure.addBox((x0 + x1) / 2, -DECK_THICKNESS / 2, (z0 + z1) / 2, x1 - x0, DECK_THICKNESS, z1 - z0, context.materials.depotFloor, {
      name: `kovka-deck-${name}`, surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: 201, worldUVs: true, blocksPlayer: false,
    });
  }
}

/**
 * The reactor's pit: concrete walls under the deck's edge and a floor far
 * below. Solids for bullets only; the rails round the rim keep bodies out.
 */
function addPit(context: Station33BuildContext): void {
  const { structure, materials } = context;
  const centerX = (pit.minX + pit.maxX) / 2;
  const centerZ = (pit.minZ + pit.maxZ) / 2;
  const width = pit.maxX - pit.minX;
  const length = pit.maxZ - pit.minZ;
  const options = (name: string, uvSeed: number): ArenaBoxOptions => ({
    name: `kovka-pit-${name}`, surface: 'concrete', mapRole: 'pit', castShadow: false, uvSeed, worldUVs: true, blocksPlayer: false,
  });
  structure.addBox(centerX, pit.floorY - DECK_THICKNESS / 2, centerZ, width + 2 * PIT_WALL, DECK_THICKNESS, length + 2 * PIT_WALL, materials.depotFloor, options('floor', 211));
  const top = -DECK_THICKNESS;
  const height = top - pit.floorY;
  const y = (top + pit.floorY) / 2;
  for (const [name, z] of [['north', pit.minZ - PIT_WALL / 2], ['south', pit.maxZ + PIT_WALL / 2]] as const) {
    structure.addBox(centerX, y, z, width + 2 * PIT_WALL, height, PIT_WALL, materials.serviceConcrete, options(name, 212));
  }
  for (const [name, x] of [['west', pit.minX - PIT_WALL / 2], ['east', pit.maxX + PIT_WALL / 2]] as const) {
    structure.addBox(x, y, centerZ, PIT_WALL, height, length, materials.serviceConcrete, options(name, 213));
  }
}

/**
 * The cable gallery from the machine room: concrete floor and flat
 * ceiling, two side walls with the chamber's dado, and the cables it was
 * dug for along its north wall. Its ends are the two rooms' walls.
 */
function addCorridor(context: Station33BuildContext): void {
  const { batch, materials, structure } = context;
  const { minX, maxX, minZ, maxZ, height } = KOVKA_CORRIDOR;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const length = maxX - minX;
  const width = maxZ - minZ + 2 * STATION33_WALL_THICKNESS;
  const options = (name: string, mapRole: string, blocksPlayer: boolean): ArenaBoxOptions => ({
    name: `kovka-corridor-${name}`, surface: 'concrete', mapRole, castShadow: false, uvSeed: 221, worldUVs: true, blocksPlayer,
  });
  structure.addBox(centerX, -DECK_THICKNESS / 2, centerZ, length, DECK_THICKNESS, width, materials.depotFloor, options('floor', 'slab', false));
  structure.addBox(centerX, height + DECK_THICKNESS / 2, centerZ, length, DECK_THICKNESS, width, materials.serviceConcrete, options('ceiling', 'slab', false));
  for (const [name, z, inward] of [['north', minZ - HALF_THICKNESS, 1], ['south', maxZ + HALF_THICKNESS, -1]] as const) {
    structure.addBox(centerX, height / 2, z, length, height, STATION33_WALL_THICKNESS, materials.serviceConcrete, options(name, 'wall', true));
    addDado(context, 'x', z + inward * (HALF_THICKNESS + 0.015), minX, maxX);
  }
  for (let cable = 0; cable < 3; cable++) {
    const geometry = new THREE.CylinderGeometry(0.03, 0.03, length, 6).rotateZ(Math.PI / 2);
    batch.add(geometry.translate(centerX, height - 0.3 - cable * 0.08, minZ + 0.08), materials.rubber);
  }
}

/** Concrete barrel vault over the whole hall, closed at both ends, with a rib on a pilaster pair every bay. */
function addVault(context: Station33BuildContext, kovka: KovkaMaterials): void {
  const { structure, group, batch, materials } = context;
  const metersPerTile = kovka.vaultConcrete.userData.metersPerTile as number;
  const vault = new THREE.Mesh(vaultSurfaceGeometry(KOVKA_VAULT, hall.minZ - 0.15, hall.maxZ + 0.15, metersPerTile), kovka.vaultConcrete);
  vault.name = 'kovka-vault';
  vault.receiveShadow = true;
  vault.userData.surface = 'concrete';
  vault.userData.mapRole = 'ceiling';
  group.add(vault);
  structure.addSolid(vault, false);
  for (const [z, facing] of [[hall.minZ, 1], [hall.maxZ, -1]] as const) {
    const lunette = new THREE.Mesh(vaultLunetteGeometry(KOVKA_VAULT, z, facing, metersPerTile), kovka.vaultConcrete);
    lunette.name = facing > 0 ? 'kovka-north-lunette' : 'kovka-south-lunette';
    lunette.userData.surface = 'concrete';
    lunette.userData.mapRole = 'lunette';
    group.add(lunette);
    structure.addSolid(lunette, false);
  }
  for (const z of kovkaBayLines()) {
    batch.add(vaultRibGeometry(KOVKA_VAULT, z, RIB.thickness, RIB.width), materials.serviceConcrete);
    for (const [face, inward] of [[hall.minX, 1], [hall.maxX, -1]] as const) {
      batch.addBox(materials.serviceConcrete, face + inward * KOVKA_PILASTER_DEPTH / 2, wallHeight / 2, z, KOVKA_PILASTER_DEPTH, wallHeight, RIB.width + 0.1);
    }
  }
}
