import * as THREE from 'three';
import { seededRandom } from '../shared/ProceduralNoise';
import { placement } from '../shared/StaticMeshBatch';
import { STATION33_BARRIERS, VESTIBULE, VESTIBULE_COLUMNS } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { SignId } from './Station33Signage';

/** Which way a wall-mounted plane faces, i.e. the hall side of its wall. */
type Facing = '+x' | '-x' | '+z' | '-z';

const FACING_YAW: Readonly<Record<Facing, number>> = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 };

/** Surface-entrance doorways in the south wall that the collapse buried. */
const BURIED_DOOR_XS = [0, 3.6] as const;
const SOUTH_FACE_Z = VESTIBULE.maxZ;

/**
 * Story and wear of the vestibule, all non-solid: signage, the buried
 * surface doors, what the evacuation left behind (luggage, bags, trampled
 * notices, a fallen fence), blood and seepage. Litter stays under the
 * zombie obstacle height and away from the entrances.
 */
export function buildVestibuleDressing(context: Station33BuildContext): void {
  addSignage(context);
  for (const x of BURIED_DOOR_XS) addBuriedDoor(context, x);
  addExitLightbox(context);
  addLuggage(context);
  addLooseLitter(context);
  addFallenFences(context);
  addCollapsedPatch(context);
  addDecals(context);
}

function addSign(context: Station33BuildContext, id: SignId, x: number, y: number, z: number, width: number, height: number, facing: Facing): void {
  const sign = new THREE.Mesh(context.signage.signGeometry(id, width, height), context.signage.material);
  sign.position.set(x, y, z);
  sign.rotation.y = FACING_YAW[facing];
  sign.userData.mapRole = 'sign';
  context.group.add(sign);
}

function addSignage(context: Station33BuildContext): void {
  const half = VESTIBULE_COLUMNS.size / 2 + 0.005;
  addSign(context, 'no-smoking', VESTIBULE_COLUMNS.xs[1], 1.75, VESTIBULE_COLUMNS.zs[2] + half, 0.52, 0.26, '+z');
  addSign(context, 'no-smoking', VESTIBULE_COLUMNS.xs[0], 1.75, VESTIBULE_COLUMNS.zs[0] - half, 0.52, 0.26, '-z');
  addSign(context, 'civil-defence', VESTIBULE.maxX - 0.01, 1.75, 12.4, 0.62, 0.93, '-x');
  addSign(context, 'torn-poster-a', VESTIBULE.minX + 0.01, 1.55, 2.6, 0.6, 0.9, '+x');
  addSign(context, 'torn-poster-b', VESTIBULE.minX + 0.01, 1.45, 6.0, 0.55, 0.82, '+x');
  addSign(context, 'torn-poster-a', VESTIBULE.maxX - 0.01, 1.5, 4.2, 0.6, 0.9, '-x');
}

/** Glass doors with bronze frames, cracked and choked by rubble from the collapsed stairway. */
function addBuriedDoor(context: Station33BuildContext, x: number): void {
  const { batch, materials } = context;
  const z = SOUTH_FACE_Z - 0.03;
  for (const side of [-1, 1]) {
    batch.addBox(materials.bronze, x + side * 0.92, 1.25, z, 0.1, 2.5, 0.08);
    batch.addBox(materials.windowGlass, x + side * 0.44, 1.12, z + 0.01, 0.82, 2.2, 0.03);
    batch.addBox(materials.bronze, x + side * 0.44, 1.12, z - 0.01, 0.06, 2.2, 0.05);
  }
  batch.addBox(materials.bronze, x, 2.5, z, 1.94, 0.1, 0.08);
  batch.addBox(materials.bronze, x, 1.05, z - 0.02, 1.7, 0.05, 0.05);
  const random = seededRandom(Math.round(x * 100) + 71);
  for (let index = 0; index < 9; index++) {
    const size = 0.18 + random() * 0.26;
    batch.addBox(
      materials.rubble,
      x + (random() - 0.5) * 1.6,
      size * 0.35,
      z - 0.08 - random() * 0.55,
      size, Math.min(0.42, size * 0.8), size * (0.7 + random() * 0.5),
      random() * 0.6, random() * Math.PI, random() * 0.6,
    );
  }
}

/** "Way out to the city" lightbox over the buried doors: the cruellest sign in the hall. */
function addExitLightbox(context: Station33BuildContext): void {
  const { batch, materials, signage, group } = context;
  batch.addBox(materials.greySteel, 0, 3.0, SOUTH_FACE_Z - 0.08, 2.7, 0.62, 0.16);
  const face = new THREE.Mesh(signage.signGeometry('exit', 2.5, 0.5), signage.litMaterial);
  face.position.set(0, 3.0, SOUTH_FACE_Z - 0.165);
  face.rotation.y = Math.PI;
  face.userData.mapRole = 'lightbox';
  group.add(face);
}

/** Suitcases dropped flat in the rush for the escalators and the way out. */
function addLuggage(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const cases: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [-1.5, 0.9, 0.3, 0.62, 0.42, 0.2],
    [1.3, 1.5, -0.6, 0.55, 0.38, 0.18],
    [2.6, 0.75, 1.2, 0.7, 0.45, 0.22],
    [-0.6, 10.1, 0.9, 0.6, 0.4, 0.2],
    [2.4, 8.0, -0.2, 0.5, 0.36, 0.18],
    [-5.4, 9.6, 1.6, 0.66, 0.44, 0.2],
    [5.5, 14.6, 0.4, 0.6, 0.4, 0.2],
  ];
  cases.forEach(([x, z, yaw, width, depth, height], index) => {
    const material = materials.luggage[index % materials.luggage.length];
    batch.addBox(material, x, height / 2, z, width, height, depth, 0, yaw, 0);
    batch.addBox(materials.bronze, x, height + 0.01, z, 0.16, 0.02, 0.04, 0, yaw, 0);
  });
  const bags: ReadonlyArray<readonly [number, number, number]> = [[0.7, 2.3, 0.4], [-2.4, 7.6, 1.1], [3.0, 10.7, 2.2], [-4.6, 16.0, 0.2], [4.2, 5.6, 2.8]];
  bags.forEach(([x, z, yaw], index) => {
    const bag = new THREE.SphereGeometry(0.22, 10, 6).scale(1.3, 0.55, 0.9);
    bag.rotateY(yaw);
    bag.translate(x, 0.11, z);
    batch.add(bag, materials.luggage[(index + 2) % materials.luggage.length]);
  });
}

/** Leaflets and newspaper sheets trampled across the floor. */
function addLooseLitter(context: Station33BuildContext): void {
  const random = seededRandom(3371);
  for (let index = 0; index < 26; index++) {
    const sheet = new THREE.PlaneGeometry(0.21 + random() * 0.15, 0.3 + random() * 0.1);
    sheet.rotateX(-Math.PI / 2);
    sheet.rotateY(random() * Math.PI * 2);
    sheet.translate(
      THREE.MathUtils.lerp(VESTIBULE.minX + 0.8, VESTIBULE.maxX - 0.8, random()),
      0.004 + index * 0.0002,
      THREE.MathUtils.lerp(VESTIBULE.minZ + 0.6, VESTIBULE.maxZ - 0.6, random()),
    );
    context.batch.add(sheet, context.materials.paper);
  }
}

/** Crowd-control fence sections torn out of the side aisles and left lying flat. */
function addFallenFences(context: Station33BuildContext): void {
  const { batch, materials } = context;
  for (const [x, z, yaw] of [[-5.3, 9.2, 0.15], [5.2, 9.5, -0.2]] as const) {
    const world = placement(x, 0.025, z, 0, yaw, 0).clone();
    const local = new THREE.Matrix4();
    const pieces: Array<[number, number, number, number]> = [[-0.42, 0, 0.04, 1.8], [0.42, 0, 0.04, 1.8]];
    for (let bar = 0; bar < 7; bar++) pieces.push([0, -0.84 + bar * 0.28, 0.84, 0.03]);
    for (const [px, pz, width, depth] of pieces) {
      local.makeTranslation(px, 0, pz);
      batch.add(new THREE.BoxGeometry(width, 0.04, depth), materials.paintedSteel, world.clone().multiply(local));
    }
  }
}

/** A slab of vault plaster that came down; the drips under its hole keep the floor wet. */
function addCollapsedPatch(context: Station33BuildContext): void {
  const random = seededRandom(3389);
  for (let index = 0; index < 8; index++) {
    const size = 0.12 + random() * 0.3;
    context.batch.addBox(
      context.materials.vaultPlaster,
      4.6 + (random() - 0.5) * 1.2,
      size * 0.25,
      15.0 + (random() - 0.5) * 1.0,
      size * 1.4, Math.min(0.2, size * 0.5), size,
      random() * 0.4, random() * Math.PI, random() * 0.4,
    );
  }
}

function addDecal(context: Station33BuildContext, material: THREE.Material, x: number, y: number, z: number, width: number, height: number, facing: Facing | 'floor', yaw = 0): void {
  const decal = new THREE.PlaneGeometry(width, height);
  if (facing === 'floor') {
    decal.rotateX(-Math.PI / 2);
    decal.rotateY(yaw);
  } else {
    decal.rotateY(FACING_YAW[facing]);
  }
  decal.translate(x, y, z);
  context.batch.add(decal, material);
}

function addDecals(context: Station33BuildContext): void {
  const { materials } = context;
  const columnFace = VESTIBULE_COLUMNS.xs[1] - VESTIBULE_COLUMNS.size / 2 - 0.006;
  addDecal(context, materials.bloodSplatter, columnFace, 1.35, VESTIBULE_COLUMNS.zs[0], 1.0, 1.2, '-x');
  const gate = STATION33_BARRIERS.find((barrier) => barrier.id === 'surface-stairs')!;
  addDecal(context, materials.bloodSmear, gate.x + 1.45, 1.2, SOUTH_FACE_Z - 0.006, 1.3, 1.1, '-z');
  addDecal(context, materials.bloodSmear, gate.x + 0.6, 0.006, SOUTH_FACE_Z - 1.6, 1.7, 1.0, 'floor', 0.7);
  addDecal(context, materials.bloodSplatter, 3.9, 1.3, VESTIBULE.minZ + 0.006, 0.9, 1.0, '+z');
  for (const z of [2.0, 7.1, 11.4, 16.0]) addDecal(context, materials.waterStreak, VESTIBULE.minX + 0.006, 3.05, z, 1.1, 1.4, '+x');
  for (const z of [3.4, 10.0, 15.0]) addDecal(context, materials.waterStreak, VESTIBULE.maxX - 0.006, 3.05, z, 1.1, 1.4, '-x');
  const random = seededRandom(3391);
  for (let index = 0; index < 9; index++) {
    const size = 1.2 + random() * 1.4;
    addDecal(
      context, materials.floorGrime,
      THREE.MathUtils.lerp(VESTIBULE.minX + 1, VESTIBULE.maxX - 1, random()),
      0.003 + index * 0.0003,
      THREE.MathUtils.lerp(VESTIBULE.minZ + 1, VESTIBULE.maxZ - 1, random()),
      size, size * (0.6 + random() * 0.4), 'floor', random() * Math.PI,
    );
  }
}
