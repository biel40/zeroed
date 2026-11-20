import * as THREE from 'three';
import {
  CATACOMB_FLOOR_Y,
  GALLERIES,
  GALLERY_CANDLE_LEDGES,
  GALLERY_LEDGE_HEIGHT,
  GALLERY_LEDGE_REACH,
  NICHE_BLOCKS,
} from '../../DieKathedraleCatacombsConfig';
import type { FloorRect } from '../../DieKathedraleConfig';
import { seededRandom } from '../../shared/ProceduralNoise';
import { addSolidProxy } from '../../shared/SolidProxy';
import { cobwebGeometry } from '../CobwebTexture';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { addBones, addCandleCluster, addFloorStain, addHangingRoot, addRubble, addSkull, addWallStain } from './CatacombDecor';

const FLOOR = CATACOMB_FLOOR_Y;
/** Loculi rows: sill, three tiers of niches with their shelves, and a band up to the vault. */
const LOCULUS = { sill: 0.3, height: 0.55, shelf: 0.2, depth: 0.55, width: 1.55, rows: 3 } as const;
const BLOCK_TOP = GALLERIES.apexY;

/** What a loculus holds. */
type LoculusState = 'sealed' | 'bones' | 'broken' | 'empty';

/** A face of a burial block: the line it stands on and the way it looks. */
interface BlockFace {
  readonly axis: 'x' | 'z';
  /** Plane of the face on the other axis. */
  readonly fixed: number;
  readonly min: number;
  readonly max: number;
  readonly facing: -1 | 1;
}

/**
 * The galleries of the forgotten: two solid burial blocks with tiers of
 * loculi on every face (sealed with cracked plaques, open on bones, or
 * broken and spilled), plaques and crosses on the outer walls, two stone
 * coffins in the west corridor, one of them opened, roots, webs, damp and
 * the candles on their corbels.
 */
export function buildBurialGalleries(context: DieKathedraleBuildContext): void {
  const random = seededRandom(7201);
  for (const block of NICHE_BLOCKS) addNicheBlock(context, block, random);
  addOuterWallPlaques(context, random);
  addCoffins(context, random);
  addCandleLedges(context, random);
  addDecay(context, random);
}

function blockFaces(block: FloorRect): BlockFace[] {
  return [
    { axis: 'z', fixed: block.minX, min: block.minZ, max: block.maxZ, facing: -1 },
    { axis: 'z', fixed: block.maxX, min: block.minZ, max: block.maxZ, facing: 1 },
    { axis: 'x', fixed: block.minZ, min: block.minX, max: block.maxX, facing: -1 },
    { axis: 'x', fixed: block.maxZ, min: block.minX, max: block.maxX, facing: 1 },
  ];
}

/** World point at `along` on a face, `out` metres in front of it (negative: into the block). */
function facePoint(face: BlockFace, along: number, out: number): { x: number; z: number } {
  return face.axis === 'z'
    ? { x: face.fixed + face.facing * out, z: along }
    : { x: along, z: face.fixed + face.facing * out };
}

/** World box size for extents along a face, across it (depth) and up. */
function faceBox(face: BlockFace, along: number, depth: number): { width: number; depth: number } {
  return face.axis === 'z' ? { width: depth, depth: along } : { width: along, depth };
}

/** One solid for the whole block; its faces are built of piers and shelves round dark loculi. */
function addNicheBlock(context: DieKathedraleBuildContext, block: FloorRect & { readonly id: string }, random: () => number): void {
  const { batch, materials } = context;
  addSolidProxy(context, block.id, { x: block.minX, y: FLOOR, z: block.minZ }, { x: block.maxX, y: FLOOR + BLOCK_TOP, z: block.maxZ }, 'concrete', 'none');
  // The core behind the loculi, never seen but for its top edge.
  const inset = LOCULUS.depth;
  batch.addBox(materials.cavity, (block.minX + block.maxX) / 2, FLOOR + BLOCK_TOP / 2, (block.minZ + block.maxZ) / 2,
    block.maxX - block.minX - inset * 2 + 0.02, BLOCK_TOP, block.maxZ - block.minZ - inset * 2 + 0.02);
  for (const face of blockFaces(block)) addLoculiFace(context, face, random);
}

function addLoculiFace(context: DieKathedraleBuildContext, face: BlockFace, random: () => number): void {
  const { batch, materials } = context;
  const length = face.max - face.min;
  const count = Math.max(1, Math.floor(length / (LOCULUS.width + 0.2)));
  const pier = (length - count * LOCULUS.width) / (count + 1);
  const middle = (face.min + face.max) / 2;
  const bandDepth = LOCULUS.depth;
  // Horizontal bands: the sill, a shelf between every tier, the band up to the vault.
  const bands: Array<readonly [number, number]> = [[0, LOCULUS.sill]];
  for (let row = 0; row < LOCULUS.rows; row++) {
    const bottom = LOCULUS.sill + row * (LOCULUS.height + LOCULUS.shelf);
    const top = bottom + LOCULUS.height;
    bands.push([top, row === LOCULUS.rows - 1 ? BLOCK_TOP : top + LOCULUS.shelf]);
  }
  const bandCenter = facePoint(face, middle, -bandDepth / 2);
  for (const [bottom, top] of bands) {
    const size = faceBox(face, length, bandDepth);
    batch.addBox(materials.cryptStone, bandCenter.x, FLOOR + (bottom + top) / 2, bandCenter.z, size.width, top - bottom, size.depth, 0, 0, 0, Math.round(bottom * 10));
  }
  const tiersTop = LOCULUS.sill + LOCULUS.rows * LOCULUS.height + (LOCULUS.rows - 1) * LOCULUS.shelf;
  for (let column = 0; column <= count; column++) {
    const along = face.min + column * (pier + LOCULUS.width) + pier / 2;
    const center = facePoint(face, along, -bandDepth / 2);
    const size = faceBox(face, pier, bandDepth);
    batch.addBox(materials.cryptStone, center.x, FLOOR + (LOCULUS.sill + tiersTop) / 2, center.z, size.width, tiersTop - LOCULUS.sill, size.depth, 0, 0, 0, column);
  }
  for (let column = 0; column < count; column++) {
    const along = face.min + pier + column * (pier + LOCULUS.width) + LOCULUS.width / 2;
    for (let row = 0; row < LOCULUS.rows; row++) {
      const bottom = LOCULUS.sill + row * (LOCULUS.height + LOCULUS.shelf);
      fillLoculus(context, face, along, bottom, pickState(random), random);
    }
  }
}

function pickState(random: () => number): LoculusState {
  const roll = random();
  if (roll < 0.36) return 'sealed';
  if (roll < 0.68) return 'bones';
  if (roll < 0.84) return 'broken';
  return 'empty';
}

/** What lies in one loculus, from the face inwards. */
function fillLoculus(context: DieKathedraleBuildContext, face: BlockFace, along: number, bottom: number, state: LoculusState, random: () => number): void {
  const { batch, materials } = context;
  const yaw = face.axis === 'z' ? (face.facing > 0 ? Math.PI / 2 : -Math.PI / 2) : (face.facing > 0 ? 0 : Math.PI);
  const floorY = FLOOR + bottom;
  if (state === 'sealed' || state === 'broken') {
    // A plaque flush with the face; broken ones keep one shard, cracked ones a dark seam.
    const widthShare = state === 'broken' ? 0.35 + random() * 0.2 : 1;
    const plaqueWidth = LOCULUS.width * widthShare;
    const offset = state === 'broken' ? (LOCULUS.width - plaqueWidth) / 2 * (random() < 0.5 ? -1 : 1) : 0;
    const center = facePoint(face, along + offset, -0.03);
    const size = faceBox(face, plaqueWidth, 0.06);
    batch.addBox(materials.dressedStone, center.x, floorY + LOCULUS.height / 2, center.z, size.width, LOCULUS.height, size.depth, 0, 0, (random() - 0.5) * 0.02);
    if (state === 'sealed') {
      // Two worn lines of an inscription and, now and then, a crack.
      for (const line of [0.36, 0.22]) {
        const groove = facePoint(face, along, 0.002);
        const grooveSize = faceBox(face, LOCULUS.width * (0.4 + random() * 0.3), 0.01);
        batch.addBox(materials.cavity, groove.x, floorY + LOCULUS.height * line + 0.1, groove.z, grooveSize.width, 0.025, grooveSize.depth);
      }
      if (random() < 0.4) {
        const crack = facePoint(face, along + (random() - 0.5) * 0.8, 0.003);
        const crackSize = faceBox(face, 0.025, 0.01);
        batch.addBox(materials.cavity, crack.x, floorY + LOCULUS.height / 2, crack.z, crackSize.width, LOCULUS.height * 0.9, crackSize.depth, 0, 0, 0);
      }
      return;
    }
    // The rest of the plaque lies broken below, with what came out with it.
    const spill = facePoint(face, along, 0.45);
    addRubble(batch, materials, spill.x, FLOOR, spill.z, 4, 0.7, random);
    if (random() < 0.6) addBones(batch, materials, spill.x, FLOOR, spill.z, 2, 0.6, random);
  }
  if (state === 'empty') return;
  // Remains lying the length of the loculus, the skull at one end.
  const inside = facePoint(face, along, -LOCULUS.depth * 0.45);
  addBones(batch, materials, inside.x, floorY, inside.z, 2 + Math.floor(random() * 2), 0.5, random);
  const skullAt = facePoint(face, along + (random() < 0.5 ? -1 : 1) * LOCULUS.width * 0.32, -LOCULUS.depth * 0.4);
  if (random() < 0.85) addSkull(batch, materials, skullAt.x, floorY, skullAt.z, yaw + (random() - 0.5) * 1.2, (random() - 0.5) * 0.4);
}

/** Sealed loculi set into the outer walls and a few carved crosses, between the corbels and the gates. */
function addOuterWallPlaques(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  const plaques: ReadonlyArray<readonly [number, number, number, number]> = [
    // x, z, facingX, facingZ
    [GALLERIES.minX, -70.2, 1, 0], [GALLERIES.minX, -78.8, 1, 0],
    [-27.2, GALLERIES.minZ, 0, 1], [-14.4, GALLERIES.minZ, 0, 1], [-11.2, GALLERIES.minZ, 0, 1],
    [-26.6, GALLERIES.maxZ, 0, -1], [-20.4, GALLERIES.maxZ, 0, -1],
  ];
  for (const [x, z, facingX, facingZ] of plaques) {
    const yaw = Math.atan2(facingX, facingZ);
    for (let tier = 0; tier < 2; tier++) {
      const y = FLOOR + 0.9 + tier * 0.95 + (random() - 0.5) * 0.08;
      batch.addBox(materials.dressedStone, x + facingX * 0.025, y, z + facingZ * 0.025, 1.4, 0.55, 0.05, 0, yaw, (random() - 0.5) * 0.03);
      batch.addBox(materials.cavity, x + facingX * 0.052, y + 0.08, z + facingZ * 0.052, 0.8 + random() * 0.3, 0.025, 0.01, 0, yaw, 0);
    }
    // A cross scratched over the upper plaque.
    batch.addBox(materials.cavity, x + facingX * 0.012, FLOOR + 2.55, z + facingZ * 0.012, 0.04, 0.32, 0.01, 0, yaw, 0);
    batch.addBox(materials.cavity, x + facingX * 0.012, FLOOR + 2.6, z + facingZ * 0.012, 0.2, 0.04, 0.01, 0, yaw, 0);
  }
}

/** Two stone coffins along the west corridor's outer wall: one shut, one with its lid shoved half off and empty bones inside. */
function addCoffins(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  const coffins = [{ z: -70.6, open: false }, { z: -77.4, open: true }] as const;
  const x = GALLERIES.minX + 0.45;
  for (const coffin of coffins) {
    const length = 2.1;
    const width = 0.7;
    const height = 0.62;
    batch.addBox(materials.cryptStone, x, FLOOR + height / 2, coffin.z, width, height, length, 0, 0, 0, 7);
    batch.addBox(materials.cavity, x, FLOOR + height - 0.01, coffin.z, width - 0.16, 0.02, length - 0.16);
    if (coffin.open) {
      batch.addBox(materials.dressedStone, x + 0.3, FLOOR + height + 0.08, coffin.z - 0.5, width + 0.06, 0.12, length + 0.04, 0.05, 0.42, 0.18);
      addBones(batch, materials, x, FLOOR + height - 0.25, coffin.z + 0.35, 3, 0.4, random);
      addSkull(batch, materials, x + 0.05, FLOOR + height - 0.24, coffin.z + 0.82, Math.PI * 0.7);
    } else {
      batch.addBox(materials.dressedStone, x, FLOOR + height + 0.06, coffin.z, width + 0.06, 0.12, length + 0.04, 0, 0, 0, 9);
    }
    addSolidProxy(context, `gallery-coffin-${coffin.z}`, { x: x - width / 2, y: FLOOR, z: coffin.z - length / 2 }, { x: x + width / 2 + (coffin.open ? 0.35 : 0), y: FLOOR + height + 0.14, z: coffin.z + length / 2 }, 'concrete', coffin.open ? 'none' : 'top');
  }
}

/** A stone corbel under every candle site of the galleries, with its melted candles and the drips below. */
function addCandleLedges(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  for (const ledge of GALLERY_CANDLE_LEDGES) {
    const yaw = Math.atan2(ledge.facingX, ledge.facingZ);
    const out = GALLERY_LEDGE_REACH;
    batch.addBox(materials.dressedStone, ledge.x + ledge.facingX * out / 2, FLOOR + GALLERY_LEDGE_HEIGHT - 0.07, ledge.z + ledge.facingZ * out / 2, 0.6, 0.14, out + 0.04, 0, yaw, 0);
    batch.addBox(materials.dressedStone, ledge.x + ledge.facingX * out / 3, FLOOR + GALLERY_LEDGE_HEIGHT - 0.24, ledge.z + ledge.facingZ * out / 3, 0.3, 0.22, out * 0.66, 0, yaw, 0);
    addCandleCluster(context, ledge.x + ledge.facingX * out, FLOOR + GALLERY_LEDGE_HEIGHT, ledge.z + ledge.facingZ * out, 4 + Math.floor(random() * 3), 0.2, random);
    // Wax run down the wall and pooled on the floor.
    addWallStain(batch, materials, ledge.x, FLOOR + 0.2, ledge.z, ledge.facingX, ledge.facingZ, 0.3, 1.2);
    batch.add(new THREE.CylinderGeometry(0.12, 0.16, 0.02, 8).translate(ledge.x + ledge.facingX * 0.25, FLOOR + 0.01, ledge.z + ledge.facingZ * 0.25), materials.wax);
  }
}

/** Roots through the vault, webs in the corners, damp on walls and floor. */
function addDecay(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  const top = FLOOR + GALLERIES.springY + 0.4;
  const roots: ReadonlyArray<readonly [number, number, number, number]> = [
    [GALLERIES.minX, -72.6, 1, 0], [GALLERIES.minX, -81.2, 1, 0], [-22.8, GALLERIES.minZ, 0, 1], [-9.2, GALLERIES.maxZ, 0, -1], [GALLERIES.maxX, -70.4, -1, 0],
  ];
  for (const [x, z, facingX, facingZ] of roots) addHangingRoot(batch, materials, x, top, z, facingX, facingZ, 1.4 + random() * 1.1, random);
  const corners: ReadonlyArray<readonly [number, number, number, number]> = [
    [GALLERIES.minX, GALLERIES.maxZ, 1, -1], [GALLERIES.minX, GALLERIES.minZ, 1, 1], [GALLERIES.maxX, GALLERIES.minZ, -1, 1],
  ];
  for (const [x, z, towardX, towardZ] of corners) {
    batch.add(cobwebGeometry({ x: x + towardX * 0.02, y: FLOOR + GALLERIES.springY, z: z + towardZ * 0.02 }, towardX, towardZ, 1.3), materials.cobweb);
  }
  const stains: ReadonlyArray<readonly [number, number, number, number]> = [
    [GALLERIES.minX, -67.8, 1, 0], [GALLERIES.minX, -75.6, 1, 0], [-16, GALLERIES.minZ, 0, 1], [-28.6, GALLERIES.maxZ, 0, -1], [GALLERIES.maxX, -66.6, -1, 0],
  ];
  for (const [x, z, facingX, facingZ] of stains) {
    addWallStain(batch, materials, x, FLOOR, z, facingX, facingZ, 1.4 + random() * 1.2, 1.4 + random() * 1.3);
  }
  for (let patch = 0; patch < 7; patch++) {
    const x = THREE.MathUtils.lerp(GALLERIES.minX + 1, GALLERIES.maxX - 1, random());
    const z = random() < 0.5 ? THREE.MathUtils.lerp(-68, -65.6, random()) : THREE.MathUtils.lerp(-82.2, -79.6, random());
    addFloorStain(batch, materials, x, FLOOR, z, 1.5 + random() * 1.5, 1 + random(), random() * Math.PI);
  }
}
