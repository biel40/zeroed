import * as THREE from 'three';

/** Surfaces of a gas mask; the hanging prop and the first-person view each bring their own. */
export interface GasMaskMaterials {
  readonly rubber: THREE.Material;
  readonly lens: THREE.Material;
  readonly filter: THREE.Material;
}

/** Centre between the two eyepieces in the model's frame (front facing +z). */
export const GAS_MASK_LENS_CENTER = new THREE.Vector3(0, 0.03, 0.13);

/**
 * A rubber face piece with two round eyepieces and a filter canister under
 * the chin. The origin is the point it hangs from when flush on a wall; its
 * front faces +z. Meshes keep their placement in their own matrix, so the
 * model can be merged (static dressing) or used as is (worn mask).
 */
export function buildGasMaskModel(materials: GasMaskMaterials): THREE.Group {
  const model = new THREE.Group();
  model.name = 'gas-mask';
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material): void => {
    model.add(new THREE.Mesh(geometry, material));
  };
  add(new THREE.SphereGeometry(0.1, 12, 8).scale(1, 1.25, 0.6).translate(0, 0, 0.07), materials.rubber);
  for (const side of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10).rotateX(Math.PI / 2).translate(side * 0.042, 0.03, 0.13), materials.lens);
  }
  add(new THREE.CylinderGeometry(0.042, 0.042, 0.09, 10).rotateX(Math.PI / 2 - 0.5).translate(0, -0.08, 0.15), materials.filter);
  return model;
}
