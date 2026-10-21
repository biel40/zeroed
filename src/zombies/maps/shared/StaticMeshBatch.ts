import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { projectMaterialUVs } from './ArenaStructure';

const KEPT_ATTRIBUTES = new Set(['position', 'normal', 'uv']);
const scratchMatrix = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();
const scratchEuler = new THREE.Euler();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();

export interface StaticMeshBatchOptions {
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}

/**
 * Collects static decorative pieces and merges them into one mesh per
 * material, so repeated props (columns, benches, steps, litter) cost one
 * draw call each. Batched meshes are visual only: colliders stay separate.
 */
export class StaticMeshBatch {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  /** Takes ownership of `geometry`, already in world space or placed by `matrix`. */
  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4): void {
    if (matrix) geometry.applyMatrix4(matrix);
    for (const name of Object.keys(geometry.attributes)) {
      if (!KEPT_ATTRIBUTES.has(name)) geometry.deleteAttribute(name);
    }
    const normalized = geometry.index ? geometry.toNonIndexed() : geometry;
    if (normalized !== geometry) geometry.dispose();
    const list = this.parts.get(material) ?? [];
    list.push(normalized);
    this.parts.set(material, list);
  }

  /** Box with world-scale UVs (when the material declares a tile size), rotated by Euler angles. */
  addBox(
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
    uvSeed = 0,
  ): void {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    projectMaterialUVs(geometry, width, height, depth, material, uvSeed);
    this.add(geometry, material, placement(x, y, z, rotationX, rotationY, rotationZ));
  }

  /** Merges everything into `parent`, one named mesh per material, and empties the batch. */
  build(parent: THREE.Object3D, name: string, options: StaticMeshBatchOptions): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const [material, geometries] of this.parts) {
      const merged = mergeGeometries(geometries);
      for (const geometry of geometries) geometry.dispose();
      if (!merged) throw new Error(`Unable to merge static batch ${name}`);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `${name}:${material.name || material.uuid}`;
      mesh.castShadow = options.castShadow;
      mesh.receiveShadow = options.receiveShadow;
      mesh.userData.mapRole = 'static-batch';
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.parts.clear();
    return meshes;
  }
}

/** Translation plus XYZ Euler rotation as a reusable matrix (valid until the next call). */
export function placement(x: number, y: number, z: number, rotationX = 0, rotationY = 0, rotationZ = 0): THREE.Matrix4 {
  scratchQuaternion.setFromEuler(scratchEuler.set(rotationX, rotationY, rotationZ));
  return scratchMatrix.compose(scratchPosition.set(x, y, z), scratchQuaternion, scratchScale.set(1, 1, 1));
}
