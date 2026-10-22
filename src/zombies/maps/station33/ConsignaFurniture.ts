import * as THREE from 'three';
import type { SurfaceType } from '../../../shooting/HitTarget';
import { placement } from '../shared/StaticMeshBatch';
import { CONSIGNA, CONSIGNA_LOCKER, STATION33_RING_LOCKERS } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';

const { hall } = CONSIGNA;
/** Kick plate under the bottom row of locker doors. */
const PLINTH = 0.12;

/**
 * Frame of a hall wall: `along` runs on the wall, `out` from its face into
 * the room. Converts local boxes to world boxes and yaws planes to face out.
 */
class WallFrame {
  constructor(
    private readonly axis: 'x' | 'z',
    private readonly face: number,
    private readonly inward: 1 | -1,
  ) {}

  point(along: number, out: number): { x: number; z: number } {
    return this.axis === 'z' ? { x: this.face + this.inward * out, z: along } : { x: along, z: this.face + this.inward * out };
  }

  size(alongSize: number, outSize: number): { width: number; depth: number } {
    return this.axis === 'z' ? { width: outSize, depth: alongSize } : { width: alongSize, depth: outSize };
  }

  /** Yaw that turns a +Z facing plane to face out of this wall. */
  get yaw(): number {
    if (this.axis === 'z') return this.inward > 0 ? Math.PI / 2 : -Math.PI / 2;
    return this.inward > 0 ? 0 : Math.PI;
  }

  /** +1 when local +X, after `yaw`, runs along increasing `along`; -1 when it runs back. */
  get alongSign(): 1 | -1 {
    return (this.axis === 'z') === (this.inward > 0) ? -1 : 1;
  }

  box(context: Station33BuildContext, material: THREE.Material, along: number, out: number, y: number, alongSize: number, outSize: number, height: number): void {
    const { x, z } = this.point(along, out);
    const { width, depth } = this.size(alongSize, outSize);
    context.batch.addBox(material, x, y, z, width, height, depth, 0, 0, 0, along);
  }
}

interface LockerBank {
  readonly frame: WallFrame;
  readonly from: number;
  readonly to: number;
  /** Doors left hanging open by whoever emptied them, by column index. */
  readonly ajar: ReadonlyArray<number>;
  /** Centres (along the wall) of ring lockers built into the bank. */
  readonly ringLockers: ReadonlyArray<number>;
}

/** Locker banks along the hall walls, clear of the corridor, the crate and both entrances. */
const LOCKER_BANKS: ReadonlyArray<LockerBank> = [
  { frame: new WallFrame('x', hall.minZ, 1), from: hall.minX, to: 16.45, ajar: [3], ringLockers: [] },
  { frame: new WallFrame('x', hall.minZ, 1), from: 18.75, to: hall.maxX - CONSIGNA_LOCKER.depth, ajar: [], ringLockers: [] },
  {
    frame: new WallFrame('z', hall.maxX, -1),
    from: hall.minZ + CONSIGNA_LOCKER.depth,
    to: 13.8,
    ajar: [1, 13],
    ringLockers: STATION33_RING_LOCKERS.filter((locker) => locker.facingX < 0).map((locker) => locker.z),
  },
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

/** Door spans of a bank as [from, to], leaving the gap of each ring locker built into it. */
function bankSpans(bank: LockerBank): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = [];
  let cursor = bank.from;
  for (const center of [...bank.ringLockers].sort((left, right) => left - right)) {
    spans.push([cursor, center - CONSIGNA_LOCKER.ringLockerWidth / 2]);
    cursor = center + CONSIGNA_LOCKER.ringLockerWidth / 2;
  }
  spans.push([cursor, bank.to]);
  return spans;
}

/**
 * A bank of grey steel luggage lockers: three rows of green enamel doors
 * with handles and Cyrillic number tags, a few left hanging open. Returns
 * the next tag index so numbering runs on across banks.
 */
function addLockerBank(context: Station33BuildContext, bank: LockerBank, firstPlate: number): number {
  const { materials, signage, batch } = context;
  const { depth, height, columnWidth, rows } = CONSIGNA_LOCKER;
  const { frame } = bank;
  const rowHeight = (height - PLINTH - 0.04) / rows;
  let plate = firstPlate;
  let column = 0;
  for (const [from, to] of bankSpans(bank)) {
    const length = to - from;
    if (length < columnWidth * 0.5) continue;
    const middle = (from + to) / 2;
    frame.box(context, materials.greySteel, middle, depth / 2, height / 2, length, depth, height);
    frame.box(context, materials.greySteel, middle, depth / 2 + 0.01, height + 0.02, length + 0.02, depth + 0.04, 0.04);
    const columns = Math.max(1, Math.round(length / columnWidth));
    const width = length / columns;
    for (let index = 0; index < columns; index++, column++) {
      const along = from + width * (index + 0.5);
      for (let row = 0; row < rows; row++) {
        const y = PLINTH + rowHeight * (row + 0.5);
        if (row === 1 && bank.ajar.includes(column)) {
          addAjarDoor(context, frame, along, y, width, rowHeight);
          continue;
        }
        frame.box(context, materials.paintedSteel, along, depth + 0.006, y, width - 0.024, 0.012, rowHeight - 0.024);
        frame.box(context, materials.greySteel, along + width * 0.3, depth + 0.018, y, 0.02, 0.016, 0.09);
        const tag = signage.lockerPlateGeometry(plate++, 0.075, 0.038);
        const { x, z } = frame.point(along, depth + 0.014);
        tag.rotateY(frame.yaw);
        tag.translate(x, y + rowHeight * 0.3, z);
        batch.add(tag, signage.material);
      }
    }
  }
  const start = frame.point(bank.from, 0);
  const end = frame.point(bank.to, depth);
  addProxy(
    context, 'luggage-lockers',
    { x: Math.min(start.x, end.x), y: 0, z: Math.min(start.z, end.z) },
    { x: Math.max(start.x, end.x), y: height + 0.04, z: Math.max(start.z, end.z) },
    'metal',
  );
  return plate;
}

/** Dark empty compartment and its door swung open on the left hinge. */
function addAjarDoor(context: Station33BuildContext, frame: WallFrame, along: number, y: number, width: number, rowHeight: number): void {
  const { materials, batch } = context;
  const { depth } = CONSIGNA_LOCKER;
  frame.box(context, materials.rubber, along, depth - 0.02, y, width - 0.03, 0.01, rowHeight - 0.03);
  const doorWidth = width - 0.024;
  const swing = 1.9;
  // The door is built along local +X from its hinge, then yawed onto the wall.
  const hinge = frame.point(along - frame.alongSign * width / 2, depth + 0.006);
  const door = new THREE.BoxGeometry(doorWidth, rowHeight - 0.024, 0.012).translate(doorWidth / 2, 0, 0);
  door.rotateY(-swing);
  batch.add(door, materials.paintedSteel, placement(hinge.x, y, hinge.z, 0, frame.yaw, 0));
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
