import * as THREE from 'three';
import {
  CATACOMB_FLOOR_Y,
  CRYPT_TOMB_EMERGENCES,
  ROYAL_TOMB,
  ROYAL_TOMBS,
  type RoyalTomb,
} from '../../DieKathedraleCatacombsConfig';
import { placement, StaticMeshBatch } from '../../shared/StaticMeshBatch';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { addEffigy } from './RoyalEffigy';

/** Seconds a lid takes to grind aside: within the tomb's stir, before anything shows. */
export const TOMB_LID_SLIDE_SECONDS = 1;
/** The lid turns a little as it goes, as stone dragged off-centre does. */
const LID_TURN = 0.05;
/** Stick-slip of stone on stone: a small judder that dies out as the lid settles. */
const JUDDER = { amplitude: 0.006, frequency: 38 } as const;

interface SlidingLid {
  readonly group: THREE.Group;
  readonly closedX: number;
  /** Signed metres along x the lid ends up from its closed place. */
  readonly shift: number;
  /** Seconds into the slide; null while still (shut or already ajar). */
  elapsed: number | null;
  open: boolean;
}

/** Signed metres along x the lid of `tombId` grinds aside, or null when the pantheon builds it shut in its batch. */
export function slidingLidShift(tombId: string): number | null {
  const emergence = CRYPT_TOMB_EMERGENCES.find((candidate) => candidate.tombId === tombId);
  return emergence?.lidShift === undefined ? null : -emergence.side * emergence.lidShift;
}

/**
 * The lids of the royal tombs the dead push open (`CRYPT_TOMB_EMERGENCES`
 * with a `lidShift`): each lid and its effigy merge into a small mesh of
 * their own. A lid grinds aside the first time its tomb stirs and stays ajar
 * until the run restarts. Only a lid in motion costs anything per frame.
 */
export class TombLids {
  private readonly lids = new Map<string, SlidingLid>();
  private moving = 0;

  public constructor(context: DieKathedraleBuildContext) {
    for (const tomb of ROYAL_TOMBS) {
      const shift = slidingLidShift(tomb.id);
      if (shift !== null) this.lids.set(tomb.id, this.buildLid(context, tomb, shift));
    }
  }

  /** The tomb's dead stir: a shut lid starts grinding aside; an open one stays as it is. */
  public disturb(tombId: string): void {
    const lid = this.lids.get(tombId);
    if (!lid || lid.open || lid.elapsed !== null) return;
    lid.elapsed = 0;
    this.moving++;
  }

  /** True once the lid of `tombId` has been pushed aside (false for tombs without a sliding lid). */
  public isOpen(tombId: string): boolean {
    return this.lids.get(tombId)?.open ?? false;
  }

  public update(dt: number): void {
    if (this.moving === 0) return;
    for (const lid of this.lids.values()) {
      if (lid.elapsed === null) continue;
      lid.elapsed = Math.min(TOMB_LID_SLIDE_SECONDS, lid.elapsed + dt);
      const progress = lid.elapsed / TOMB_LID_SLIDE_SECONDS;
      if (progress >= 1) {
        lid.elapsed = null;
        lid.open = true;
        this.moving--;
      }
      this.pose(lid, progress);
    }
  }

  /** Every lid back on its tomb, shut. */
  public reset(): void {
    for (const lid of this.lids.values()) {
      lid.elapsed = null;
      lid.open = false;
      this.pose(lid, 0);
    }
    this.moving = 0;
  }

  private pose(lid: SlidingLid, progress: number): void {
    const eased = THREE.MathUtils.smoothstep(progress, 0, 1);
    const judder = progress > 0 && progress < 1 ? Math.sin(progress * JUDDER.frequency) * JUDDER.amplitude * (1 - progress) : 0;
    lid.group.position.x = lid.closedX + lid.shift * eased + judder;
    lid.group.rotation.y = Math.sign(lid.shift) * LID_TURN * eased;
  }

  private buildLid(context: DieKathedraleBuildContext, tomb: RoyalTomb, shift: number): SlidingLid {
    const { width, length, chestHeight, lidHeight, plinthHeight } = ROYAL_TOMB;
    if (tomb.effigy === 'empty') throw new Error(`Tomb ${tomb.id} has no lid to slide`);
    const group = new THREE.Group();
    group.name = `die-kathedrale-tomb-lid:${tomb.id}`;
    group.position.set(tomb.x, CATACOMB_FLOOR_Y + plinthHeight + chestHeight, tomb.z);
    const batch = new StaticMeshBatch();
    batch.addBox(context.materials.effigyMarble, 0, lidHeight / 2, 0, width + 0.1, lidHeight, length + 0.1);
    addEffigy({ ...context, batch }, tomb.effigy, placement(0, lidHeight, 0).clone());
    batch.build(group, group.name, { castShadow: false, receiveShadow: false });
    context.group.add(group);
    return { group, closedX: tomb.x, shift, elapsed: null, open: false };
  }
}
