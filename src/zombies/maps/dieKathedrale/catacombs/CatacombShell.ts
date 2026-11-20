import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  BREATH_PASSAGE,
  CATACOMB_FLOOR_Y,
  CATACOMB_ROOMS,
  CATACOMB_WALLS,
  CATACOMB_WALL_THICKNESS,
  CRYPT_LANDING,
  GALLERY_CORRIDORS,
  GALLERIES,
  OSSUARY_PASSAGE,
  PANTHEON,
  RELIQUARY,
  type CatacombVaultedRoom,
} from '../../DieKathedraleCatacombsConfig';
import { CATACOMB_WALL_CUTS, type FloorRect } from '../../DieKathedraleConfig';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { addStoneWall } from '../DieKathedraleWalls';
import { archPoints, ribGeometries, ribVaultGeometry, type VaultBay } from '../GothicVault';

const VAULT_SEGMENTS = 6;
/** The ribs follow the vault in fewer, longer pieces: at this size the facets do not show. */
const RIB_SEGMENTS = 4;
const RIB = { width: 0.16, depth: 0.2 } as const;

/**
 * Bare shell of the catacombs: a slab under every room, every wall line of
 * `CATACOMB_WALLS` in load-bearing pieces cut by its gates and entrances,
 * and low rib vaults over the stair's landing, the galleries' corridors,
 * the pantheon, the reliquary and both passages. Each vault merges into one
 * mesh that also takes the bullets. The shrine's round wall and dome belong
 * to its own builder.
 */
export function buildCatacombShell(context: DieKathedraleBuildContext): void {
  addFloors(context);
  addWalls(context);
  addVault(context, 'landing-vault', splitIntoBays(CRYPT_LANDING, CRYPT_LANDING, 1, 1));
  addVault(context, 'galleries-vault', GALLERY_CORRIDORS.flatMap((corridor) => corridorBays(corridor, GALLERIES)));
  addVault(context, 'pantheon-vault', splitIntoBays(PANTHEON, PANTHEON, PANTHEON.bays, PANTHEON.bays));
  addVault(context, 'reliquary-vault', splitIntoBays(RELIQUARY, RELIQUARY, 2, 1));
  addVault(context, 'breath-passage-vault', splitIntoBays(BREATH_PASSAGE, BREATH_PASSAGE, 3, 1));
  addVault(context, 'ossuary-passage-vault', splitIntoBays(OSSUARY_PASSAGE, OSSUARY_PASSAGE, 1, 1));
}

/** World-height vault bays tiling `rect` in `countX` by `countZ`, at the heights of `room`. */
function splitIntoBays(rect: FloorRect, room: CatacombVaultedRoom, countX: number, countZ: number): VaultBay[] {
  const width = (rect.maxX - rect.minX) / countX;
  const depth = (rect.maxZ - rect.minZ) / countZ;
  const bays: VaultBay[] = [];
  for (let column = 0; column < countX; column++) {
    for (let row = 0; row < countZ; row++) {
      bays.push({
        minX: rect.minX + column * width,
        maxX: rect.minX + (column + 1) * width,
        minZ: rect.minZ + row * depth,
        maxZ: rect.minZ + (row + 1) * depth,
        springY: CATACOMB_FLOOR_Y + room.springY,
        apexY: CATACOMB_FLOOR_Y + room.apexY,
      });
    }
  }
  return bays;
}

/** Bays as square as possible along a corridor's length. */
function corridorBays(corridor: FloorRect, room: CatacombVaultedRoom): VaultBay[] {
  const width = corridor.maxX - corridor.minX;
  const depth = corridor.maxZ - corridor.minZ;
  return width >= depth
    ? splitIntoBays(corridor, room, Math.max(1, Math.round(width / depth)), 1)
    : splitIntoBays(corridor, room, 1, Math.max(1, Math.round(depth / width)));
}

function addFloors(context: DieKathedraleBuildContext): void {
  const { structure, materials } = context;
  Object.entries(CATACOMB_ROOMS).forEach(([name, room], index) => {
    const margin = CATACOMB_WALL_THICKNESS;
    structure.addBox(
      (room.minX + room.maxX) / 2, CATACOMB_FLOOR_Y - 0.08, (room.minZ + room.maxZ) / 2,
      room.maxX - room.minX + margin * 2, 0.16, room.maxZ - room.minZ + margin * 2,
      materials.cryptFloor,
      { name: `catacomb-${name}-floor`, surface: 'concrete', mapRole: 'slab', castShadow: false, uvSeed: 40 + index, worldUVs: true, blocksPlayer: false },
    );
  });
}

function addWalls(context: DieKathedraleBuildContext): void {
  for (const wall of CATACOMB_WALLS) {
    addStoneWall(context, `catacomb-${wall.id}`, {
      axis: wall.axis,
      fixed: wall.fixed,
      min: wall.min,
      max: wall.max,
      height: wall.height,
      breaks: wall.breaks,
      extraOpenings: wall.extraOpenings,
      baseY: CATACOMB_FLOOR_Y,
      thickness: CATACOMB_WALL_THICKNESS,
      cuts: CATACOMB_WALL_CUTS,
      // A hidden wall stands behind what is drawn: blood would float in front of nothing.
      stainFaces: wall.hidden ? 'none' : undefined,
    }, wall.hidden ? context.collider : context.materials.cryptStone);
  }
}

/**
 * The webs of every bay merged into one ceiling that also stops bullets,
 * with stone ribs on its groins and on the arches between bays.
 */
function addVault(context: DieKathedraleBuildContext, name: string, bays: ReadonlyArray<VaultBay>): void {
  const { batch, materials, structure, group } = context;
  const tile = materials.cryptStone.userData.metersPerTile as number;
  const webs = bays.map((bay) => ribVaultGeometry(bay, VAULT_SEGMENTS, tile));
  const merged = mergeGeometries(webs);
  for (const web of webs) web.dispose();
  if (!merged) throw new Error(`Unable to merge catacomb vault ${name}`);
  const vault = new THREE.Mesh(merged, materials.cryptStone);
  vault.name = `catacomb-${name}`;
  vault.userData.surface = 'concrete';
  vault.userData.mapRole = 'ceiling';
  vault.userData.stainFaces = 'none';
  group.add(vault);
  structure.addSolid(vault, false);

  for (const bay of bays) {
    const rise = bay.apexY - bay.springY;
    for (const [fromZ, toZ] of [[bay.minZ, bay.maxZ], [bay.maxZ, bay.minZ]] as const) {
      const diagonal = archPoints(bay.minX, fromZ, bay.maxX, toZ, bay.springY - 0.08, rise, RIB_SEGMENTS);
      for (const geometry of ribGeometries(diagonal, RIB.width, RIB.depth)) batch.add(geometry, materials.dressedStone);
    }
    // A transverse arch on the bay's north and west edges, where another bay of the same vault meets it.
    const neighbour = (dx: number, dz: number): boolean => bays.some((other) =>
      Math.abs(other.minX - (bay.minX + dx)) < 1e-6 && Math.abs(other.minZ - (bay.minZ + dz)) < 1e-6
      && Math.abs(other.maxX - (bay.maxX + dx)) < 1e-6 && Math.abs(other.maxZ - (bay.maxZ + dz)) < 1e-6);
    if (neighbour(0, -(bay.maxZ - bay.minZ))) {
      const arch = archPoints(bay.minX, bay.minZ, bay.maxX, bay.minZ, bay.springY - 0.1, rise, RIB_SEGMENTS);
      for (const geometry of ribGeometries(arch, RIB.width * 1.6, RIB.depth * 1.3)) batch.add(geometry, materials.dressedStone);
    }
    if (neighbour(-(bay.maxX - bay.minX), 0)) {
      const arch = archPoints(bay.minX, bay.minZ, bay.minX, bay.maxZ, bay.springY - 0.1, rise, RIB_SEGMENTS);
      for (const geometry of ribGeometries(arch, RIB.width * 1.6, RIB.depth * 1.3)) batch.add(geometry, materials.dressedStone);
    }
  }
}
