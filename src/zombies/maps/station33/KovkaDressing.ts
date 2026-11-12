import * as THREE from 'three';
import { seededRandom } from '../shared/ProceduralNoise';
import { addSolidProxy } from '../shared/SolidProxy';
import { placement, type StaticMeshBatch } from '../shared/StaticMeshBatch';
import { KOVKA, KOVKA_CORRIDOR, KOVKA_REACTOR } from '../Station33Config';
import type { KovkaMaterials } from './KovkaMaterials';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

const { hall, pit } = KOVKA;
/**
 * Three barred cells against the south wall's west end, where the test
 * subjects were kept: the first one torn open from inside.
 */
export const KOVKA_CAGES = { minX: hall.minX + 0.2, cells: 3, cellWidth: 1.5, depth: 1.4, height: 2.3, barSpacing: 0.15, door: 0.7 } as const;
const CAGES_MAX_X = KOVKA_CAGES.minX + KOVKA_CAGES.cells * KOVKA_CAGES.cellWidth;
const CAGES_FRONT_Z = hall.maxZ - KOVKA_CAGES.depth;
/** The operators' console at the pit rail, east of the upgrade site, facing the reactor. */
export const KOVKA_CONSOLE = { x: -11.6, z: pit.maxZ + 0.75, width: 2.6, depth: 0.8, height: 0.78 } as const;
/** A stretcher left by the cages with a body bag strapped to it. */
export const KOVKA_GURNEY = { x: -19.6, z: hall.maxZ - 1.9, yaw: 0.25, length: 2.0, width: 0.65, height: 0.85 } as const;
/** The flood at the bottom of the pit: the reactor's lowest edge just dips into it. */
const WATER_Y = pit.floorY + 1.15;
const BAR = 0.025;

/**
 * What the forge was used for, told by the room: barred cells for test
 * subjects (one burst open from inside, its trail of blood running out to
 * the corridor), a stretcher with a body bag, the operators' console
 * abandoned by the rail with one screen still flickering, meat hooks on
 * chains, black water flooding the pit with a body bag afloat, burns on the
 * deck before the reactor's face, seepage and webs. Static batch geometry;
 * the cells, stretcher and console are solids.
 */
export function buildKovkaDressing(context: Station33BuildContext, kovka: KovkaMaterials, lighting: Station33Lighting): void {
  addCages(context, kovka);
  addGurney(context);
  addConsole(context, lighting);
  addFlood(context, kovka);
  addHooks(context);
  addSigns(context, kovka);
  addDecals(context);
}

/** Box placed in a local frame `world` (position and yaw of a prop). */
function addLocalBox(batch: StaticMeshBatch, material: THREE.Material, world: THREE.Matrix4, x: number, y: number, z: number, width: number, height: number, depth: number, rotationX = 0, rotationZ = 0): void {
  const local = placement(x, y, z, rotationX, 0, rotationZ).clone();
  batch.add(new THREE.BoxGeometry(width, height, depth), material, world.clone().multiply(local));
}

/** Vertical bars from `from` to `to` along one axis, at `fixed` on the other, skipping the span in `gap`. */
function addBars(batch: StaticMeshBatch, material: THREE.Material, axis: 'x' | 'z', fixed: number, from: number, to: number, gap?: readonly [number, number]): void {
  const { height, barSpacing } = KOVKA_CAGES;
  for (let along = from + barSpacing / 2; along < to; along += barSpacing) {
    if (gap && along > gap[0] && along < gap[1]) continue;
    if (axis === 'x') batch.addBox(material, along, height / 2, fixed, BAR, height, BAR);
    else batch.addBox(material, fixed, height / 2, along, BAR, height, BAR);
  }
}

/**
 * The cells: barred fronts and dividers in rails top and bottom, a door in
 * each front. The first door hangs wide open and two of its bars are bent
 * out; the second is padlocked over a filthy mattress, with shackles on the
 * wall and claw marks round them; the third is shut, its bars snapped.
 */
function addCages(context: Station33BuildContext, kovka: KovkaMaterials): void {
  const { batch, materials, signage, group } = context;
  const { minX, cells, cellWidth, depth, height, door } = KOVKA_CAGES;
  const steel = materials.greySteel;
  for (const y of [0.04, height - 0.02]) {
    batch.addBox(steel, (minX + CAGES_MAX_X) / 2, y, CAGES_FRONT_Z, CAGES_MAX_X - minX, 0.05, 0.05);
    for (let cell = 1; cell <= cells; cell++) batch.addBox(steel, minX + cell * cellWidth, y, CAGES_FRONT_Z + depth / 2, 0.05, 0.05, depth);
  }
  batch.addBox(kovka.wallPaint, (minX + CAGES_MAX_X) / 2, height + 0.02, CAGES_FRONT_Z + depth / 2, CAGES_MAX_X - minX, 0.04, depth);
  for (let cell = 0; cell < cells; cell++) {
    const left = minX + cell * cellWidth;
    const doorCenter = left + cellWidth / 2;
    const doorGap = [doorCenter - door / 2, doorCenter + door / 2] as const;
    addBars(batch, steel, 'x', CAGES_FRONT_Z, left, left + cellWidth, doorGap);
    addBars(batch, steel, 'z', left + cellWidth, CAGES_FRONT_Z, hall.maxZ);
    for (const x of doorGap) batch.addBox(steel, x, height / 2, CAGES_FRONT_Z, 0.06, height, 0.06);
    // Cell number tags facing the deck (north).
    const plate = signage.lockerPlateGeometry(7 + cell, 0.24, 0.12).rotateY(Math.PI).translate(doorCenter, height - 0.15, CAGES_FRONT_Z - 0.04);
    batch.add(plate, signage.material);
    if (cell === 0) addOpenCellDoor(batch, steel, doorGap[0]);
    else addShutCellDoor(batch, steel, doorGap, cell === 1);
  }
  // Bent bars of the first cell, sprung outwards.
  for (const [x, lean] of [[minX + 0.18, -0.35], [minX + 0.33, -0.22]] as const) {
    batch.addBox(steel, x, 1.0, CAGES_FRONT_Z - 0.2, BAR, 1.4, BAR, lean);
  }
  addCellInteriors(context, kovka);
  addSolidProxy(context, 'kovka-cages', { x: hall.minX, y: 0, z: CAGES_FRONT_Z - 0.04 }, { x: CAGES_MAX_X + 0.04, y: height, z: hall.maxZ }, 'metal', 'none');
  // The open door's leaf stands out across the deck.
  addSolidProxy(context, 'kovka-cage-door', { x: KOVKA_CAGES.minX + (cellWidth - door) / 2 - 0.05, y: 0, z: CAGES_FRONT_Z - door }, { x: KOVKA_CAGES.minX + (cellWidth - door) / 2 + 0.05, y: height - 0.1, z: CAGES_FRONT_Z }, 'metal', 'none');
  const sign = new THREE.Mesh(signage.signGeometry('test-subjects', 0.9, 0.45), signage.material);
  sign.position.set((minX + CAGES_MAX_X) / 2, height + 0.42, hall.maxZ - 0.015);
  sign.rotation.y = Math.PI;
  sign.userData.mapRole = 'sign';
  group.add(sign);
}

/** The first cell's door, swung right out on its hinge at `hingeX`. */
function addOpenCellDoor(batch: StaticMeshBatch, steel: THREE.Material, hingeX: number): void {
  const { door, height, barSpacing } = KOVKA_CAGES;
  const world = placement(hingeX, 0, CAGES_FRONT_Z, 0, Math.PI / 2 + 0.15, 0).clone();
  for (const y of [0.15, height - 0.2]) addLocalBox(batch, steel, world, door / 2, y, 0, door, 0.05, 0.05);
  for (let along = barSpacing / 2; along < door; along += barSpacing) addLocalBox(batch, steel, world, along, height / 2 - 0.02, 0, BAR, height - 0.4, BAR);
}

/** A shut door in its gap; the second cell's is padlocked, the third's has its middle bars snapped. */
function addShutCellDoor(batch: StaticMeshBatch, steel: THREE.Material, gap: readonly [number, number], padlocked: boolean): void {
  const { height, barSpacing } = KOVKA_CAGES;
  for (const y of [0.15, height - 0.2]) batch.addBox(steel, (gap[0] + gap[1]) / 2, y, CAGES_FRONT_Z, gap[1] - gap[0], 0.05, 0.05);
  let index = 0;
  for (let x = gap[0] + barSpacing / 2; x < gap[1]; x += barSpacing, index++) {
    const snapped = !padlocked && (index === 2 || index === 3);
    if (snapped) {
      batch.addBox(steel, x, 0.45, CAGES_FRONT_Z, BAR, 0.6, BAR);
      batch.addBox(steel, x, height - 0.55, CAGES_FRONT_Z - 0.06, BAR, 0.7, BAR, 0.4);
    } else {
      batch.addBox(steel, x, height / 2, CAGES_FRONT_Z, BAR, height - 0.3, BAR);
    }
  }
  if (padlocked) {
    batch.addBox(steel, gap[1] - 0.06, 1.05, CAGES_FRONT_Z - 0.05, 0.07, 0.09, 0.03);
    batch.add(new THREE.TorusGeometry(0.03, 0.007, 4, 8, Math.PI).translate(gap[1] - 0.06, 1.1, CAGES_FRONT_Z - 0.05), steel);
  }
}

/** Mattress, shackles and claw marks in the second cell; a bucket and a chain in the third. */
function addCellInteriors(context: Station33BuildContext, kovka: KovkaMaterials): void {
  const { batch, materials } = context;
  const { minX, cellWidth } = KOVKA_CAGES;
  const second = minX + cellWidth * 1.5;
  const third = minX + cellWidth * 2.5;
  const back = hall.maxZ - 0.02;
  batch.addBox(materials.burlap, second + 0.1, 0.06, hall.maxZ - 0.55, 0.75, 0.1, 1.6, 0, 0.12);
  for (const side of [-1, 1]) {
    const ring = new THREE.Vector3(second + side * 0.35, 1.55, back);
    batch.addBox(materials.greySteel, ring.x, ring.y, back - 0.02, 0.08, 0.08, 0.04);
    const chain = new THREE.CatmullRomCurve3([ring, new THREE.Vector3(ring.x + side * 0.05, 1.0, back - 0.12), new THREE.Vector3(ring.x + side * 0.1, 0.62, back - 0.08)]);
    batch.add(new THREE.TubeGeometry(chain, 6, 0.015, 4), materials.greySteel);
    batch.add(new THREE.TorusGeometry(0.06, 0.015, 4, 10).rotateY(Math.PI / 2).translate(ring.x + side * 0.1, 0.56, back - 0.08), materials.greySteel);
  }
  const random = seededRandom(6271);
  for (let set = 0; set < 3; set++) {
    const x = second - 0.5 + random();
    const y = 0.6 + random() * 1.1;
    for (let claw = 0; claw < 4; claw++) {
      batch.addBox(materials.rubber, x + claw * 0.03, y - claw * 0.02, back - 0.005, 0.008, 0.3 + random() * 0.15, 0.004, 0, 0.15);
    }
  }
  batch.add(new THREE.CylinderGeometry(0.15, 0.12, 0.3, 10, 1, true).rotateZ(Math.PI / 2).translate(third - 0.25, 0.15, hall.maxZ - 0.5), kovka.primer);
  const chain = new THREE.CatmullRomCurve3([
    new THREE.Vector3(third + 0.3, 1.4, back), new THREE.Vector3(third + 0.32, 0.4, back - 0.1), new THREE.Vector3(third, 0.02, back - 0.6),
  ]);
  batch.add(new THREE.TubeGeometry(chain, 8, 0.015, 4), materials.greySteel);
}

/** Stretcher on castors, the body bag strapped to it and a second bag dropped on the deck beside it. */
function addGurney(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z, yaw, length, width, height } = KOVKA_GURNEY;
  const world = placement(x, 0, z, 0, yaw, 0).clone();
  addLocalBox(batch, materials.greySteel, world, 0, height, 0, length, 0.05, width);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addLocalBox(batch, materials.greySteel, world, sx * (length / 2 - 0.1), (height - 0.08) / 2 + 0.08, sz * (width / 2 - 0.05), 0.035, height - 0.08, 0.035);
      batch.add(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 8).rotateX(Math.PI / 2).applyMatrix4(world.clone().multiply(placement(sx * (length / 2 - 0.1), 0.05, sz * (width / 2 - 0.05)))), materials.rubber);
    }
  }
  addLocalBox(batch, materials.greySteel, world, 0, 0.3, 0, length - 0.2, 0.03, width - 0.1);
  const bag = new THREE.CapsuleGeometry(0.24, length - 0.6, 3, 8).rotateZ(Math.PI / 2).scale(1, 0.62, 1);
  batch.add(bag, materials.rubber, world.clone().multiply(placement(0, height + 0.17, 0)));
  for (const along of [-0.5, 0.35]) addLocalBox(batch, materials.luggage[0], world, along, height + 0.18, 0, 0.07, 0.34, width + 0.02);
  const dropped = new THREE.CapsuleGeometry(0.24, 1.2, 3, 8).rotateZ(Math.PI / 2).scale(1, 0.55, 1).rotateY(-0.6).translate(x + 1.6, 0.14, z + 0.4);
  batch.add(dropped, materials.rubber);
  addSolidProxy(context, 'kovka-gurney', { x: x - 1.05, y: 0, z: z - 0.55 }, { x: x + 1.05, y: height + 0.35, z: z + 0.55 }, 'metal', 'none');
}

/**
 * The operators' console by the rail: a cabinet with a sloping panel of
 * dials and switches, three CRTs on an instrument shelf (one still
 * flickering on a failing circuit), a telephone off its hook and the operator's chair kicked over.
 */
function addConsole(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  const { x, z, width, depth, height } = KOVKA_CONSOLE;
  const front = z + depth / 2;
  batch.addBox(materials.greySteel, x, height / 2, z, width, height, depth);
  batch.addBox(materials.greySteel, x, height + 0.12, z + 0.08, width, 0.05, 0.6, -0.45);
  for (let index = 0; index < 8; index++) {
    const dialX = x - width / 2 + 0.2 + index * 0.31;
    batch.add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8).rotateX(Math.PI / 2 - 0.45).translate(dialX, height + 0.16, z + 0.04), materials.stucco);
    batch.addBox(materials.rubber, dialX, height + 0.07, z + 0.27, 0.025, 0.06, 0.025, -0.45 + (index % 3) * 0.5);
  }
  // The CRTs stand on an instrument shelf bridging the back of the panel:
  // a back plate, two end cheeks and the shelf plate under the sets.
  const shelfTop = height + 0.29;
  const shelfZ = z - 0.19;
  const shelfDepth = 0.46;
  batch.addBox(materials.greySteel, x, shelfTop - 0.015, shelfZ, width, 0.03, shelfDepth);
  batch.addBox(materials.greySteel, x, height + (shelfTop - 0.03 - height) / 2, z - depth / 2 + 0.02, width, shelfTop - 0.03 - height, 0.04);
  for (const side of [-1, 1]) {
    batch.addBox(materials.greySteel, x + side * (width / 2 - 0.02), height + (shelfTop - height) / 2, shelfZ, 0.04, shelfTop - height, shelfDepth);
  }
  for (let screen = 0; screen < 3; screen++) {
    const screenX = x - 0.8 + screen * 0.8;
    batch.addBox(materials.paintedSteel, screenX, shelfTop + 0.21, z - 0.2, 0.5, 0.42, 0.42);
    const glass = screen === 1 ? lighting.circuitMaterial('failing') : materials.windowGlass;
    batch.add(new THREE.PlaneGeometry(0.38, 0.29).translate(screenX, shelfTop + 0.21, z + 0.012), glass);
  }
  batch.addBox(materials.rubber, x + 1.05, height + 0.32, z - 0.25, 0.22, 0.1, 0.18);
  const cord = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x + 1.05, height + 0.35, z - 0.15), new THREE.Vector3(x + 1.2, height - 0.1, front + 0.1), new THREE.Vector3(x + 1.15, 0.35, front + 0.15),
  ]);
  batch.add(new THREE.TubeGeometry(cord, 8, 0.008, 4), materials.rubber);
  batch.addBox(materials.rubber, x + 1.15, 0.3, front + 0.15, 0.06, 0.2, 0.05, 0.3);
  // The chair on its back behind the console.
  const chair = placement(x - 0.4, 0.22, front + 0.75, -Math.PI / 2 + 0.15, 0.7, 0).clone();
  addLocalBox(batch, materials.varnishedWood, chair, 0, 0, 0, 0.45, 0.04, 0.45);
  addLocalBox(batch, materials.varnishedWood, chair, 0, 0.25, -0.21, 0.45, 0.45, 0.03);
  for (const [lx, lz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as const) addLocalBox(batch, materials.greySteel, chair, lx, -0.22, lz, 0.03, 0.44, 0.03);
  addSolidProxy(context, 'kovka-console', { x: x - width / 2, y: 0, z: z - depth / 2 - 0.25 }, { x: x + width / 2, y: height + 0.75, z: front }, 'metal', 'none');
}

/**
 * Black water a metre deep at the bottom of the pit, the reactor's lowest
 * edge and the stair's foot in it; a body bag and an oil drum afloat, and
 * sodden papers.
 */
function addFlood(context: Station33BuildContext, kovka: KovkaMaterials): void {
  const { batch, materials } = context;
  const water = new THREE.PlaneGeometry(pit.maxX - pit.minX, pit.maxZ - pit.minZ).rotateX(-Math.PI / 2);
  batch.add(water.translate((pit.minX + pit.maxX) / 2, WATER_Y, (pit.minZ + pit.maxZ) / 2), kovka.pitWater);
  const bag = new THREE.CapsuleGeometry(0.24, 1.3, 3, 8).rotateZ(Math.PI / 2).scale(1, 0.55, 1).rotateY(1.2);
  batch.add(bag.translate(pit.maxX - 1.6, WATER_Y + 0.04, pit.maxZ - 6.5), materials.rubber);
  const drum = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 12).rotateZ(Math.PI / 2).rotateY(0.5);
  batch.add(drum.translate(pit.minX + 0.75, WATER_Y + 0.08, pit.minZ + 2.4), kovka.primer);
  const random = seededRandom(6277);
  for (let index = 0; index < 7; index++) {
    const sheet = new THREE.PlaneGeometry(0.2, 0.28).rotateX(-Math.PI / 2).rotateY(random() * Math.PI * 2);
    const side = random() < 0.5 ? pit.minX + 0.4 + random() * 0.6 : pit.maxX - 0.4 - random() * 0.6;
    batch.add(sheet.translate(side, WATER_Y + 0.004, pit.minZ + 1 + random() * (pit.maxZ - pit.minZ - 2)), materials.paper);
  }
}

/** Two meat hooks on chains from the vault, over the deck by the cells and by the corridor's mouth, above head height. */
function addHooks(context: Station33BuildContext): void {
  const { batch, materials } = context;
  for (const [x, z, bottom] of [[CAGES_MAX_X + 0.8, hall.maxZ - 2.6, 2.3], [hall.maxX - 2.3, KOVKA_CORRIDOR.maxZ + 1.4, 2.6]] as const) {
    const top = 6.2;
    batch.add(new THREE.CylinderGeometry(0.02, 0.02, top - bottom, 4).translate(x, (top + bottom) / 2, z), materials.greySteel);
    batch.add(new THREE.TorusGeometry(0.12, 0.022, 4, 10, Math.PI * 1.3).rotateZ(Math.PI * 0.85).translate(x + 0.02, bottom - 0.1, z), materials.greySteel);
  }
}

/** The object's name stencilled over the upgrade site and a flickering radiation lightbox on each mast. */
function addSigns(context: Station33BuildContext, kovka: KovkaMaterials): void {
  const { batch, signage } = context;
  batch.add(signage.signGeometry('kovka-stencil', 3.6, 0.9).rotateY(Math.PI).translate(KOVKA_REACTOR.x, 3.4, hall.maxZ - 0.015), signage.material);
  const mastFront = KOVKA_REACTOR.frontZ + 0.45 + 0.24;
  for (const side of [-1, 1]) {
    const x = KOVKA_REACTOR.x + side * 5.9;
    batch.addBox(kovka.primer, x, 3.6, mastFront - 0.03, 0.9, 0.5, 0.05);
    batch.add(signage.signGeometry('radiation', 0.8, 0.4).translate(x, 3.6, mastFront), signage.litMaterial);
  }
}

function addFloorDecal(batch: StaticMeshBatch, material: THREE.Material, x: number, z: number, width: number, depth: number, yaw: number, lift = 0.006): void {
  batch.add(new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2).rotateY(yaw).translate(x, lift, z), material);
}

/**
 * The escaped subject's trail from the open cell across the deck into the
 * corridor, spatter in the cells and on the console, burns on the deck in
 * front of the reactor's face, grime and seepage down the walls.
 */
function addDecals(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const door = KOVKA_CAGES.minX + KOVKA_CAGES.cellWidth / 2;
  const trail: ReadonlyArray<readonly [number, number]> = [
    [door, CAGES_FRONT_Z - 0.6], [door + 3.2, CAGES_FRONT_Z - 1.6], [-16.8, -43.5], [-12.6, -44.2], [-8.6, -44.6], [hall.maxX - 0.8, -44.9],
  ];
  for (let index = 1; index < trail.length; index++) {
    const [x0, z0] = trail[index - 1];
    const [x1, z1] = trail[index];
    const yaw = Math.atan2(-(z1 - z0), x1 - x0);
    addFloorDecal(batch, materials.bloodSmear, (x0 + x1) / 2, (z0 + z1) / 2, Math.min(3, Math.hypot(x1 - x0, z1 - z0) * 0.7), 0.5, yaw, 0.008 + index * 0.0003);
  }
  addFloorDecal(batch, materials.bloodSplatter, door, hall.maxZ - 0.7, 1.1, 1.0, 0.4, 0.009);
  const cellWall = new THREE.PlaneGeometry(1.0, 1.1).rotateY(Math.PI).translate(KOVKA_CAGES.minX + KOVKA_CAGES.cellWidth * 0.5, 1.3, hall.maxZ - 0.035);
  batch.add(cellWall, materials.bloodSplatter);
  batch.add(new THREE.PlaneGeometry(0.7, 0.5).translate(KOVKA_CONSOLE.x - 0.6, KOVKA_CONSOLE.height / 2, KOVKA_CONSOLE.z + KOVKA_CONSOLE.depth / 2 + 0.006), materials.bloodSplatter);
  for (const [x, z, size, yaw] of [[KOVKA_REACTOR.x - 3.1, pit.maxZ + 1.6, 2.6, 0.4], [KOVKA_REACTOR.x + 3.4, pit.maxZ + 2.2, 2.0, 1.9], [hall.minX + 3.0, -60.0, 1.8, 0.7], [hall.maxX - 2.4, -55.5, 1.5, 2.6]] as const) {
    addFloorDecal(batch, materials.floorGrime, x, z, size, size * 0.75, yaw, 0.004);
  }
  const streakY = 3.2;
  for (const z of [-50.2, -63.4]) batch.add(new THREE.PlaneGeometry(1.2, 2.2).rotateY(Math.PI / 2).translate(hall.minX + 0.035, streakY, z), materials.waterStreak);
  for (const z of [-54.6, -66.8]) batch.add(new THREE.PlaneGeometry(1.1, 2.0).rotateY(-Math.PI / 2).translate(hall.maxX - 0.035, streakY, z), materials.waterStreak);
  batch.add(new THREE.PlaneGeometry(1.4, 1.8).translate(-19.2, 2.4, hall.minZ + 0.035), materials.waterStreak);
}
