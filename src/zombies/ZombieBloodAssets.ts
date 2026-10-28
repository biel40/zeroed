import * as THREE from 'three';

let geometry: THREE.IcosahedronGeometry | null = null;
let material: THREE.MeshStandardMaterial | null = null;

/** Shared by Barrett blood, its ground pool and the instanced wound effects. */
export function bloodMaterial(): THREE.MeshStandardMaterial {
  return (material ??= new THREE.MeshStandardMaterial({ color: 0x420403, roughness: 0.3, metalness: 0 }));
}

export function bloodGeometry(): THREE.IcosahedronGeometry {
  return (geometry ??= new THREE.IcosahedronGeometry(1, 1));
}
