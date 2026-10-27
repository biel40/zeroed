import type * as THREE from 'three';
import type { SurfaceType } from '../../../shooting/HitTarget';
import type { MapBuildKit } from './MapBuildKit';

/**
 * One invisible AABB proxy for a furnishing whose visuals live in the
 * shared batch: it stops bullets, zombies and the player alike.
 */
export function addSolidProxy(kit: MapBuildKit, name: string, min: THREE.Vector3Like, max: THREE.Vector3Like, surface: SurfaceType): void {
  kit.structure.addBox(
    (min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2,
    max.x - min.x, max.y - min.y, max.z - min.z,
    kit.collider,
    { name, surface, mapRole: 'solid-prop', castShadow: false, uvSeed: 0, blocksPlayer: true },
  );
}
