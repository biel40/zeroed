import * as THREE from 'three';
import { estimateBytesUsed } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ZombieArena } from '../src/zombies/maps/ZombieArena';

const MIB = 1024 ** 2;

/** Counts scene objects before frustum culling, without a renderer or GPU. */
export function measureArena(arena: ZombieArena, navigationCellSize: number) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const cameraLayer = new THREE.Layers();
  let drawables = 0;
  let visibleDrawables = 0;
  let triangles = 0;
  let visibleTriangles = 0;
  let instances = 0;

  function visit(object: THREE.Object3D, parentVisible: boolean): void {
    const visible = parentVisible && object.visible;
    if (object instanceof THREE.Mesh || object instanceof THREE.Line ||
        object instanceof THREE.Points || object instanceof THREE.Sprite) {
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      geometries.add(object.geometry);
      for (const material of objectMaterials) materials.add(material);
      const instanceCount = object instanceof THREE.InstancedMesh ? object.count : 1;
      if (object instanceof THREE.InstancedMesh) instances += instanceCount;
      const meshTriangles = object instanceof THREE.Mesh
        ? Math.floor((object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3) * instanceCount
        : 0;
      drawables++;
      triangles += meshTriangles;
      if (visible && cameraLayer.test(object.layers) && objectMaterials.some((material) => material.visible)) {
        visibleDrawables++;
        visibleTriangles += meshTriangles;
      }
    }
    // Three propagates visible=false to children, but checks layers per object.
    for (const child of object.children) visit(child, visible);
  }

  visit(arena.group, true);
  const geometryBytes = Array.from(geometries, estimateBytesUsed).reduce((sum, bytes) => sum + bytes, 0);
  const floorCells = arena.navigationBounds.map((floor) => ({
    floor: floor.floor,
    cells: Math.ceil((floor.maxX - floor.minX) / navigationCellSize) *
      Math.ceil((floor.maxZ - floor.minZ) / navigationCellSize),
  }));
  return {
    drawables,
    visibleDrawables,
    triangles,
    visibleTriangles,
    instances,
    geometries: geometries.size,
    materials: materials.size,
    geometryMiB: geometryBytes / MIB,
    colliders: arena.colliders.length,
    wallBoxes: arena.wallColliders?.length ?? 0,
    navCells: floorCells.reduce((sum, { cells }) => sum + cells, 0),
    floorCells,
  };
}
