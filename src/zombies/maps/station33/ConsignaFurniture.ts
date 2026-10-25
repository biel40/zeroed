import * as THREE from 'three';
import type { SurfaceType } from '../../../shooting/HitTarget';
import { placement } from '../shared/StaticMeshBatch';
import { CONSIGNA, CONSIGNA_LOCKER } from '../Station33Config';
import { addLockerBank, ringLockersOn, WallFrame, type LockerBank } from './LockerBank';
import type { Station33BuildContext } from './Station33BuildContext';

const { hall } = CONSIGNA;
const NORTH_WALL = new WallFrame('x', hall.minZ, 1);
const EAST_WALL = new WallFrame('z', hall.maxX, -1);

/** Locker banks along the hall walls, clear of the corridor, the crate and both entrances. */
const LOCKER_BANKS: ReadonlyArray<LockerBank> = [
  { frame: NORTH_WALL, from: hall.minX, to: 16.45, ajar: [3], ringLockers: [] },
  { frame: NORTH_WALL, from: 18.75, to: hall.maxX - CONSIGNA_LOCKER.depth, ajar: [], ringLockers: [] },
  { frame: EAST_WALL, from: hall.minZ + CONSIGNA_LOCKER.depth, to: 13.8, ajar: [1, 13], ringLockers: ringLockersOn(EAST_WALL, 'consigna') },
  { frame: new WallFrame('z', hall.minX, 1), from: 13.4, to: 16.2, ajar: [5], ringLockers: [] },
];

/** Luggage counter in the south-west corner, its shutter rolled down behind it. */
const COUNTER = { minX: 14.3, maxX: 16.2, depth: 0.6, height: 1.05 } as const;
const CART = { x: 18.9, z: 12.6, yaw: 0.5, length: 1.15, width: 0.62 } as const;

/**
 * Solid furnishings of the luggage office. Visuals go to the shared batch;
 * each piece gets one invisible AABB proxy that stops bullets, zombies and
 * the player alike, like the vestibule furniture.
 */
export function buildConsignaFurniture(context: Station33BuildContext): void {
  let plate = 0;
  for (const bank of LOCKER_BANKS) plate = addLockerBank(context, bank, plate);
  addCounter(context);
  addCart(context);
}

function addProxy(context: Station33BuildContext, name: string, min: THREE.Vector3Like, max: THREE.Vector3Like, surface: SurfaceType): void {
  context.structure.addBox(
    (min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2,
    max.x - min.x, max.y - min.y, max.z - min.z,
    context.materials.collider,
    { name, surface, mapRole: 'solid-prop', castShadow: false, uvSeed: 0, blocksPlayer: true },
  );
}

/** Granite-topped timber counter with the corrugated steel shutter of the luggage window behind it. */
function addCounter(context: Station33BuildContext): void {
  const { batch, materials, signage, group } = context;
  const { minX, maxX, depth, height } = COUNTER;
  const centerX = (minX + maxX) / 2;
  const length = maxX - minX;
  const front = hall.maxZ - 0.45;
  const z = front - depth / 2;
  batch.addBox(materials.varnishedWood, centerX, (height - 0.05) / 2, z, length, height - 0.05, depth, 0, 0, 0, 3);
  batch.addBox(materials.darkGranite, centerX, height - 0.02, z - 0.03, length + 0.06, 0.05, depth + 0.1);
  const shutterZ = hall.maxZ - 0.04;
  batch.addBox(materials.greySteel, centerX, 1.25, shutterZ, length, 2.1, 0.06);
  for (let rib = 0; rib < 14; rib++) batch.addBox(materials.greySteel, centerX, 0.28 + rib * 0.14, shutterZ - 0.035, length - 0.04, 0.03, 0.02);
  const plate = new THREE.Mesh(signage.signGeometry('luggage-office', 1.2, 0.6), signage.material);
  plate.position.set(centerX, 2.62, hall.maxZ - 0.012);
  plate.rotation.y = Math.PI;
  plate.userData.mapRole = 'sign';
  group.add(plate);
  addProxy(context, 'luggage-counter', { x: minX - 0.03, y: 0, z: z - depth / 2 - 0.08 }, { x: maxX + 0.03, y: height, z: hall.maxZ }, 'wood');
}

/** Porter's flatbed cart left in the hall with two suitcases still strapped on. */
function addCart(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z, yaw, length, width } = CART;
  const world = placement(x, 0, z, 0, yaw, 0).clone();
  const local = new THREE.Matrix4();
  const part = (geometry: THREE.BufferGeometry, material: THREE.Material, px: number, py: number, pz: number): void => {
    local.makeTranslation(px, py, pz);
    batch.add(geometry, material, world.clone().multiply(local));
  };
  part(new THREE.BoxGeometry(length, 0.04, width), materials.greySteel, 0, 0.3, 0);
  for (const side of [-1, 1]) {
    part(new THREE.CylinderGeometry(0.018, 0.018, 0.72, 6), materials.greySteel, -length / 2 + 0.03, 0.66, side * (width / 2 - 0.04));
    for (const end of [-1, 1]) part(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 12).rotateX(Math.PI / 2), materials.rubber, end * (length / 2 - 0.16), 0.11, side * (width / 2 + 0.02));
  }
  part(new THREE.CylinderGeometry(0.018, 0.018, width - 0.08, 6).rotateX(Math.PI / 2), materials.greySteel, -length / 2 + 0.03, 1.02, 0);
  part(new THREE.BoxGeometry(0.62, 0.2, 0.42), materials.luggage[1], 0.12, 0.42, 0.02);
  part(new THREE.BoxGeometry(0.5, 0.18, 0.36), materials.luggage[2], 0.18, 0.61, -0.03);
  const bounds = new THREE.Box3(new THREE.Vector3(-length / 2, 0, -width / 2 - 0.05), new THREE.Vector3(length / 2, 1.05, width / 2 + 0.05)).applyMatrix4(world);
  addProxy(context, 'luggage-cart', bounds.min, bounds.max, 'metal');
}
