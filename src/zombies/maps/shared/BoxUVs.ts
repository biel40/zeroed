import type * as THREE from 'three';

/**
 * World-scale box UVs: each face tiles once per `metersPerTile`, so boxes of
 * any size share one texture density. Also copies the result to `uv1` for
 * the aoMap.
 */
export function projectBoxUVs(
  geometry: THREE.BoxGeometry,
  width: number,
  height: number,
  depth: number,
  metersPerTile: number,
  offsetU: number,
  offsetV: number,
): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  for (let index = 0; index < uv.count; index++) {
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const faceWidth = nx > 0.5 ? depth : width;
    const faceHeight = ny > 0.5 ? depth : height;
    uv.setXY(
      index,
      uv.getX(index) * faceWidth / metersPerTile + offsetU,
      uv.getY(index) * faceHeight / metersPerTile + offsetV,
    );
  }
  uv.needsUpdate = true;
  geometry.setAttribute('uv1', uv.clone());
}

/**
 * World-anchored box UVs for a box centred at (`x`, `y`, `z`): every face
 * samples the texture at its world coordinates, so neighbouring wall
 * pieces and floors continue one pattern without seams. Also copies the
 * result to `uv1` for the aoMap.
 */
export function projectWorldBoxUVs(
  geometry: THREE.BoxGeometry,
  x: number,
  y: number,
  z: number,
  metersPerTile: number,
): void {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  const normal = geometry.getAttribute('normal') as THREE.BufferAttribute;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let index = 0; index < uv.count; index++) {
    const worldX = position.getX(index) + x;
    const worldY = position.getY(index) + y;
    const worldZ = position.getZ(index) + z;
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    const [u, v] = nx > 0.5 ? [worldZ, worldY] : ny > 0.5 ? [worldX, worldZ] : [worldX, worldY];
    uv.setXY(index, u / metersPerTile, v / metersPerTile);
  }
  uv.needsUpdate = true;
  geometry.setAttribute('uv1', uv.clone());
}
