import * as THREE from 'three';
import type { SurfaceType } from '../../../shooting/HitTarget';
import type { ZombieSpawnPoint } from '../../ZombieSpawner';
import type { ArenaStructure, WallAxis, WallOpening } from './ArenaStructure';

/** A zombie entrance on a wall's centre line, with the normal its zombies come from. */
export interface EntranceSite {
  readonly x: number;
  readonly z: number;
  readonly outwardX: number;
  readonly outwardZ: number;
}

/**
 * Places boxes in an entrance's frame: `along` runs outward from the wall
 * centre line, `across` runs along the wall, `y` is height.
 */
export class EntranceFrame {
  private readonly acrossX: number;
  private readonly acrossZ: number;

  public constructor(private readonly site: EntranceSite) {
    this.acrossX = -site.outwardZ;
    this.acrossZ = site.outwardX;
  }

  public point(along: number, across: number): { x: number; z: number } {
    return {
      x: this.site.x + this.site.outwardX * along + this.acrossX * across,
      z: this.site.z + this.site.outwardZ * along + this.acrossZ * across,
    };
  }

  /** World box size for extents measured along / across the entrance. */
  public size(alongSize: number, acrossSize: number): { width: number; depth: number } {
    return this.site.outwardX !== 0
      ? { width: alongSize, depth: acrossSize }
      : { width: acrossSize, depth: alongSize };
  }
}

export interface EntrancePassageShape {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly wallThickness: number;
}

/**
 * The dead-end passage behind an entrance, where its zombies appear: floor,
 * ceiling, both side walls and the end wall, starting at the wall's outer
 * face. Solid to bullets and zombies; the player never gets in.
 */
export function addEntrancePassageShell(
  structure: ArenaStructure,
  frame: EntranceFrame,
  id: string,
  shape: EntrancePassageShape,
  material: THREE.Material,
  surface: SurfaceType,
): void {
  const { length, width, height, wallThickness } = shape;
  const halfWall = wallThickness / 2;
  const start = halfWall;
  const end = start + length;
  const middle = (start + end) / 2;
  const outerWidth = width + wallThickness * 2;
  const solid = (along: number, across: number, y: number, alongSize: number, acrossSize: number, ySize: number, role: string, seed: number): void => {
    const { x, z } = frame.point(along, across);
    const { width: sizeX, depth: sizeZ } = frame.size(alongSize, acrossSize);
    structure.addBox(x, y, z, sizeX, ySize, sizeZ, material, {
      name: `${id}-${role}`, surface, mapRole: role, castShadow: false, uvSeed: seed, blocksPlayer: false,
    });
  };
  solid(middle, 0, -0.08, length, outerWidth, 0.16, 'passage-floor', 1);
  solid(middle, 0, height + 0.08, length, outerWidth, 0.16, 'passage-ceiling', 2);
  for (const side of [-1, 1]) {
    solid(middle, side * (width / 2 + halfWall), height / 2, length, wallThickness, height, 'passage-wall', 3 + side);
  }
  solid(end + halfWall, 0, height / 2, wallThickness, outerWidth, height, 'passage-end', 6);
}

/** Where an entrance's zombies appear, wait in front of the boards and step in, measured from the wall centre line. */
export interface EntranceSpawnDepths {
  readonly spawnDepth: number;
  readonly approachDepth: number;
  readonly breachDepth: number;
}

/** The spawn point at the end of an entrance's passage, tied to its barrier. */
export function entranceSpawn(site: EntranceSite & { readonly id: string }, depths: EntranceSpawnDepths): ZombieSpawnPoint {
  const along = (depth: number): { x: number; z: number } => ({
    x: site.x + site.outwardX * depth,
    z: site.z + site.outwardZ * depth,
  });
  const spawn = along(depths.spawnDepth);
  const approach = along(depths.approachDepth);
  const breach = along(-depths.breachDepth);
  return {
    x: spawn.x,
    z: spawn.z,
    barrierId: site.id,
    approachX: approach.x,
    approachZ: approach.z,
    breachX: breach.x,
    breachZ: breach.z,
    exterior: true,
  };
}

/**
 * Stops the player at a walk-through entrance's wall line, so its passage is
 * never walkable once the boards are gone. Player only: zombies and bullets
 * go through.
 */
export function entrancePlayerStop(site: EntranceSite, width: number, top: number, wallThickness: number): THREE.Box3 {
  const halfAlong = width / 2;
  const halfAcross = wallThickness / 2;
  const alongX = site.outwardX === 0;
  return new THREE.Box3(
    new THREE.Vector3(site.x - (alongX ? halfAlong : halfAcross), 0, site.z - (alongX ? halfAcross : halfAlong)),
    new THREE.Vector3(site.x + (alongX ? halfAlong : halfAcross), top, site.z + (alongX ? halfAcross : halfAlong)),
  );
}

/** A hole some map feature (entrance, paid door) cuts at a point of a wall's centre line. */
export interface WallCut {
  readonly x: number;
  readonly z: number;
  readonly opening: Omit<WallOpening, 'center'>;
}

/** The cuts lying on the wall centred on `fixed` along `axis`, strictly inside [min, max]. */
export function wallOpeningsAt(axis: WallAxis, fixed: number, min: number, max: number, cuts: ReadonlyArray<WallCut>): WallOpening[] {
  const along = (cut: WallCut): number => (axis === 'z' ? cut.z : cut.x);
  return cuts
    .filter((cut) => (axis === 'z' ? cut.x : cut.z) === fixed && along(cut) > min && along(cut) < max)
    .map((cut) => ({ center: along(cut), ...cut.opening }));
}
