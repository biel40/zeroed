import * as THREE from 'three';
import { hash2 } from '../shared/ProceduralSurface';

const SIZE = 64;
const SPOKES = 6;
const RINGS = 7;
const THREAD = 0.011;

/**
 * A quarter web spun in a corner: spokes fanning out of texel (0, 0) and
 * sagging threads between them, some sectors torn. White with alpha.
 */
export function makeCobwebTexture(seed: number): THREE.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = (x + 0.5) / SIZE;
      const v = (y + 0.5) / SIZE;
      const radius = Math.hypot(u, v);
      const spoke = Math.atan2(v, u) / (Math.PI / 2) * SPOKES;
      const sector = Math.min(SPOKES - 1, Math.floor(spoke));
      const within = spoke - sector;
      const toSpoke = Math.abs(spoke - Math.round(spoke)) * (Math.PI / 2 / SPOKES) * radius;
      // Threads hang between two spokes: nearer the corner in the middle of a sector.
      const ring = radius / (1 - 0.14 * Math.sin(Math.PI * within)) * RINGS + hash2(sector, 0, seed) * 0.5;
      const ringIndex = Math.round(ring);
      const torn = hash2(sector, ringIndex, seed + 1) < 0.22;
      const toRing = Math.abs(ring - ringIndex) / RINGS;
      const onThread = toSpoke < THREAD || (!torn && ringIndex > 0 && toRing < THREAD * 0.8);
      const reach = 1 - THREE.MathUtils.smoothstep(radius, 0.82, 1);
      const offset = (y * SIZE + x) * 4;
      data.fill(255, offset, offset + 3);
      data[offset + 3] = Math.round((onThread ? 255 : 26 * (1 - radius)) * reach);
    }
  }
  const texture = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * A web hung from `corner`: it spreads `size` along the horizontal direction
 * (`towardX`, `towardZ`) and the same distance down.
 */
export function cobwebGeometry(corner: THREE.Vector3Like, towardX: number, towardZ: number, size: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(size, size)
    .scale(1, -1, 1)
    .translate(size / 2, -size / 2, 0)
    .rotateY(Math.atan2(-towardZ, towardX))
    .translate(corner.x, corner.y, corner.z);
}
