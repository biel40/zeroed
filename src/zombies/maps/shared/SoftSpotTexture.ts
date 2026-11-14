import * as THREE from 'three';

/** Soft round alpha spot shared by dust motes and steam. */
export function makeSoftSpot(size: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const offset = (y * size + x) * 4;
      data.fill(255, offset, offset + 3);
      data[offset + 3] = Math.round(Math.max(0, 1 - distance) ** 2 * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
