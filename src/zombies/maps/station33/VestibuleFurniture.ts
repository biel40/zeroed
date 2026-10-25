import * as THREE from 'three';
import type { SurfaceType } from '../../../shooting/HitTarget';
import { placement } from '../shared/StaticMeshBatch';
import {
  TICKET_OFFICE,
  TURNSTILE_LINE,
  VESTIBULE,
  VESTIBULE_BENCHES,
  VESTIBULE_COLUMNS,
} from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import { VESTIBULE_VAULT } from './VaultProfile';

const PLINTH_HEIGHT = 0.32;
const SHAFT_TOP = 3.35;

/**
 * Solid furnishings of the vestibule. Visuals go to the shared batch; each
 * piece gets one simple invisible AABB proxy that stops bullets, zombies
 * and the player alike.
 */
export function buildVestibuleFurniture(context: Station33BuildContext): void {
  for (const x of VESTIBULE_COLUMNS.xs) {
    for (const z of VESTIBULE_COLUMNS.zs) addColumn(context, x, z);
  }
  for (const x of TURNSTILE_LINE.xs) addTurnstile(context, x);
  addTicketOffice(context);
  for (const bench of VESTIBULE_BENCHES) addBench(context, bench.id, bench.x, bench.z, bench.yaw, bench.overturned);
  addHangingSign(context);
  addPublicAddressHorns(context, VESTIBULE_COLUMNS.xs[0], TURNSTILE_LINE.z);
}

function addProxy(
  context: Station33BuildContext,
  name: string,
  center: THREE.Vector3Like,
  size: THREE.Vector3Like,
  surface: SurfaceType,
): void {
  context.structure.addBox(center.x, center.y, center.z, size.x, size.y, size.z, context.materials.collider, {
    name, surface, mapRole: 'solid-prop', castShadow: false, uvSeed: 0, blocksPlayer: true,
  });
}

/** Square column: granite plinth, marble shaft, bronze astragal and a flared stucco capital. */
function addColumn(context: Station33BuildContext, x: number, z: number): void {
  const { batch, materials } = context;
  const size = VESTIBULE_COLUMNS.size;
  batch.addBox(materials.darkGranite, x, PLINTH_HEIGHT / 2, z, size + 0.16, PLINTH_HEIGHT, size + 0.16, 0, 0, 0, x + z);
  batch.addBox(materials.columnMarble, x, (PLINTH_HEIGHT + SHAFT_TOP) / 2, z, size, SHAFT_TOP - PLINTH_HEIGHT, size, 0, 0, 0, x * 3 + z);
  batch.addBox(materials.bronze, x, SHAFT_TOP + 0.04, z, size + 0.06, 0.08, size + 0.06);
  // Four-sided frustum, flat shaded, widening into the vault.
  const capitalTop = VESTIBULE_VAULT.heightAt(x) - 0.02;
  const capitalHeight = capitalTop - (SHAFT_TOP + 0.08);
  const capital = new THREE.CylinderGeometry((size + 0.5) * Math.SQRT1_2, (size + 0.08) * Math.SQRT1_2, capitalHeight, 4, 1)
    .rotateY(Math.PI / 4)
    .toNonIndexed();
  capital.computeVertexNormals();
  capital.translate(x, SHAFT_TOP + 0.08 + capitalHeight / 2, z);
  batch.add(capital, materials.stucco);
  addProxy(context, 'column', { x, y: capitalTop / 2, z }, { x: size + 0.16, y: capitalTop, z: size + 0.16 }, 'concrete');
}

/** Turnstile cabinet with a rubber top and its paddles folded open. */
function addTurnstile(context: Station33BuildContext, x: number): void {
  const { batch, materials } = context;
  const { z, width, length, height } = TURNSTILE_LINE;
  batch.addBox(materials.greySteel, x, height / 2, z, width, height, length);
  batch.addBox(materials.rubber, x, height + 0.02, z, width + 0.04, 0.04, length + 0.04);
  batch.addBox(materials.paintedSteel, x, 0.06, z, width + 0.08, 0.12, length + 0.08);
  for (const side of [-1, 1]) {
    batch.addBox(materials.bronze, x + side * (width / 2 + 0.03), 0.78, z - length * 0.25, 0.04, 0.08, 0.42, 0, side * 0.12, 0);
  }
  addProxy(context, 'turnstile', { x, y: height / 2, z }, { x: width + 0.08, y: height + 0.04, z: length + 0.08 }, 'metal');
}

/** Ticket-office facade: wooden panelling, granite counter and three dark windows. */
function addTicketOffice(context: Station33BuildContext): void {
  const { batch, materials, signage, group } = context;
  const { minZ, maxZ, depth, height, windows } = TICKET_OFFICE;
  const backX = VESTIBULE.minX;
  const frontX = backX + depth;
  const centerZ = (minZ + maxZ) / 2;
  const length = maxZ - minZ;
  const centerX = (backX + frontX) / 2;
  batch.addBox(materials.varnishedWood, centerX, 0.5, centerZ, depth, 1, length);
  batch.addBox(materials.darkGranite, frontX - 0.02, 1.03, centerZ, 0.34, 0.06, length + 0.06);
  batch.addBox(materials.varnishedWood, centerX, 2.35, centerZ, depth, 0.7, length);
  batch.addBox(materials.stucco, centerX + 0.03, height - 0.03, centerZ, depth + 0.08, 0.1, length + 0.1);
  const bay = length / windows;
  for (let index = 0; index <= windows; index++) {
    batch.addBox(materials.varnishedWood, centerX, 1.53, minZ + index * bay, depth, 0.94, 0.16);
  }
  for (let index = 0; index < windows; index++) {
    const z = minZ + bay * (index + 0.5);
    batch.addBox(materials.windowGlass, frontX - 0.12, 1.53, z, 0.03, 0.94, bay - 0.16);
    batch.addBox(materials.bronze, frontX - 0.1, 1.53, z, 0.04, 0.05, bay - 0.16);
    batch.addBox(materials.bronze, frontX - 0.1, 1.09, z, 0.04, 0.05, bay * 0.35);
  }
  const plate = new THREE.Mesh(signage.signGeometry('ticket-office', 1.8, 0.45), signage.material);
  plate.position.set(frontX + 0.012, 2.38, centerZ);
  plate.rotation.y = Math.PI / 2;
  plate.userData.mapRole = 'sign';
  group.add(plate);
  addProxy(context, 'ticket-office', { x: centerX, y: height / 2, z: centerZ }, { x: depth, y: height, z: length }, 'wood');
}

/**
 * Slatted wooden bench on bronze ends, built along local X. An overturned
 * one lies on its back, seat edge up.
 */
function addBench(context: Station33BuildContext, name: string, x: number, z: number, yaw: number, overturned: boolean): void {
  const { batch, materials } = context;
  const length = 2;
  // Local frame: X along the bench, Y up, +Z towards the sitter's knees.
  const parts: Array<[THREE.Material, number, number, number, number, number, number]> = [
    [materials.varnishedWood, 0, 0.45, 0.02, length, 0.05, 0.42],
    [materials.varnishedWood, 0, 0.72, -0.21, length, 0.4, 0.05],
    [materials.bronze, -length / 2 + 0.08, 0.45, 0, 0.06, 0.9, 0.5],
    [materials.bronze, length / 2 - 0.08, 0.45, 0, 0.06, 0.9, 0.5],
  ];
  const benchMatrix = overturned
    ? placement(x, 0.25, z, -Math.PI / 2, yaw, 0)
    : placement(x, 0, z, 0, yaw, 0);
  const world = benchMatrix.clone();
  const local = new THREE.Matrix4();
  for (const [material, px, py, pz, width, height, depth] of parts) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    local.makeTranslation(px, overturned ? py - 0.45 : py, pz);
    batch.add(geometry, material, world.clone().multiply(local));
  }
  const bounds = new THREE.Box3();
  const box = new THREE.Box3(new THREE.Vector3(-length / 2, overturned ? -0.45 : 0, -0.25), new THREE.Vector3(length / 2, overturned ? 0.45 : 0.92, 0.25));
  bounds.copy(box).applyMatrix4(world);
  const size = bounds.getSize(new THREE.Vector3());
  // Lying flat it would slip under the zombie obstacle height; keep the proxy tall enough to block.
  size.y = Math.max(size.y, 0.6);
  const center = bounds.getCenter(new THREE.Vector3());
  center.y = size.y / 2;
  addProxy(context, name, center, size, 'wood');
}

/** Double-sided direction board over the turnstiles, hung on two rods. */
function addHangingSign(context: Station33BuildContext): void {
  const { batch, materials, signage, group } = context;
  const y = 3.0;
  const z = TURNSTILE_LINE.z;
  batch.addBox(materials.greySteel, 0, y, z, 2.5, 0.64, 0.06);
  for (const x of [-1.05, 1.05]) {
    const top = VESTIBULE_VAULT.heightAt(x);
    batch.addBox(materials.greySteel, x, (y + 0.32 + top) / 2, z, 0.025, top - y - 0.32, 0.025);
  }
  const south = new THREE.Mesh(signage.signGeometry('to-trains', 2.4, 0.56), signage.material);
  south.position.set(0, y, z + 0.035);
  const north = new THREE.Mesh(signage.signGeometry('exit', 2.4, 0.56), signage.material);
  north.position.set(0, y, z - 0.035);
  north.rotation.y = Math.PI;
  for (const sign of [south, north]) {
    sign.userData.mapRole = 'sign';
    group.add(sign);
  }
}

/** Loudspeaker horns of the public-address system, strapped to a column. */
function addPublicAddressHorns(context: Station33BuildContext, columnX: number, columnZ: number): void {
  const { batch, materials } = context;
  const half = VESTIBULE_COLUMNS.size / 2;
  for (const facing of [1, -1]) {
    const horn = new THREE.CylinderGeometry(0.15, 0.03, 0.34, 12, 1, true);
    horn.rotateX(facing * Math.PI / 2 + 0.25 * facing);
    horn.translate(columnX, 3.25, columnZ + facing * (half + 0.2));
    batch.add(horn, materials.greySteel);
    batch.addBox(materials.greySteel, columnX, 3.25, columnZ + facing * (half + 0.03), 0.1, 0.1, 0.08);
  }
}
