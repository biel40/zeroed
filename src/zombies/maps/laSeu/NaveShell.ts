import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  CHANCEL,
  LA_SEU_WALL_THICKNESS,
  LANCET,
  NAVE,
  NAVE_COLUMN,
  NAVE_COLUMN_ZS,
  ROSE_WINDOWS,
  naveBayCenter,
  naveBayLine,
} from '../LaSeuConfig';
import {
  archBandShape,
  archPoints,
  archSpandrelShape,
  lancetShape,
  ribGeometries,
  ribVaultGeometry,
  wallShapeGeometry,
  type VaultBay,
} from './GothicVault';
import type { LaSeuBuildContext } from './LaSeuBuildContext';
import { addStoneWall, roseRingGeometry, roundPaneGeometry, scaleUVs } from './LaSeuWalls';
import { addGreatDoorFace } from './MainPortal';

const HALF_WALL = LA_SEU_WALL_THICKNESS / 2;
const VAULT_SEGMENTS = 10;
const RIB_SEGMENTS = 8;
/** Turns an eight-sided cylinder so its flats, not its corners, face the aisles. */
const OCTAGON_TURN = Math.PI / 8;
const AISLE_RISE = NAVE.aisleApexY - NAVE.aisleSpringY;
const NAVE_RISE = NAVE.naveApexY - NAVE.naveSpringY;
const SIDES = [-1, 1] as const;

/** The three vault bays (west aisle, central aisle, east aisle) of nave bay `index`. */
export function naveVaultBays(index: number): ReadonlyArray<VaultBay> {
  const minZ = naveBayLine(index + 1);
  const maxZ = naveBayLine(index);
  const aisle = { minZ, maxZ, springY: NAVE.aisleSpringY, apexY: NAVE.aisleApexY };
  return [
    { ...aisle, minX: NAVE.minX, maxX: -NAVE.columnX },
    { minX: -NAVE.columnX, maxX: NAVE.columnX, minZ, maxZ, springY: NAVE.naveSpringY, apexY: NAVE.naveApexY },
    { ...aisle, minX: NAVE.columnX, maxX: NAVE.maxX },
  ];
}

/**
 * The nave: floor, the four walls, both rows of octagonal columns, the
 * arcade and clerestory over them, the rib vaults of the three aisles, the
 * lancets and both rose windows, and the inner face of the great doors.
 */
export function buildNaveShell(context: LaSeuBuildContext): void {
  addFloor(context);
  addWalls(context);
  addColumns(context);
  addVaults(context);
  addArcade(context);
  addAisleWindows(context);
  addEndWallDressing(context);
}

function addFloor(context: LaSeuBuildContext): void {
  const width = NAVE.maxX - NAVE.minX + LA_SEU_WALL_THICKNESS * 2;
  const depth = NAVE.maxZ - NAVE.minZ + LA_SEU_WALL_THICKNESS * 2;
  context.structure.addBox(0, -0.08, (NAVE.minZ + NAVE.maxZ) / 2, width, 0.16, depth, context.materials.floorStone, {
    name: 'nave-floor', surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: 1, worldUVs: true, blocksPlayer: false,
  });
}

function addWalls(context: LaSeuBuildContext): void {
  const breaks = [naveBayLine(2), naveBayLine(4), naveBayLine(6)];
  for (const side of SIDES) {
    addStoneWall(context, side < 0 ? 'nave-west-wall' : 'nave-east-wall', {
      axis: 'z', fixed: side * (NAVE.maxX + HALF_WALL), min: NAVE.minZ, max: NAVE.maxZ, height: NAVE.sideWallHeight, breaks,
    });
  }
  const outerMinX = NAVE.minX - LA_SEU_WALL_THICKNESS;
  const outerMaxX = NAVE.maxX + LA_SEU_WALL_THICKNESS;
  // The wicket splits the front in two; the chancel arch does the same to the far wall.
  addStoneWall(context, 'nave-front-wall', { axis: 'x', fixed: NAVE.maxZ + HALF_WALL, min: outerMinX, max: outerMaxX, height: NAVE.endWallHeight });
  addStoneWall(context, 'nave-chancel-wall', {
    axis: 'x', fixed: NAVE.minZ - HALF_WALL, min: outerMinX, max: outerMaxX, height: NAVE.endWallHeight,
    extraOpenings: [{ center: 0, width: CHANCEL.maxX - CHANCEL.minX, bottom: 0, top: CHANCEL.apexY }],
  });
}

/** Slender eight-sided shafts on moulded bases, each with an invisible eight-sided solid. */
function addColumns(context: LaSeuBuildContext): void {
  const { batch, materials, structure, group } = context;
  const { radius, baseHeight, capitalHeight } = NAVE_COLUMN;
  const shaftHeight = NAVE.aisleSpringY - baseHeight;
  const tile = materials.dressedStone.userData.metersPerTile as number;
  const girth = Math.PI * 2 * radius / tile;
  const solid = new THREE.CylinderGeometry(radius, radius, NAVE.aisleSpringY, 8).rotateY(OCTAGON_TURN);
  for (const side of SIDES) {
    for (const z of NAVE_COLUMN_ZS) {
      const x = side * NAVE.columnX;
      const octagon = (top: number, bottom: number, height: number, y: number): void => {
        const geometry = new THREE.CylinderGeometry(top, bottom, height, 8).rotateY(OCTAGON_TURN).translate(x, y, z);
        batch.add(scaleUVs(geometry, girth, height / tile), materials.dressedStone);
      };
      octagon(radius + 0.3, radius + 0.36, baseHeight * 0.45, baseHeight * 0.225);
      octagon(radius + 0.08, radius + 0.3, baseHeight * 0.55, baseHeight * 0.725);
      octagon(radius, radius, shaftHeight - capitalHeight, baseHeight + (shaftHeight - capitalHeight) / 2);
      octagon(radius + 0.34, radius, capitalHeight, NAVE.aisleSpringY - capitalHeight / 2);
      // The shaft carries on up the clerestory to the spring of the high vault.
      batch.addBox(materials.dressedStone, x - side * 0.2, (NAVE.aisleSpringY + NAVE.naveSpringY) / 2, z, 0.4, NAVE.naveSpringY - NAVE.aisleSpringY, 0.5, 0, 0, 0, z);
      // Its answer on the side wall, where the aisle's arch lands.
      batch.addBox(materials.dressedStone, side * (NAVE.maxX - 0.09), NAVE.aisleSpringY / 2, z, 0.18, NAVE.aisleSpringY, 0.5, 0, 0, 0, z + 3);

      const proxy = new THREE.Mesh(solid, materials.collider);
      proxy.name = `nave-column-${side < 0 ? 'west' : 'east'}-${-z}`;
      proxy.position.set(x, NAVE.aisleSpringY / 2, z);
      proxy.userData.surface = 'concrete';
      proxy.userData.mapRole = 'column';
      group.add(proxy);
      structure.addSolid(proxy, true);
    }
  }
}

/** Webs of every bay in one solid mesh, and their ribs, cross arches and bosses. */
function addVaults(context: LaSeuBuildContext): void {
  const { batch, materials, structure, group } = context;
  const tile = materials.vaultStone.userData.metersPerTile as number;
  const webs: THREE.BufferGeometry[] = [];
  for (let index = 0; index < NAVE.bays; index++) {
    for (const bay of naveVaultBays(index)) {
      webs.push(ribVaultGeometry(bay, VAULT_SEGMENTS, tile));
      const rise = bay.apexY - bay.springY;
      const diagonals = [
        archPoints(bay.minX, bay.minZ, bay.maxX, bay.maxZ, bay.springY - 0.12, rise, RIB_SEGMENTS),
        archPoints(bay.minX, bay.maxZ, bay.maxX, bay.minZ, bay.springY - 0.12, rise, RIB_SEGMENTS),
      ];
      for (const diagonal of diagonals) {
        for (const geometry of ribGeometries(diagonal, 0.22, 0.26)) batch.add(geometry, materials.dressedStone);
      }
      const boss = new THREE.CylinderGeometry(0.42, 0.3, 0.22, 8).translate((bay.minX + bay.maxX) / 2, bay.apexY - 0.3, (bay.minZ + bay.maxZ) / 2);
      batch.add(boss, materials.gilt);
    }
  }
  // Cross arches on every bay line, the two end walls included.
  for (let line = 0; line <= NAVE.bays; line++) {
    const z = naveBayLine(line);
    for (const bay of naveVaultBays(0)) {
      const arch = archPoints(bay.minX, z, bay.maxX, z, bay.springY - 0.2, bay.apexY - bay.springY, RIB_SEGMENTS);
      for (const geometry of ribGeometries(arch, 0.42, 0.4)) batch.add(geometry, materials.dressedStone);
    }
  }
  const merged = mergeGeometries(webs);
  for (const web of webs) web.dispose();
  const vault = new THREE.Mesh(merged, materials.vaultStone);
  vault.name = 'nave-vault';
  vault.userData.surface = 'concrete';
  vault.userData.mapRole = 'ceiling';
  group.add(vault);
  structure.addSolid(vault, false);
}

/** The arcade arches between the columns and the clerestory wall they carry, with its round windows. */
function addArcade(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  const tile = materials.wallStone.userData.metersPerTile as number;
  const half = NAVE.bayLength / 2;
  const oculusY = (NAVE.aisleApexY + NAVE.naveApexY) / 2 - 0.2;
  for (const side of SIDES) {
    const x = side * NAVE.columnX;
    const facing = side > 0 ? 'nx' : 'px';
    for (let index = 0; index < NAVE.bays; index++) {
      const z = naveBayCenter(index);
      const band = archBandShape(half, NAVE.aisleSpringY, AISLE_RISE, NAVE.naveSpringY, NAVE_RISE, RIB_SEGMENTS);
      batch.add(wallShapeGeometry(band, facing, x, z, tile), materials.wallStone);
      const arch = archPoints(x, naveBayLine(index + 1), x, naveBayLine(index), NAVE.aisleSpringY - 0.22, AISLE_RISE, RIB_SEGMENTS);
      for (const geometry of ribGeometries(arch, 0.9, 0.44)) batch.add(geometry, materials.dressedStone);
      batch.add(roundPaneGeometry(1.15, facing, x - side * 0.03, oculusY, z), materials.glassRose);
    }
  }
}

/** One lancet per bay in each side wall: warm glass towards the moon, cool away from it. */
function addAisleWindows(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  const { width, sillY, shoulderY, apexY } = LANCET.aisle;
  for (const side of SIDES) {
    const x = side * (NAVE.maxX - 0.02);
    for (let index = 0; index < NAVE.bays; index++) {
      const z = naveBayCenter(index);
      const lancet = lancetShape(width, sillY, shoulderY, apexY, RIB_SEGMENTS);
      batch.add(wallShapeGeometry(lancet, side > 0 ? 'nx' : 'px', x, z), side > 0 ? materials.glassWarm : materials.glassCool);
      batch.addBox(materials.dressedStone, side * (NAVE.maxX - 0.1), sillY - 0.09, z, 0.2, 0.18, width + 0.4, 0, 0, 0, index);
    }
  }
}

/** Both end walls: the great doors under the front's rose, and the great rose over the chancel arch. */
function addEndWallDressing(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  addGreatDoorFace(context, NAVE.maxZ, 'nz');
  const front = ROSE_WINDOWS.front;
  batch.add(roundPaneGeometry(front.radius, 'nz', 0, front.y, NAVE.maxZ - 0.03), materials.glassRose);
  batch.add(roseRingGeometry(front.radius, 'nz', 0, front.y, NAVE.maxZ - 0.05), materials.dressedStone);

  const great = ROSE_WINDOWS.chancel;
  batch.add(roundPaneGeometry(great.radius, 'pz', 0, great.y, NAVE.minZ + 0.03), materials.glassRose);
  batch.add(roseRingGeometry(great.radius, 'pz', 0, great.y, NAVE.minZ + 0.05), materials.dressedStone);

  // The chancel arch: stone fills the square hole in the wall down to the pointed line.
  const halfSpan = (CHANCEL.maxX - CHANCEL.minX) / 2;
  const rise = CHANCEL.apexY - CHANCEL.springY;
  const spandrel = archSpandrelShape(halfSpan, CHANCEL.springY, rise, CHANCEL.apexY + 0.05, RIB_SEGMENTS);
  batch.add(wallShapeGeometry(spandrel, 'pz', 0, NAVE.minZ + 0.01, materials.wallStone.userData.metersPerTile as number), materials.wallStone);
  const arch = archPoints(-halfSpan, NAVE.minZ - HALF_WALL, halfSpan, NAVE.minZ - HALF_WALL, CHANCEL.springY - 0.25, rise, RIB_SEGMENTS);
  for (const geometry of ribGeometries(arch, 0.7, 0.5)) batch.add(geometry, materials.dressedStone);
  for (const side of SIDES) {
    batch.addBox(materials.dressedStone, side * (halfSpan - 0.02), CHANCEL.springY / 2, NAVE.minZ - HALF_WALL, 0.24, CHANCEL.springY, 0.7, 0, 0, 0, side);
  }
}
