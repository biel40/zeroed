import * as THREE from 'three';

/** Corner of its rectangle a web is anchored in; it spreads towards the opposite one. */
export type CobwebCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * A corner cobweb plane in the local XY plane, facing +Z, its anchor corner
 * at the origin and spreading `width` x `height` away from it. The cobweb
 * texture is anchored at uv (0, 0), so mirroring the plane moves the anchor
 * (the material renders both sides).
 */
export function cobwebGeometry(width: number, height: number, corner: CobwebCorner): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(width, height).translate(width / 2, height / 2, 0);
  const flipX = corner === 'top-right' || corner === 'bottom-right';
  const flipY = corner === 'top-left' || corner === 'top-right';
  return geometry.scale(flipX ? -1 : 1, flipY ? -1 : 1, 1);
}
