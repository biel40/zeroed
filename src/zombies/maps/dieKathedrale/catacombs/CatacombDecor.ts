import * as THREE from 'three';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { placement } from '../../shared/StaticMeshBatch';

/**
 * Small pieces the catacomb builders share, all merged into the static
 * batch: wall torches, candle clusters, skulls and bones, roots, damp
 * stains and rubble. Pure placement helpers, no state.
 */

type Batch = DieKathedraleBuildContext['batch'];
type Materials = DieKathedraleBuildContext['materials'];

/** An iron wall torch: plate, arm, a tarred haft leaning out and its flame, on a wall looking (`facingX`, `facingZ`). */
export function addWallTorch(context: DieKathedraleBuildContext, x: number, y: number, z: number, facingX: number, facingZ: number): void {
  const { batch, materials } = context;
  const yaw = Math.atan2(facingX, facingZ);
  const at = (out: number, up: number): THREE.Vector3 => new THREE.Vector3(x + facingX * out, y + up, z + facingZ * out);
  const plate = at(0.02, -0.38);
  batch.addBox(materials.iron, plate.x, plate.y, plate.z, 0.14, 0.3, 0.04, 0, yaw, 0);
  const arm = at(0.12, -0.42);
  batch.addBox(materials.iron, arm.x, arm.y, arm.z, 0.04, 0.04, 0.22, 0, yaw, 0);
  const haft = new THREE.CylinderGeometry(0.03, 0.022, 0.48, 6).rotateX(0.32);
  const haftAt = at(0.2, -0.2);
  batch.add(haft, materials.darkWood, placement(haftAt.x, haftAt.y, haftAt.z, 0, yaw, 0));
  const pitch = new THREE.CylinderGeometry(0.055, 0.04, 0.13, 7);
  const pitchAt = at(0.26, 0.04);
  batch.add(pitch, materials.cavity, placement(pitchAt.x, pitchAt.y, pitchAt.z, 0.32, yaw, 0));
  const flame = new THREE.SphereGeometry(0.08, 7, 5).scale(1, 2.1, 1);
  const flameAt = at(0.28, 0.2);
  batch.add(flame, materials.flame, placement(flameAt.x, flameAt.y, flameAt.z));
}

/** Tallow candles of uneven height melted onto a ledge or the floor at (`x`, `y`, `z`), each with a flame. */
export function addCandleCluster(context: DieKathedraleBuildContext, x: number, y: number, z: number, count: number, spread: number, random: () => number): void {
  const { batch, materials } = context;
  batch.add(new THREE.CylinderGeometry(spread * 0.75, spread * 0.85, 0.03, 9).translate(x, y + 0.015, z), materials.wax);
  for (let candle = 0; candle < count; candle++) {
    const angle = random() * Math.PI * 2;
    const reach = Math.sqrt(random()) * spread * 0.6;
    const cx = x + Math.cos(angle) * reach;
    const cz = z + Math.sin(angle) * reach;
    const height = 0.08 + random() * 0.24;
    const radius = 0.018 + random() * 0.016;
    batch.add(new THREE.CylinderGeometry(radius, radius * 1.1, height, 5, 1, true).translate(cx, y + height / 2, cz), materials.wax);
    batch.add(new THREE.OctahedronGeometry(0.02).scale(1, 2, 1).translate(cx, y + height + 0.035, cz), materials.flame);
  }
}

/** A skull looking along `yaw`, its jaw fallen or not. */
export function addSkull(batch: Batch, materials: Materials, x: number, y: number, z: number, yaw: number, tilt = 0): void {
  const matrix = placement(x, y, z, tilt, yaw, 0).clone();
  batch.add(new THREE.SphereGeometry(0.1, 6, 4).scale(0.82, 0.9, 1).translate(0, 0.09, 0), materials.bone, matrix);
  batch.add(new THREE.BoxGeometry(0.11, 0.05, 0.08).translate(0, 0.03, 0.06), materials.bone, matrix);
  // Eye sockets: two dark dents in the face.
  for (const side of [-1, 1]) {
    batch.add(new THREE.OctahedronGeometry(0.026).translate(side * 0.035, 0.1, 0.082), materials.cavity, matrix);
  }
}

/** Long bones lying in a heap, mostly along the ground. */
export function addBones(batch: Batch, materials: Materials, x: number, y: number, z: number, count: number, spread: number, random: () => number): void {
  for (let bone = 0; bone < count; bone++) {
    const length = 0.22 + random() * 0.24;
    const matrix = placement(
      x + (random() - 0.5) * spread, y + 0.02 + random() * 0.03, z + (random() - 0.5) * spread,
      0, random() * Math.PI, (random() - 0.5) * 0.3,
    ).clone();
    batch.add(new THREE.CylinderGeometry(0.016, 0.016, length, 4, 1, true).rotateZ(Math.PI / 2), materials.bone, matrix);
    // Knuckled ends.
    for (const end of [-1, 1]) {
      batch.add(new THREE.OctahedronGeometry(0.03).translate(end * length / 2, 0, 0), materials.bone, matrix);
    }
  }
}

/** A root forced through the masonry, hanging along `points` (world space). */
export function addRoot(batch: Batch, materials: Materials, points: ReadonlyArray<THREE.Vector3>, radius: number): void {
  const curve = new THREE.CatmullRomCurve3([...points]);
  batch.add(new THREE.TubeGeometry(curve, Math.max(4, points.length * 2), radius, 4, false), materials.root);
}

/** A root coming out of a ceiling at (`x`, `topY`, `z`) and trailing down a wall looking (`facingX`, `facingZ`). */
export function addHangingRoot(batch: Batch, materials: Materials, x: number, topY: number, z: number, facingX: number, facingZ: number, length: number, random: () => number): void {
  const points: THREE.Vector3[] = [];
  const segments = 5;
  for (let index = 0; index <= segments; index++) {
    const t = index / segments;
    const out = 0.06 + Math.sin(t * Math.PI) * 0.12 + random() * 0.04;
    const sway = (random() - 0.5) * 0.3;
    points.push(new THREE.Vector3(
      x + facingX * out + facingZ * sway,
      topY - t * length,
      z + facingZ * out + facingX * sway,
    ));
  }
  addRoot(batch, materials, points, 0.035 + random() * 0.02);
}

/** A damp patch on a wall looking (`facingX`, `facingZ`), its bottom on the floor at `floorY`. */
export function addWallStain(batch: Batch, materials: Materials, x: number, floorY: number, z: number, facingX: number, facingZ: number, width: number, height: number): void {
  const yaw = Math.atan2(facingX, facingZ);
  const geometry = new THREE.PlaneGeometry(width, height).rotateY(yaw)
    .translate(x + facingX * 0.012, floorY + height / 2, z + facingZ * 0.012);
  batch.add(geometry, materials.dampStain);
}

/** A damp patch on the floor. */
export function addFloorStain(batch: Batch, materials: Materials, x: number, floorY: number, z: number, width: number, depth: number, yaw: number): void {
  batch.add(new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2).rotateY(yaw).translate(x, floorY + 0.011, z), materials.dampStain);
}

/** Broken stone too low to stop anyone, scattered round (`x`, `z`). */
export function addRubble(batch: Batch, materials: Materials, x: number, floorY: number, z: number, count: number, spread: number, random: () => number): void {
  for (let stone = 0; stone < count; stone++) {
    const size = 0.07 + random() * 0.2;
    batch.addBox(
      stone % 3 === 0 ? materials.dressedStone : materials.cryptStone,
      x + (random() - 0.5) * spread, floorY + size * 0.35, z + (random() - 0.5) * spread,
      size * 1.4, size, size * 1.1, random() * 0.6, random() * Math.PI, random() * 0.6, stone,
    );
  }
}
