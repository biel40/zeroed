import * as THREE from 'three';

let geometry: THREE.IcosahedronGeometry | null = null;
let material: THREE.MeshStandardMaterial | null = null;

/**
 * Shared by Barrett blood, its ground pool and the instanced wound effects.
 * Flat shading lights a flattened stain as a film on its surface; smooth
 * sphere normals would light its rim and read as a hole. A deeper red with a
 * wet sheen keeps that film readable on dark map surfaces.
 */
export function bloodMaterial(): THREE.MeshStandardMaterial {
  return (material ??= new THREE.MeshStandardMaterial({ color: 0x5e0606, roughness: 0.38, metalness: 0, flatShading: true }));
}

export function bloodGeometry(): THREE.IcosahedronGeometry {
  if (geometry) return geometry;
  geometry = new THREE.IcosahedronGeometry(1, 1);
  const vertices = geometry.getAttribute('position');
  for (let index = 0; index < vertices.count; index++) {
    const x = vertices.getX(index), y = vertices.getY(index), z = vertices.getZ(index);
    // Continuous deformation keeps shared vertices together and remains inside
    // the unit envelope used to fit stains to their supporting surface.
    const radius = 0.82 + 0.1 * Math.sin(7 * x + 3 * y - 2 * z) + 0.06 * Math.sin(5 * y - 4 * z + 1.3);
    vertices.setXYZ(index, x * radius, y * radius, z * radius);
  }
  geometry.computeVertexNormals();
  return geometry;
}
