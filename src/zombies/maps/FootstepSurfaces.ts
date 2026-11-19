import { FOOTSTEP_DEFAULT_SURFACE, type FootstepSurface } from '../../config/footsteps';

/** Ground rectangle on the XZ plane. */
export interface FootstepArea {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/** What the floor is made of inside one rectangle. */
export interface FootstepSurfaceZone extends FootstepArea {
  readonly surface: FootstepSurface;
  /** Floor index it belongs to; omitted on every floor (a stair joining two). */
  readonly floor?: number;
}

/**
 * A map's walking surfaces, as data: rectangles over its floors, checked
 * last to first so later zones override earlier ones (a puddle on a tiled
 * hall), and the surface everywhere else.
 */
export interface ArenaFootstepSurfaces {
  readonly fallback: FootstepSurface;
  readonly zones: ReadonlyArray<FootstepSurfaceZone>;
}

export function surfaceArea(area: FootstepArea, surface: FootstepSurface, floor?: number): FootstepSurfaceZone {
  return { minX: area.minX, maxX: area.maxX, minZ: area.minZ, maxZ: area.maxZ, surface, floor };
}

/** `area` grown by `margin` on every side (a room's interior faces out to the middle of its walls). */
export function grownArea(area: FootstepArea, margin: number): FootstepArea {
  return { minX: area.minX - margin, maxX: area.maxX + margin, minZ: area.minZ - margin, maxZ: area.maxZ + margin };
}

/** A `2 * halfX` by `2 * halfZ` patch centred on (`x`, `z`). */
export function surfacePatch(x: number, z: number, halfX: number, halfZ: number, surface: FootstepSurface, floor?: number): FootstepSurfaceZone {
  return { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ, surface, floor };
}

/** Surface under (`x`, `z`) on `floor`; without a layout, the shared default. */
export function footstepSurfaceAt(surfaces: ArenaFootstepSurfaces | null | undefined, x: number, z: number, floor: number): FootstepSurface {
  if (!surfaces) return FOOTSTEP_DEFAULT_SURFACE;
  for (let index = surfaces.zones.length - 1; index >= 0; index--) {
    const zone = surfaces.zones[index];
    if (zone.floor !== undefined && zone.floor !== floor) continue;
    if (x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) return zone.surface;
  }
  return surfaces.fallback;
}

/** Every surface a layout can play: the clips worth decoding for its map. */
export function footstepSurfacesUsed(surfaces: ArenaFootstepSurfaces | null | undefined): ReadonlySet<FootstepSurface> {
  if (!surfaces) return new Set([FOOTSTEP_DEFAULT_SURFACE]);
  return new Set([surfaces.fallback, ...surfaces.zones.map((zone) => zone.surface)]);
}
