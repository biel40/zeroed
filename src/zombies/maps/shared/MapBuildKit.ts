import type * as THREE from 'three';
import type { ArenaStructure } from './ArenaStructure';
import type { StaticMeshBatch } from './StaticMeshBatch';

/**
 * What every shared map piece (machines, switches, locker banks, solid
 * proxies) needs from the map that builds it. Solids go through
 * `structure`, static decoration through `batch` (merged once by the
 * arena), and standalone meshes that animate or own a material instance
 * into `group`. Each map's own build context extends this one.
 */
export interface MapBuildKit {
  readonly group: THREE.Group;
  readonly structure: ArenaStructure;
  readonly batch: StaticMeshBatch;
  /** Invisible material of collision proxies. */
  readonly collider: THREE.Material;
}
