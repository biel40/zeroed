import * as THREE from 'three';
import { clamp } from '../utils/math';
import type { BarrelGlowSize } from './WeaponTypes';

/** Glowing stretch of barrel behind the muzzle, as a multiple of the bore radius. */
const GLOW_LENGTH_RADII = 8;
/** Sleeve radius over the barrel radius: wide enough to wrap muzzle devices. */
const GLOW_RADIUS_SCALE = 1.45;
const GLOW_SEGMENTS = 16;
const GLOW_RINGS = 6;
/** Dull red when the overheat first shows, bright orange at full heat. */
const COOL_COLOR = new THREE.Color(0x8a1c04);
const HOT_COLOR = new THREE.Color(0xff7a26);

/** Sleeve that wraps a bare barrel of `barrelRadius` (no jacket). */
export function defaultBarrelGlowSize(barrelRadius: number): BarrelGlowSize {
  return { radius: barrelRadius * GLOW_RADIUS_SCALE, length: barrelRadius * GLOW_LENGTH_RADII };
}

/**
 * Overheated barrel tip of a first-person weapon: an additive sleeve around
 * the last centimetres of the barrel, brightest at the crown and fading back
 * toward the receiver. Lives under the muzzle anchor (local -Z = forward), so
 * it fits every view model builder without touching their meshes.
 */
export class BarrelGlow {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.MeshBasicMaterial;

  constructor({ radius, length }: BarrelGlowSize) {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, GLOW_SEGMENTS, GLOW_RINGS, true);
    // Axis along +Z, spanning from the crown (z = 0) back along the barrel.
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, length / 2);
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    for (let i = 0; i < positions.count; i++) {
      const fade = 1 - clamp(positions.getZ(i) / length, 0, 1);
      colors.fill(fade * fade, i * 3, i * 3 + 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    this.material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.name = 'barrel-heat-glow';
    this.mesh.visible = false;
  }

  /** `intensity` is the 0 → 1 visible overheat (BarrelHeat.intensity). */
  update(intensity: number): void {
    this.mesh.visible = intensity > 0.01;
    if (!this.mesh.visible) return;
    this.material.color.lerpColors(COOL_COLOR, HOT_COLOR, intensity).multiplyScalar(intensity);
  }
}
