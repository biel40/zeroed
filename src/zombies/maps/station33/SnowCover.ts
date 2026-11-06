import * as THREE from 'three';
import { placement, type StaticMeshBatch } from '../shared/StaticMeshBatch';

/** How thick the snow settles on a flat top. */
export const SNOW_CAP_THICKNESS = 0.07;

/**
 * Snow settled on a flat top at `topY`: a slab a touch narrower than the
 * surface, so the edges stay dark and read as the object under it.
 */
export function addSnowCap(
  batch: StaticMeshBatch,
  material: THREE.Material,
  x: number,
  topY: number,
  z: number,
  width: number,
  depth: number,
  yaw = 0,
  thickness = SNOW_CAP_THICKNESS,
): void {
  batch.addBox(material, x, topY + thickness / 2, z, Math.max(0.02, width - 0.04), thickness, Math.max(0.02, depth - 0.04), 0, yaw, 0);
}

/** A drift of snow: a low half-ellipsoid `length` x `depth` and `height` high, lying along `yaw`. */
export function addSnowDrift(
  batch: StaticMeshBatch,
  material: THREE.Material,
  x: number,
  groundY: number,
  z: number,
  length: number,
  depth: number,
  height: number,
  yaw = 0,
): void {
  const mound = new THREE.SphereGeometry(1, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(length / 2, height, depth / 2);
  batch.add(mound, material, placement(x, groundY - 0.01, z, 0, yaw, 0));
}

/**
 * Icicles hanging from an edge at `y`, from `from` to `to` (world x/z), one
 * every `spacing` metres or so, each of its own length from `random`.
 */
export function addIcicles(
  batch: StaticMeshBatch,
  material: THREE.Material,
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number },
  y: number,
  spacing: number,
  maxLength: number,
  random: () => number,
): void {
  const span = Math.hypot(to.x - from.x, to.z - from.z);
  const count = Math.max(1, Math.floor(span / spacing));
  for (let index = 0; index < count; index++) {
    if (random() < 0.3) continue;
    const t = (index + 0.5 + (random() - 0.5) * 0.6) / count;
    const length = maxLength * (0.25 + random() * 0.75);
    const icicle = new THREE.ConeGeometry(0.018 + length * 0.06, length, 5).rotateX(Math.PI);
    batch.add(icicle, material, placement(from.x + (to.x - from.x) * t, y - length / 2, from.z + (to.z - from.z) * t));
  }
}
