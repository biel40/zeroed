import * as THREE from 'three';
import type { StainFaces } from '../../GibWalls';
import type { WallAxis, WallOpening } from '../shared/ArenaStructure';
import { wallOpeningsAt, type WallCut } from '../shared/EntrancePassage';
import { DIE_KATHEDRALE_WALL_CUTS, DIE_KATHEDRALE_WALL_THICKNESS } from '../DieKathedraleConfig';
import type { DieKathedraleBuildContext } from './DieKathedraleBuildContext';
import { FACING_YAW, type WallFacing } from './GothicVault';

export interface DieKathedraleWallLine {
  readonly axis: WallAxis;
  /** Centre line of the wall on the other axis. */
  readonly fixed: number;
  readonly min: number;
  readonly max: number;
  readonly height: number;
  /**
   * Where the wall is split into separate solids. Zombies ignore solids
   * longer than 20 m, so no stretch between two breaks may reach that.
   */
  readonly breaks?: ReadonlyArray<number>;
  /** Holes of the wall's own, besides the entrances and doors that fall on it. */
  readonly extraOpenings?: ReadonlyArray<WallOpening>;
  /** Feet height of the floor it stands on (default the cathedral's, 0). */
  readonly baseY?: number;
  /** Default: the cathedral's walls. */
  readonly thickness?: number;
  /** The entrances and doors of its floor (default the cathedral's). */
  readonly cuts?: ReadonlyArray<WallCut>;
  /** Faces that keep blood; omitted, all (a drawn wall). A wall drawn by something else keeps none. */
  readonly stainFaces?: StainFaces;
}

/** Builds a stone wall in pieces, cut by every entrance and door on its line. */
export function addStoneWall(context: DieKathedraleBuildContext, name: string, line: DieKathedraleWallLine, material: THREE.Material = context.materials.wallStone): void {
  const breaks = (line.breaks ?? []).filter((stop) => stop > line.min && stop < line.max).sort((a, b) => a - b);
  const stops = [line.min, ...breaks, line.max];
  const cuts = line.cuts ?? DIE_KATHEDRALE_WALL_CUTS;
  for (let index = 0; index + 1 < stops.length; index++) {
    const from = stops[index];
    const to = stops[index + 1];
    const inPiece = (opening: WallOpening): boolean => opening.center > from && opening.center < to;
    context.structure.addWallWithOpenings(
      line.axis, line.fixed, from, to, line.baseY ?? 0, line.height, line.thickness ?? DIE_KATHEDRALE_WALL_THICKNESS,
      [...wallOpeningsAt(line.axis, line.fixed, from, to, cuts), ...(line.extraOpenings ?? []).filter(inPiece)],
      material,
      { name: `${name}-${index}`, surface: 'concrete', mapRole: 'wall', castShadow: false, uvSeed: index, worldUVs: true, blocksPlayer: true, stainFaces: line.stainFaces },
    );
  }
}

/** A square pane of `radius` looking `facing`, centred on (`x`, `y`, `z`): rose glass cuts its own circle. */
export function roundPaneGeometry(radius: number, facing: WallFacing, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(radius * 2, radius * 2).rotateY(FACING_YAW[facing]).translate(x, y, z);
}

/** Stone ring round a rose window, standing on a wall looking `facing`. */
export function roseRingGeometry(radius: number, facing: WallFacing, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.TorusGeometry(radius, 0.16, 6, 32).rotateY(FACING_YAW[facing]).translate(x, y, z);
}

/** Scales a geometry's UVs so a material's tile keeps its world size on curved pieces. */
export function scaleUVs(geometry: THREE.BufferGeometry, scaleU: number, scaleV: number): THREE.BufferGeometry {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let index = 0; index < uv.count; index++) uv.setXY(index, uv.getX(index) * scaleU, uv.getY(index) * scaleV);
  return geometry;
}
