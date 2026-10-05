import * as THREE from 'three';

/**
 * Surfaces that render opaque and blend only while fading out. The opaque
 * pass keeps early depth rejection when bodies overlap on screen; the
 * registry lets loading compile the blended variant before it is needed.
 */
const fadeMaterials = new WeakSet<THREE.Material>();

export function registerFadeMaterial(material: THREE.Material): void {
  material.transparent = false;
  fadeMaterials.add(material);
}

export function isFadeMaterial(material: THREE.Material): boolean {
  return fadeMaterials.has(material);
}

/** Switches to blending below full opacity and back to the opaque pass at 1. */
export function setFadeOpacity(material: THREE.Material, opacity: number): void {
  material.opacity = opacity;
  setFadeBlending(material, opacity < 1);
}

export function setFadeBlending(material: THREE.Material, blended: boolean): void {
  if (material.transparent === blended) return;
  material.transparent = blended;
  material.needsUpdate = true;
}
