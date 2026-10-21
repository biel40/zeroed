import * as THREE from 'three';
import { wallSpans, type WallAxis, type WallOpening } from '../shared/ArenaStructure';
import {
  ESCALATOR_PORTAL,
  STATION33_BARRIERS,
  STATION33_OPENINGS,
  STATION33_WALL_THICKNESS,
  VESTIBULE,
} from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import { MURAL_LAYOUT, muralUv } from './Station33Signage';
import { VAULT_CENTER_Y, VAULT_HALF_ANGLE, VAULT_RADIUS, vaultHeightAt } from './VaultProfile';

const HALF_THICKNESS = STATION33_WALL_THICKNESS / 2;
const DADO_HEIGHT = 1.1;
const CORNICE_Y = 3.78;
/** Transverse ribs of the vault line up with the column rows. */
const RIB_ZS = [4.5, 9, 13.5] as const;

interface WallLine {
  readonly axis: WallAxis;
  readonly fixed: number;
  readonly min: number;
  readonly max: number;
  /** +1/-1: the hall side of the wall along its normal axis. */
  readonly inward: number;
  readonly openings: ReadonlyArray<WallOpening>;
}

function barrierOpenings(axis: WallAxis, fixed: number): WallOpening[] {
  return STATION33_BARRIERS
    .filter((barrier) => (axis === 'z' ? barrier.x : barrier.z) === fixed)
    .map((barrier) => ({ center: axis === 'z' ? barrier.z : barrier.x, ...STATION33_OPENINGS[barrier.kind] }));
}

/** The four walls of the hall. Side walls run past the corners to close them. */
export function vestibuleWalls(): ReadonlyArray<WallLine> {
  const west = VESTIBULE.minX - HALF_THICKNESS;
  const east = VESTIBULE.maxX + HALF_THICKNESS;
  const north = VESTIBULE.minZ - HALF_THICKNESS;
  const south = VESTIBULE.maxZ + HALF_THICKNESS;
  const outerMinZ = VESTIBULE.minZ - STATION33_WALL_THICKNESS;
  const outerMaxZ = VESTIBULE.maxZ + STATION33_WALL_THICKNESS;
  return [
    { axis: 'z', fixed: west, min: outerMinZ, max: outerMaxZ, inward: 1, openings: barrierOpenings('z', west) },
    { axis: 'z', fixed: east, min: outerMinZ, max: outerMaxZ, inward: -1, openings: barrierOpenings('z', east) },
    {
      axis: 'x',
      fixed: north,
      min: VESTIBULE.minX,
      max: VESTIBULE.maxX,
      inward: 1,
      openings: [{ center: ESCALATOR_PORTAL.centerX, width: ESCALATOR_PORTAL.width, bottom: 0, top: ESCALATOR_PORTAL.height }],
    },
    { axis: 'x', fixed: south, min: VESTIBULE.minX, max: VESTIBULE.maxX, inward: -1, openings: barrierOpenings('x', south) },
  ];
}

/**
 * Floor, marble walls with their granite dado, cornice, the shallow barrel
 * vault with its ribs, the end lunettes and the mosaic above the escalator.
 */
export function buildVestibuleShell(context: Station33BuildContext): void {
  const { structure, materials } = context;
  const centerX = (VESTIBULE.minX + VESTIBULE.maxX) / 2;
  const centerZ = (VESTIBULE.minZ + VESTIBULE.maxZ) / 2;
  const width = VESTIBULE.maxX - VESTIBULE.minX;
  const depth = VESTIBULE.maxZ - VESTIBULE.minZ;
  structure.addBox(centerX, -0.08, centerZ, width + 0.6, 0.16, depth + 0.6, materials.floorGranite, {
    name: 'vestibule-floor', surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: 1, blocksPlayer: false,
  });

  let seed = 10;
  for (const wall of vestibuleWalls()) {
    structure.addWallWithOpenings(
      wall.axis, wall.fixed, wall.min, wall.max, 0, VESTIBULE.wallHeight, STATION33_WALL_THICKNESS,
      wall.openings, materials.wallMarble,
      { surface: 'concrete', mapRole: 'wall', castShadow: !context.profile.useReducedEffects, uvSeed: seed, blocksPlayer: true },
    );
    seed += 7;
    addDado(context, wall);
  }
  addCornices(context);
  addVault(context);
  addLunette(context, VESTIBULE.minZ, 1);
  addLunette(context, VESTIBULE.maxZ, -1);
  addMural(context);
}

/** Polished dark granite skirting on the hall face of every solid wall stretch. */
function addDado(context: Station33BuildContext, wall: WallLine): void {
  const face = wall.fixed + wall.inward * (HALF_THICKNESS + 0.02);
  const min = Math.max(wall.min, wall.axis === 'z' ? VESTIBULE.minZ : VESTIBULE.minX);
  const max = Math.min(wall.max, wall.axis === 'z' ? VESTIBULE.maxZ : VESTIBULE.maxX);
  for (const [from, to] of wallSpans(min, max, wall.openings)) {
    const along = (from + to) / 2;
    const length = to - from;
    if (wall.axis === 'z') context.batch.addBox(context.materials.darkGranite, face, DADO_HEIGHT / 2, along, 0.04, DADO_HEIGHT, length, 0, 0, 0, along);
    else context.batch.addBox(context.materials.darkGranite, along, DADO_HEIGHT / 2, face, length, DADO_HEIGHT, 0.04, 0, 0, 0, along);
    // Bronze rail capping the granite.
    if (wall.axis === 'z') context.batch.addBox(context.materials.bronze, face, DADO_HEIGHT, along, 0.06, 0.04, length);
    else context.batch.addBox(context.materials.bronze, along, DADO_HEIGHT, face, length, 0.04, 0.06);
  }
}

/** Stepped stucco cornice where the vault springs from the side walls. */
function addCornices(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const length = VESTIBULE.maxZ - VESTIBULE.minZ;
  const centerZ = (VESTIBULE.minZ + VESTIBULE.maxZ) / 2;
  for (const side of [-1, 1]) {
    const face = side < 0 ? VESTIBULE.minX : VESTIBULE.maxX;
    batch.addBox(materials.stucco, face - side * 0.09, CORNICE_Y, centerZ, 0.18, 0.14, length);
    batch.addBox(materials.stucco, face - side * 0.17, CORNICE_Y + 0.11, centerZ, 0.34, 0.08, length);
    batch.addBox(materials.stucco, face - side * 0.05, CORNICE_Y - 0.12, centerZ, 0.1, 0.1, length);
  }
}

function addVault(context: Station33BuildContext): void {
  const { materials, structure, group } = context;
  const length = VESTIBULE.maxZ - VESTIBULE.minZ + 0.3;
  const centerZ = (VESTIBULE.minZ + VESTIBULE.maxZ) / 2;
  // Cylinder axis Y turned onto Z; theta = PI points straight up after the turn.
  const geometry = new THREE.CylinderGeometry(
    VAULT_RADIUS, VAULT_RADIUS, length, 32, 1, true, Math.PI - VAULT_HALF_ANGLE, VAULT_HALF_ANGLE * 2,
  );
  geometry.rotateX(Math.PI / 2);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const arcLength = VAULT_RADIUS * VAULT_HALF_ANGLE * 2;
  const metersPerTile = materials.vaultPlaster.userData.metersPerTile as number;
  for (let index = 0; index < uv.count; index++) {
    uv.setXY(index, uv.getX(index) * arcLength / metersPerTile, uv.getY(index) * length / metersPerTile);
  }
  const vault = new THREE.Mesh(geometry, materials.vaultPlaster);
  vault.position.set(0, VAULT_CENTER_Y, centerZ);
  vault.name = 'vestibule-vault';
  vault.receiveShadow = true;
  vault.userData.surface = 'concrete';
  vault.userData.mapRole = 'ceiling';
  group.add(vault);
  structure.addSolid(vault, false);

  for (const z of RIB_ZS) {
    const rib = new THREE.ExtrudeGeometry(vaultBand(0.16), { depth: 0.34, bevelEnabled: false, curveSegments: 24 });
    rib.translate(0, 0, z - 0.17);
    context.batch.add(rib, materials.stucco);
  }
}

/** Annular strip hugging the vault's underside, `thickness` deep, in the XY plane. */
function vaultBand(thickness: number): THREE.Shape {
  const shape = new THREE.Shape();
  const start = Math.PI / 2 + VAULT_HALF_ANGLE;
  const end = Math.PI / 2 - VAULT_HALF_ANGLE;
  shape.absarc(0, VAULT_CENTER_Y, VAULT_RADIUS, start, end, true);
  shape.absarc(0, VAULT_CENTER_Y, VAULT_RADIUS - thickness, end, start, false);
  shape.closePath();
  return shape;
}

/** Plaster infill between an end wall's top and the vault. */
function addLunette(context: Station33BuildContext, z: number, facing: number): void {
  const shape = new THREE.Shape();
  shape.moveTo(VESTIBULE.minX, VESTIBULE.wallHeight);
  shape.absarc(0, VAULT_CENTER_Y, VAULT_RADIUS, Math.PI / 2 + VAULT_HALF_ANGLE, Math.PI / 2 - VAULT_HALF_ANGLE, true);
  shape.lineTo(VESTIBULE.minX, VESTIBULE.wallHeight);
  const geometry = new THREE.ShapeGeometry(shape, 24);
  // Shape UVs are raw metres: rescale them to the plaster's tile size.
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const metersPerTile = context.materials.vaultPlaster.userData.metersPerTile as number;
  for (let index = 0; index < uv.count; index++) uv.setXY(index, uv.getX(index) / metersPerTile, uv.getY(index) / metersPerTile);
  if (facing < 0) geometry.rotateY(Math.PI);
  const lunette = new THREE.Mesh(geometry, context.materials.vaultPlaster);
  lunette.position.z = z;
  lunette.name = facing > 0 ? 'north-lunette' : 'south-lunette';
  lunette.userData.surface = 'concrete';
  lunette.userData.mapRole = 'lunette';
  context.group.add(lunette);
  context.structure.addSolid(lunette, false);
}

/** Smalt mosaic over the escalator portal, its top following the vault. */
function addMural(context: Station33BuildContext): void {
  const { halfWidth, bottomY } = MURAL_LAYOUT;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth, bottomY);
  shape.lineTo(halfWidth, bottomY);
  const samples = 24;
  for (let step = 0; step <= samples; step++) {
    const x = halfWidth - (halfWidth * 2 * step) / samples;
    shape.lineTo(x, vaultHeightAt(x) - 0.08);
  }
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let index = 0; index < uv.count; index++) {
    const [u, v] = muralUv(position.getX(index), position.getY(index));
    uv.setXY(index, u, v);
  }
  const mural = new THREE.Mesh(geometry, context.signage.muralMaterial);
  mural.position.z = VESTIBULE.minZ + 0.025;
  mural.name = 'escalator-mural';
  mural.userData.mapRole = 'mural';
  context.group.add(mural);
  context.batch.addBox(context.materials.bronze, 0, bottomY - 0.02, VESTIBULE.minZ + 0.04, halfWidth * 2 + 0.1, 0.06, 0.06);
}
