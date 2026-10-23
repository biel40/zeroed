import * as THREE from 'three';
import { projectMaterialUVs } from '../shared/ArenaStructure';
import { projectWorldBoxUVs } from '../shared/BoxUVs';
import { placement, StaticMeshBatch, type StaticMeshBatchOptions } from '../shared/StaticMeshBatch';
import { floorPartitionOf, type MansionFloorPartition } from './MansionFloors';

/**
 * Static decoration of the mansion, merged per material like Station 33's
 * StaticMeshBatch but also per floor partition: each built mesh records its
 * partition in `userData.floorPartition`, so the arena's floor culling keeps
 * hiding what the observer cannot see. Visual only: never a collider.
 */
export class MansionDecorBatch {
  private readonly batches = new Map<string, { readonly partition: MansionFloorPartition; readonly batch: StaticMeshBatch }>();
  private readonly bounds = new THREE.Box3();

  /** Takes ownership of `geometry`, already in world space or placed by `matrix`. */
  add(geometry: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4): void {
    if (matrix) geometry.applyMatrix4(matrix);
    geometry.computeBoundingBox();
    const partition = floorPartitionOf(this.bounds.copy(geometry.boundingBox!));
    const key = `${partition.floor ?? 'both'}:${partition.nearStairs ? 'stairs' : 'room'}`;
    let entry = this.batches.get(key);
    if (!entry) {
      entry = { partition, batch: new StaticMeshBatch() };
      this.batches.set(key, entry);
    }
    entry.batch.add(geometry, material);
  }

  /** Box with box-local world-scale UVs, rotated by Euler angles. */
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

  /** Axis-aligned box whose texture is anchored to the world, continuing across neighbours. */
  addWorldBox(material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number): void {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const metersPerTile = material.userData.metersPerTile as number | undefined;
    if (metersPerTile) projectWorldBoxUVs(geometry, x, y, z, metersPerTile);
    geometry.translate(x, y, z);
    this.add(geometry, material);
  }

  /** Merges everything into `parent` and empties the batch. */
  build(parent: THREE.Object3D, name: string, options: StaticMeshBatchOptions): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const [key, { partition, batch }] of this.batches) {
      for (const mesh of batch.build(parent, `${name}:${key}`, options)) {
        mesh.userData.floorPartition = partition;
        meshes.push(mesh);
      }
    }
    this.batches.clear();
    return meshes;
  }
}
