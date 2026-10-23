import * as THREE from 'three';
import type { SurfaceType } from '../../../shooting/HitTarget';
import { projectBoxUVs, projectWorldBoxUVs } from './BoxUVs';

export type WallAxis = 'x' | 'z';

export interface ArenaBoxOptions {
  readonly name?: string;
  readonly surface: SurfaceType;
  readonly mapRole: string;
  readonly castShadow: boolean;
  /** Offsets the world-scale UV projection so neighbouring boxes do not repeat. */
  readonly uvSeed: number;
  /**
   * Anchors the texture to world coordinates instead (uvSeed ignored), so
   * patterned surfaces like wallpaper run on across wall pieces.
   */
  readonly worldUVs?: boolean;
  /** Also stops the player through the arena's AABB wall collision. */
  readonly blocksPlayer: boolean;
}

/** A hole in a wall line: `center` runs along the wall axis, heights are relative to its base. */
export interface WallOpening {
  readonly center: number;
  readonly width: number;
  readonly bottom: number;
  readonly top: number;
}

/**
 * World-scale UVs for a box whose material declares
 * `userData.metersPerTile`; materials without it keep their own UVs.
 */
export function projectMaterialUVs(
  geometry: THREE.BoxGeometry,
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  seed: number,
): void {
  const metersPerTile = material.userData.metersPerTile as number | undefined;
  if (!metersPerTile) return;
  projectBoxUVs(geometry, width, height, depth, metersPerTile, (seed * 0.37) % 1, (seed * 0.61) % 1);
}

/** Solid stretches of a wall line between its openings, as [start, end] along the axis. */
export function wallSpans(min: number, max: number, openings: ReadonlyArray<WallOpening>): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = [];
  let cursor = min;
  for (const opening of [...openings].sort((a, b) => a.center - b.center)) {
    const start = opening.center - opening.width / 2;
    if (start > cursor) spans.push([cursor, start]);
    cursor = Math.max(cursor, opening.center + opening.width / 2);
  }
  if (cursor < max) spans.push([cursor, max]);
  return spans;
}

/**
 * Static solids of a map. Every box is a ballistic collider (and, through
 * the zombie obstacle filter, a navigation blocker); `blocksPlayer` boxes
 * also feed the player's AABB wall collision.
 */
export class ArenaStructure {
  /** Meshes hit by ballistics and filtered into zombie obstacles. */
  readonly solids: THREE.Mesh[] = [];
  /** Meshes whose world AABB stops the player. */
  readonly playerBlockers: THREE.Mesh[] = [];

  constructor(private readonly group: THREE.Group) {}

  addBox(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
    options: ArenaBoxOptions,
  ): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const metersPerTile = material.userData.metersPerTile as number | undefined;
    if (options.worldUVs && metersPerTile) projectWorldBoxUVs(geometry, x, y, z, metersPerTile);
    else projectMaterialUVs(geometry, width, height, depth, material, options.uvSeed);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (options.name) mesh.name = options.name;
    mesh.castShadow = options.castShadow;
    mesh.receiveShadow = true;
    mesh.userData.surface = options.surface;
    mesh.userData.mapRole = options.mapRole;
    this.addSolid(mesh, options.blocksPlayer);
    this.group.add(mesh);
    return mesh;
  }

  /** Registers an already placed mesh (e.g. an invisible proxy) as a solid. */
  addSolid(mesh: THREE.Mesh, blocksPlayer: boolean): void {
    this.solids.push(mesh);
    if (blocksPlayer) this.playerBlockers.push(mesh);
  }

  /**
   * A straight wall of `thickness` centred on `fixed`, from `min` to `max`
   * along `axis`, with full-height pieces between openings and a sill and
   * lintel around each one.
   */
  addWallWithOpenings(
    axis: WallAxis,
    fixed: number,
    min: number,
    max: number,
    baseY: number,
    height: number,
    thickness: number,
    openings: ReadonlyArray<WallOpening>,
    material: THREE.Material,
    options: ArenaBoxOptions,
  ): void {
    let seed = options.uvSeed;
    const piece = (from: number, to: number, bottom: number, top: number): void => {
      if (to - from <= 0.01 || top - bottom <= 0.01) return;
      const along = (from + to) / 2;
      const length = to - from;
      const y = baseY + (bottom + top) / 2;
      const pieceOptions = { ...options, uvSeed: seed++ };
      if (axis === 'x') this.addBox(along, y, fixed, length, top - bottom, thickness, material, pieceOptions);
      else this.addBox(fixed, y, along, thickness, top - bottom, length, material, pieceOptions);
    };
    for (const [from, to] of wallSpans(min, max, openings)) piece(from, to, 0, height);
    for (const opening of openings) {
      const from = opening.center - opening.width / 2;
      const to = opening.center + opening.width / 2;
      piece(from, to, 0, opening.bottom);
      piece(from, to, opening.top, height);
    }
  }

  playerWallBoxes(): THREE.Box3[] {
    return this.playerBlockers.map((mesh) => new THREE.Box3().setFromObject(mesh));
  }
}
