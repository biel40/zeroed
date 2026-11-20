import * as THREE from 'three';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { archPoints, ribGeometries } from '../GothicVault';
import { BELL_STAIR, BELL_CHAMBER, UPPER_FLOOR_Y } from './UpperCathedralConfig';

const { centerX, centerZ, innerRadius, outerRadius, sweep, steps, landingHalfWidth } = BELL_STAIR;
const SIDES = 24;
const SHAFT_WALL = 0.52;
const LANDING_HEADROOM = 3.15;
const TREAD_DEPTH = 0.24;

/** The masonry, stair treads and their single smoothed ballistic surface. */
export function buildBellStair(context: DieKathedraleBuildContext): void {
  addStairEnclosure(context);
  addSpiralTreads(context);
  addLandingDressing(context);
}

function addStairEnclosure(context: DieKathedraleBuildContext): void {
  const { batch, structure, materials } = context;
  const stairbox = (name: string, x: number, y: number, z: number, width: number, height: number, depth: number, solid: boolean, yaw = 0): void => {
    batch.addBox(materials.wallStone, x, y, z, width, height, depth, 0, yaw);
    const mesh = structure.addBox(x, y, z, width, height, depth, materials.collider, {
      name, surface: 'concrete', mapRole: solid ? 'wall' : 'slab', castShadow: false, uvSeed: 0, blocksPlayer: solid, stainFaces: 'none',
    });
    mesh.rotation.y = yaw;
  };

  const shaftHeight = UPPER_FLOOR_Y + LANDING_HEADROOM + 0.35;
  const angleStep = Math.PI * 2 / SIDES;
  const wallRadius = outerRadius + SHAFT_WALL / 2 - 0.08;
  const faceWidth = 2 * wallRadius * Math.tan(angleStep / 2) + 0.06;
  for (let side = 0; side < SIDES; side++) {
    const angle = side * angleStep;
    const atFoot = side <= 1 || side === SIDES - 1;
    const atHead = Math.abs(side - SIDES * 0.75) <= 1;
    const bottom = atFoot ? LANDING_HEADROOM : 0;
    const top = atHead ? UPPER_FLOOR_Y : shaftHeight;
    const x = centerX + wallRadius * Math.cos(angle);
    const z = centerZ + wallRadius * Math.sin(angle);
    stairbox(`bell-stair-wall-${side}`, x, (bottom + top) / 2, z, SHAFT_WALL, top - bottom, faceWidth, true, -angle);
  }

  // The new stair joins the existing opening through the crossing wall, with flat landings at both ends.
  const footEndX = -13.98;
  const footStartX = -17.7;
  const footLength = footEndX - footStartX;
  const footX = (footStartX + footEndX) / 2;
  const headStartZ = -48.45;
  const headEndZ = BELL_CHAMBER.maxZ - 0.2;
  stairbox('bell-stair-foot', footX, -0.12, centerZ, footLength, 0.24, 2 * landingHalfWidth + 0.36, false);
  stairbox('bell-stair-head', centerX, UPPER_FLOOR_Y - 0.12, (headStartZ + headEndZ) / 2, 2 * landingHalfWidth + 0.35, 0.24, headStartZ - headEndZ, false);
  stairbox('bell-stair-vestibule-lintel', footX, LANDING_HEADROOM + 0.18, centerZ, footLength, 0.36, 2 * landingHalfWidth + 0.36, true);
  const vestibuleStartX = -16.65;
  for (const sign of [-1, 1]) {
    stairbox(`bell-stair-vestibule-wall-${sign}`, (vestibuleStartX + footEndX) / 2, LANDING_HEADROOM / 2,
      centerZ + sign * (landingHalfWidth + 0.17), footEndX - vestibuleStartX, LANDING_HEADROOM, 0.34, true);
  }

  stairbox('bell-stair-pier', centerX, shaftHeight / 2, centerZ, 1.88, shaftHeight, 1.88, true);
  batch.add(new THREE.CylinderGeometry(innerRadius + 0.05, innerRadius + 0.05, 0.16, 24).translate(centerX, shaftHeight + 0.12, centerZ), materials.dressedStone);
  batch.add(new THREE.CylinderGeometry(outerRadius + 0.5, outerRadius + 0.5, 0.34, SIDES).translate(centerX, shaftHeight + 0.1, centerZ), materials.wallStone);
  // The flagstones also close the bottom below the first winding treads.
  batch.add(new THREE.CylinderGeometry(outerRadius, outerRadius, 0.2, SIDES).translate(centerX, -0.1, centerZ), materials.floorStone);
}

function stairStrip(angleFrom: number, angleTo: number, heightFrom: number, heightTo: number, thickness: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const uv: number[] = [];
  const append = (angle: number, radius: number, y: number): void => {
    positions.push(centerX + Math.cos(angle) * radius, y, centerZ + Math.sin(angle) * radius);
    uv.push(angle * (innerRadius + outerRadius) / 2, radius * 0.75 + y * 0.2);
  };
  append(angleFrom, innerRadius, heightFrom);
  append(angleFrom, outerRadius, heightFrom);
  append(angleTo, outerRadius, heightTo);
  append(angleTo, innerRadius, heightTo);
  append(angleFrom, innerRadius, heightFrom - thickness);
  append(angleFrom, outerRadius, heightFrom - thickness);
  append(angleTo, outerRadius, heightTo - thickness);
  append(angleTo, innerRadius, heightTo - thickness);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function addSpiralTreads(context: DieKathedraleBuildContext): void {
  const { batch, materials, structure, group } = context;
  const indices: number[] = [];
  const vertices: number[] = [];
  for (let step = 0; step <= steps; step++) {
    const angle = sweep * step / steps;
    const height = UPPER_FLOOR_Y * step / steps;
    for (const radius of [innerRadius, outerRadius]) {
      vertices.push(centerX + Math.cos(angle) * radius, height, centerZ + Math.sin(angle) * radius);
    }
    if (step === steps) break;
    const treadHeight = UPPER_FLOOR_Y * (step + 0.5) / steps;
    const endAngle = sweep * (step + 1) / steps;
    batch.add(stairStrip(angle, endAngle, treadHeight, treadHeight, TREAD_DEPTH), materials.dressedStone);
    const index = step * 2;
    indices.push(index, index + 3, index + 1, index, index + 2, index + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const collider = new THREE.Mesh(geometry, materials.collider);
  collider.name = 'bell-spiral-walking-surface';
  collider.userData.surface = 'concrete';
  collider.userData.mapRole = 'walkable-stair-ramp';
  collider.userData.walkableSurface = true;
  collider.userData.stainFaces = 'none';
  structure.addSolid(collider, false);
  group.add(collider);
}

function addLandingDressing(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  for (const [baseY, x, z, axis] of [[0, -13.98, centerZ, 'z'], [UPPER_FLOOR_Y, centerX, -49.95, 'x']] as const) {
    const a = axis === 'x' ? [x - 1.33, z] : [x, z - 1.33];
    const b = axis === 'x' ? [x + 1.33, z] : [x, z + 1.33];
    for (const [xx, zz] of [a, b]) {
      batch.addBox(materials.dressedStone, xx, baseY + 1.2, zz, 0.28, 2.4, 0.28);
    }
    const arch = archPoints(a[0], a[1], b[0], b[1], baseY + 2.4, 0.75, 6);
    for (const rib of ribGeometries(arch, 0.22, 0.26)) batch.add(rib, materials.dressedStone);
    // The same candle-shaped markers identify both mouths as a route from either side.
    const candleX = a[0] + 0.11;
    const candleZ = a[1] + 0.15;
    batch.addBox(materials.darkWood, candleX, baseY + 1.45, candleZ, 0.37, 0.08, 0.28);
    batch.add(new THREE.CylinderGeometry(0.043, 0.053, 0.22, 7).translate(candleX, baseY + 1.6, candleZ), materials.wax);
    batch.add(new THREE.ConeGeometry(0.038, 0.11, 6).translate(candleX, baseY + 1.74, candleZ), materials.flame);
  }
}
