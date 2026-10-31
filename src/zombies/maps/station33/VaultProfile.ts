import * as THREE from 'three';
import {
  COCHERAS, CONSIGNA, MILICIA, PROTOCOL33_ESCAPE, PROTOCOL33_SURFACE, PROTOCOL33_SURFACE_Y, station33ZoneAt, SUBESTACION, TALLER, VESTIBULE,
} from '../Station33Config';

/**
 * Shallow segmental barrel vault spanning a hall across X and running
 * along Z, springing from the tops of its side walls.
 */
export interface SegmentalVault {
  readonly centerX: number;
  readonly halfSpan: number;
  /** Spring line: top of the side walls. */
  readonly springY: number;
  /** Radius of the circle through both spring points and the apex. */
  readonly radius: number;
  /** Height of that circle's centre (far below the floor for a shallow vault). */
  readonly centerY: number;
  /** Half the angle the vault spans, measured from the vertical. */
  readonly halfAngle: number;
  /** Underside of the vault at a given x (spring line outside the span). */
  heightAt(x: number): number;
}

export function segmentalVault(minX: number, maxX: number, springY: number, apexY: number): SegmentalVault {
  const halfSpan = (maxX - minX) / 2;
  const centerX = (minX + maxX) / 2;
  const rise = apexY - springY;
  const radius = (halfSpan * halfSpan + rise * rise) / (2 * rise);
  const centerY = apexY - radius;
  return {
    centerX,
    halfSpan,
    springY,
    radius,
    centerY,
    halfAngle: Math.asin(halfSpan / radius),
    heightAt(x) {
      const offset = x - centerX;
      if (Math.abs(offset) >= halfSpan) return springY;
      return centerY + Math.sqrt(radius * radius - offset * offset);
    },
  };
}

export const VESTIBULE_VAULT = segmentalVault(VESTIBULE.minX, VESTIBULE.maxX, VESTIBULE.wallHeight, VESTIBULE.vaultApexY);
export const COCHERAS_VAULT = segmentalVault(COCHERAS.hall.minX, COCHERAS.hall.maxX, COCHERAS.wallHeight, COCHERAS.vaultApexY);

/** Underside of whatever ceiling covers a floor point: a vault, or a flat slab (luggage office, machine room). */
export function ceilingHeightAt(x: number, z: number): number {
  switch (station33ZoneAt(x, z)) {
    case 'consigna': return CONSIGNA.ceilingHeight;
    case 'milicia': return MILICIA.ceilingHeight;
    case 'taller': return TALLER.ceilingHeight;
    case 'evacuacion': return PROTOCOL33_ESCAPE.height;
    case 'superficie': return PROTOCOL33_SURFACE_Y + PROTOCOL33_SURFACE.kiosk.height;
    case 'subestacion': return z > SUBESTACION.hall.maxZ ? SUBESTACION.galleryHeight : SUBESTACION.hallHeight;
    case 'cocheras': return COCHERAS_VAULT.heightAt(x);
    default: return VESTIBULE_VAULT.heightAt(x);
  }
}

/**
 * Open curved surface of the vault from `minZ` to `maxZ`, with UVs in
 * tiles of `metersPerTile` (u around the arc, v along Z), positioned in
 * world space.
 */
export function vaultSurfaceGeometry(vault: SegmentalVault, minZ: number, maxZ: number, metersPerTile: number): THREE.BufferGeometry {
  const length = maxZ - minZ;
  // Cylinder axis Y turned onto Z; theta = PI points straight up after the turn.
  const geometry = new THREE.CylinderGeometry(
    vault.radius, vault.radius, length, 32, 1, true, Math.PI - vault.halfAngle, vault.halfAngle * 2,
  );
  geometry.rotateX(Math.PI / 2);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const arcLength = vault.radius * vault.halfAngle * 2;
  for (let index = 0; index < uv.count; index++) {
    uv.setXY(index, uv.getX(index) * arcLength / metersPerTile, uv.getY(index) * length / metersPerTile);
  }
  geometry.translate(vault.centerX, vault.centerY, (minZ + maxZ) / 2);
  return geometry;
}

/** Transverse rib hugging the vault's underside, `thickness` deep and `width` long, centred on `z`. */
export function vaultRibGeometry(vault: SegmentalVault, z: number, thickness: number, width: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  const start = Math.PI / 2 + vault.halfAngle;
  const end = Math.PI / 2 - vault.halfAngle;
  shape.absarc(vault.centerX, vault.centerY, vault.radius, start, end, true);
  shape.absarc(vault.centerX, vault.centerY, vault.radius - thickness, end, start, false);
  shape.closePath();
  const rib = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 24 });
  rib.translate(0, 0, z - width / 2);
  return rib;
}

/**
 * Flat infill between an end wall's top and the vault, in the XY plane at
 * `z`, facing +Z (`facing` 1) or -Z (-1). UVs in tiles of `metersPerTile`.
 */
export function vaultLunetteGeometry(vault: SegmentalVault, z: number, facing: number, metersPerTile: number): THREE.ShapeGeometry {
  const minX = vault.centerX - vault.halfSpan;
  const shape = new THREE.Shape();
  shape.moveTo(minX, vault.springY);
  shape.absarc(vault.centerX, vault.centerY, vault.radius, Math.PI / 2 + vault.halfAngle, Math.PI / 2 - vault.halfAngle, true);
  shape.lineTo(minX, vault.springY);
  const geometry = new THREE.ShapeGeometry(shape, 24);
  // Shape UVs are raw metres: rescale them to the material's tile size.
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  for (let index = 0; index < uv.count; index++) uv.setXY(index, uv.getX(index) / metersPerTile, uv.getY(index) / metersPerTile);
  if (facing < 0) {
    // Mirror about the vault's centre line so the face turns to -Z in place.
    geometry.translate(-vault.centerX, 0, 0).rotateY(Math.PI).translate(vault.centerX, 0, 0);
  }
  geometry.translate(0, 0, z);
  return geometry;
}
