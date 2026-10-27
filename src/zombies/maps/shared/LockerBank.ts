import * as THREE from 'three';
import type { MapBuildKit } from './MapBuildKit';
import { addSolidProxy } from './SolidProxy';
import { placement } from './StaticMeshBatch';

/** Kick plate under the bottom row of locker doors. */
const PLINTH = 0.12;

/** Size of a map's lockers: bank depth and height, door columns and rows, and a ring locker's width. */
export interface LockerSize {
  readonly depth: number;
  readonly height: number;
  readonly columnWidth: number;
  readonly rows: number;
  readonly ringLockerWidth: number;
}

/** Materials a locker bank and its ring lockers are built from, named as the maps' material sets name them. */
export interface LockerMaterials {
  /** Carcass, shelves and handles. */
  readonly greySteel: THREE.Material;
  /** Enamel doors. */
  readonly paintedSteel: THREE.Material;
  /** Dark inside of an empty compartment. */
  readonly rubber: THREE.Material;
}

/** Number tags on the doors: a plane per tag index (wrapping as the map likes) in one material. */
export interface LockerTags {
  readonly material: THREE.Material;
  lockerPlateGeometry(index: number, width: number, height: number): THREE.BufferGeometry;
}

/** A map's locker look, shared by its banks and the ring lockers built into them. */
export interface LockerLook {
  readonly size: LockerSize;
  readonly materials: LockerMaterials;
  /** Omitted: the doors carry no number tags. */
  readonly tags?: LockerTags;
}

/** Where a ring locker opens: the centre of its front on the hall face of its bank, and its facing. */
export interface LockerFront {
  readonly x: number;
  readonly z: number;
  readonly facingX: number;
  readonly facingZ: number;
}

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

  /** True when a ring locker `depth` deep opens out of this wall. */
  holds(locker: LockerFront, depth: number): boolean {
    const facing = this.axis === 'z' ? locker.facingX : locker.facingZ;
    const back = this.axis === 'z' ? locker.x - locker.facingX * depth : locker.z - locker.facingZ * depth;
    return facing === this.inward && Math.abs(back - this.face) < 1e-6;
  }

  box(kit: MapBuildKit, material: THREE.Material, along: number, out: number, y: number, alongSize: number, outSize: number, height: number): void {
    const { x, z } = this.point(along, out);
    const { width, depth } = this.size(alongSize, outSize);
    kit.batch.addBox(material, x, y, z, width, height, depth, 0, 0, 0, along);
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

/** Centres along `frame` of those `lockers` (`depth` deep) that open out of it. */
export function ringLockersOn(frame: WallFrame, lockers: ReadonlyArray<LockerFront>, depth: number): number[] {
  return lockers
    .filter((locker) => frame.holds(locker, depth))
    .map((locker) => (locker.facingX !== 0 ? locker.z : locker.x));
}

/**
 * A bank of steel lockers: rows of enamel doors with handles (and number
 * tags when the look has them), a few left hanging open, and a gap for each
 * ring locker (the arena builds those). One invisible AABB proxy stops
 * bullets, zombies and the player. Returns the next tag index so numbering
 * runs on across banks.
 */
export function addLockerBank(kit: MapBuildKit, look: LockerLook, bank: LockerBank, firstTag: number): number {
  const { materials, tags, size } = look;
  const { depth, height, columnWidth, rows } = size;
  const { frame } = bank;
  const rowHeight = (height - PLINTH - 0.04) / rows;
  let tag = firstTag;
  let column = 0;
  for (const [from, to] of bankSpans(bank, size)) {
    const length = to - from;
    if (length < columnWidth * 0.5) continue;
    const middle = (from + to) / 2;
    frame.box(kit, materials.greySteel, middle, depth / 2, height / 2, length, depth, height);
    frame.box(kit, materials.greySteel, middle, depth / 2 + 0.01, height + 0.02, length + 0.02, depth + 0.04, 0.04);
    const columns = Math.max(1, Math.round(length / columnWidth));
    const width = length / columns;
    for (let index = 0; index < columns; index++, column++) {
      const along = from + width * (index + 0.5);
      for (let row = 0; row < rows; row++) {
        const y = PLINTH + rowHeight * (row + 0.5);
        if (row === 1 && bank.ajar.includes(column)) {
          addAjarDoor(kit, look, frame, along, y, width, rowHeight);
          continue;
        }
        frame.box(kit, materials.paintedSteel, along, depth + 0.006, y, width - 0.024, 0.012, rowHeight - 0.024);
        frame.box(kit, materials.greySteel, along + width * 0.3, depth + 0.018, y, 0.02, 0.016, 0.09);
        if (!tags) continue;
        const plate = tags.lockerPlateGeometry(tag++, 0.075, 0.038);
        const { x, z } = frame.point(along, depth + 0.014);
        plate.rotateY(frame.yaw);
        plate.translate(x, y + rowHeight * 0.3, z);
        kit.batch.add(plate, tags.material);
      }
    }
  }
  const start = frame.point(bank.from, 0);
  const end = frame.point(bank.to, depth);
  addSolidProxy(
    kit, 'lockers',
    { x: Math.min(start.x, end.x), y: 0, z: Math.min(start.z, end.z) },
    { x: Math.max(start.x, end.x), y: height + 0.04, z: Math.max(start.z, end.z) },
    'metal',
  );
  return tag;
}

/** Door spans of a bank as [from, to], leaving the gap of each ring locker built into it. */
function bankSpans(bank: LockerBank, size: LockerSize): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = [];
  let cursor = bank.from;
  for (const center of [...bank.ringLockers].sort((left, right) => left - right)) {
    spans.push([cursor, center - size.ringLockerWidth / 2]);
    cursor = center + size.ringLockerWidth / 2;
  }
  spans.push([cursor, bank.to]);
  return spans;
}

/** Dark empty compartment and its door swung open on the left hinge. */
function addAjarDoor(kit: MapBuildKit, look: LockerLook, frame: WallFrame, along: number, y: number, width: number, rowHeight: number): void {
  const { materials, size } = look;
  frame.box(kit, materials.rubber, along, size.depth - 0.02, y, width - 0.03, 0.01, rowHeight - 0.03);
  const doorWidth = width - 0.024;
  const swing = 1.9;
  // The door is built along local +X from its hinge, then yawed onto the wall.
  const hinge = frame.point(along - frame.alongSign * width / 2, size.depth + 0.006);
  const door = new THREE.BoxGeometry(doorWidth, rowHeight - 0.024, 0.012).translate(doorWidth / 2, 0, 0);
  door.rotateY(-swing);
  kit.batch.add(door, materials.paintedSteel, placement(hinge.x, y, hinge.z, 0, frame.yaw, 0));
}
