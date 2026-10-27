import * as THREE from 'three';
import { placement } from '../shared/StaticMeshBatch';
import { CONSIGNA_LOCKER, STATION33_RING_LOCKERS, type Station33ZoneId } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';

/** Kick plate under the bottom row of locker doors. */
const PLINTH = 0.12;

/**
 * Frame of a room wall: `along` runs on the wall, `out` from its face into
 * the room. Converts local boxes to world boxes and yaws planes to face out.
 */
export class WallFrame {
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

  /** True when a ring locker of `zone` opens out of this wall. */
  holds(locker: { readonly zone: Station33ZoneId; readonly x: number; readonly z: number; readonly facingX: number; readonly facingZ: number }, zone: Station33ZoneId): boolean {
    const facing = this.axis === 'z' ? locker.facingX : locker.facingZ;
    const back = this.axis === 'z' ? locker.x - locker.facingX * CONSIGNA_LOCKER.depth : locker.z - locker.facingZ * CONSIGNA_LOCKER.depth;
    return locker.zone === zone && facing === this.inward && Math.abs(back - this.face) < 1e-6;
  }

  box(context: Station33BuildContext, material: THREE.Material, along: number, out: number, y: number, alongSize: number, outSize: number, height: number): void {
    const { x, z } = this.point(along, out);
    const { width, depth } = this.size(alongSize, outSize);
    context.batch.addBox(material, x, y, z, width, height, depth, 0, 0, 0, along);
  }
}

export interface LockerBank {
  readonly frame: WallFrame;
  readonly from: number;
  readonly to: number;
  /** Doors left hanging open by whoever emptied them, by column index. */
  readonly ajar: ReadonlyArray<number>;
  /** Centres (along the wall) of ring lockers built into the bank. */
  readonly ringLockers: ReadonlyArray<number>;
}

/** Centres along `frame` of the ring lockers of `zone` that open out of it. */
export function ringLockersOn(frame: WallFrame, zone: Station33ZoneId): number[] {
  return STATION33_RING_LOCKERS
    .filter((locker) => frame.holds(locker, zone))
    .map((locker) => (locker.facingX !== 0 ? locker.z : locker.x));
}

/**
 * A bank of grey steel lockers: three rows of green enamel doors with
 * handles and Cyrillic number tags, a few left hanging open, and a gap for
 * each ring locker (the arena builds those). One invisible AABB proxy
 * stops bullets, zombies and the player. Returns the next tag index so
 * numbering runs on across banks.
 */
export function addLockerBank(context: Station33BuildContext, bank: LockerBank, firstPlate: number): number {
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
  const min = { x: Math.min(start.x, end.x), z: Math.min(start.z, end.z) };
  const max = { x: Math.max(start.x, end.x), z: Math.max(start.z, end.z) };
  context.structure.addBox(
    (min.x + max.x) / 2, (height + 0.04) / 2, (min.z + max.z) / 2,
    max.x - min.x, height + 0.04, max.z - min.z,
    context.materials.collider,
    { name: 'lockers', surface: 'metal', mapRole: 'solid-prop', castShadow: false, uvSeed: 0, blocksPlayer: true },
  );
  return plate;
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
