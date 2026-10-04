import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Collapses the meshes of every direct child group of `root` into one mesh
 * per material. The groups survive because they are the animated pivots
 * (magazine, bolt, charging handle); only their draw calls shrink.
 */
export function mergeAssemblies(root: THREE.Group): void {
  for (const part of root.children) {
    if (!(part instanceof THREE.Group)) continue;
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...part.children]) {
      if (!(child instanceof THREE.Mesh)) continue;
      child.updateMatrix();
      const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      geometry.applyMatrix4(child.matrix);
      const batch = batches.get(child.material) ?? [];
      batch.push(geometry);
      batches.set(child.material, batch);
      child.geometry.dispose();
      part.remove(child);
    }
    for (const [material, geometries] of batches) {
      const merged = mergeGeometries(geometries);
      if (merged) part.add(new THREE.Mesh(merged, material));
      for (const geometry of geometries) geometry.dispose();
    }
  }
}
