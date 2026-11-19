import * as THREE from 'three';
import type { StaticMeshBatch } from '../shared/StaticMeshBatch';
import { WHEEL_RADIUS, WHEEL_WIDTH } from './EscapeTruckLayout';
import type { EscapeTruckMaterials } from './EscapeTruckMaterials';

const RIM_RADIUS = 0.33;
const TREAD_LUGS = 12;
/** The raised lugs stand this proud of the carcass, their faces on the wheel's radius. */
const LUG_DEPTH = 0.03;
const CARCASS_RADIUS = WHEEL_RADIUS - LUG_DEPTH;
const LUG_NUTS = 6;
/**
 * Half-section of the tyre, swept round the axle: radius out from the
 * axle and offset across the tread, from the inner bead round the
 * bulging sidewalls and shoulders to the outer bead.
 */
const TYRE_PROFILE: ReadonlyArray<readonly [number, number]> = [
  [RIM_RADIUS, -0.19], [0.44, -0.2], [0.5, -0.19], [CARCASS_RADIUS - 0.012, -0.15], [CARCASS_RADIUS, -0.06],
  [CARCASS_RADIUS, 0.06], [CARCASS_RADIUS - 0.012, 0.15], [0.5, 0.19], [0.44, 0.2], [RIM_RADIUS, 0.19],
];

/**
 * One off-road wheel into `batch`, its axle along x through (`x`, `y`, `z`):
 * a lathed tyre with rounded shoulders and a chevron tread of raised lugs,
 * a black-painted disc with its hub and ring of nuts on the `side` facing
 * out (+1 east, -1 west). Lugs and nuts show the roll when the wheel spins.
 * All one material, so a set of wheels costs a single draw.
 */
export function addTruckWheel(batch: StaticMeshBatch, materials: EscapeTruckMaterials, x: number, y: number, z: number, side: number): void {
  const profile = TYRE_PROFILE.map(([radius, across]) => new THREE.Vector2(radius, across));
  batch.add(new THREE.LatheGeometry(profile, 14).rotateZ(Math.PI / 2).translate(x, y, z), materials.rubber);
  for (let lug = 0; lug < TREAD_LUGS; lug++) {
    const angle = (lug / TREAD_LUGS) * Math.PI * 2;
    for (const half of [-1, 1]) {
      // Each lug leans across the tread; the two halves meet in a chevron.
      const block = new THREE.BoxGeometry(0.17, LUG_DEPTH + 0.01, 0.075)
        .rotateY(half * 0.42)
        .translate(half * 0.09, WHEEL_RADIUS - (LUG_DEPTH + 0.01) / 2, (lug % 2) * 0.03)
        .rotateX(angle);
      batch.add(block.translate(x, y, z), materials.rubber);
    }
  }
  const face = x + side * (WHEEL_WIDTH / 2 - 0.05);
  batch.add(new THREE.CylinderGeometry(RIM_RADIUS, RIM_RADIUS, 0.03, 14).rotateZ(Math.PI / 2).translate(face, y, z), materials.rubber);
  batch.add(new THREE.CylinderGeometry(0.1, 0.13, 0.1, 8).rotateZ(Math.PI / 2).translate(face + side * 0.05, y, z), materials.rubber);
  batch.add(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 6).rotateZ(Math.PI / 2).translate(face + side * 0.11, y, z), materials.rubber);
  for (let nut = 0; nut < LUG_NUTS; nut++) {
    const angle = (nut / LUG_NUTS) * Math.PI * 2;
    batch.add(
      new THREE.CylinderGeometry(0.016, 0.016, 0.03, 5).rotateZ(Math.PI / 2)
        .translate(face + side * 0.03, y + Math.cos(angle) * 0.2, z + Math.sin(angle) * 0.2),
      materials.rubber,
    );
  }
}
