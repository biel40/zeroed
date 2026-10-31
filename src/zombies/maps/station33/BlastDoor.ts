import * as THREE from 'three';
import { PROTOCOL33_BLAST_DOOR, STATION33_WALL_THICKNESS } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';

/** The leaf overlaps the jambs by this much on each side and the sill. */
const LEAF_OVERLAP = 0.05;
const LEAF_THICKNESS = 0.2;
/** Seconds the leaf takes to grind up into the lintel. */
const OPEN_DURATION = 3.2;
/** Rise of the open leaf: its wheel ends above both ceilings. */
const OPEN_LIFT = 3.4;
/** Share of the opening spent shuddering on its seals before it moves. */
const BREAKAWAY = 0.12;

/**
 * Protocol 33's sealed blast door: a heavy steel leaf in the workshop's
 * north wall, framed in hazard stripes under its emergency-exit lightbox.
 * Closed, its slab is a solid the arena lists like any closed door;
 * opening drops it from the colliders at once and grinds it up into the
 * lintel, where the wall hides it.
 */
export class BlastDoor {
  /** The leaf's slab: the solid while the door is shut. */
  public readonly collider: THREE.Mesh;
  private readonly leaf = new THREE.Group();
  private open = false;
  private elapsed = 0;

  public constructor(context: Station33BuildContext) {
    const { batch, materials, group } = context;
    const { x, z, width, height } = PROTOCOL33_BLAST_DOOR;
    const roomFaceZ = z + STATION33_WALL_THICKNESS / 2;
    for (const side of [-1, 1]) {
      batch.addBox(materials.hazardPaint, x + side * (width / 2 + 0.08), (height + 0.16) / 2, roomFaceZ + 0.03, 0.16, height + 0.16, 0.06);
    }
    batch.addBox(materials.hazardPaint, x, height + 0.08, roomFaceZ + 0.03, width + 0.32, 0.16, 0.06);
    const leafWidth = width + 2 * LEAF_OVERLAP;
    const leafHeight = height + LEAF_OVERLAP;
    this.collider = new THREE.Mesh(new THREE.BoxGeometry(leafWidth, leafHeight, LEAF_THICKNESS), materials.greySteel);
    this.collider.position.y = leafHeight / 2;
    this.collider.name = 'protocol33-blast-door';
    this.collider.userData.surface = 'metal';
    this.collider.userData.mapRole = 'blast-door';
    this.leaf.add(this.collider);
    // Reinforcing bands on the workshop side (inside the wall's depth, so the
    // lintel swallows them), the locking wheel on the corridor side.
    for (const y of [0.45, leafHeight - 0.45]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(leafWidth - 0.12, 0.16, 0.04), materials.hazardPaint);
      band.position.set(0, y, LEAF_THICKNESS / 2 + 0.02);
      this.leaf.add(band);
    }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 6, 20), materials.paintedSteel);
    wheel.position.set(0, leafHeight * 0.52, -LEAF_THICKNESS / 2 - 0.08);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10).rotateX(Math.PI / 2), materials.greySteel);
    hub.position.copy(wheel.position);
    for (const angle of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 0.025), materials.greySteel);
      spoke.position.copy(wheel.position);
      spoke.rotation.z = angle;
      this.leaf.add(spoke);
    }
    this.leaf.add(wheel, hub);
    this.leaf.name = 'protocol33-blast-door-leaf';
    this.leaf.position.set(x, 0, z);
    if (context.profile.useReducedEffects) this.leaf.traverse((object) => { object.castShadow = false; });
    group.add(this.leaf);
  }

  public get isClosed(): boolean {
    return !this.open;
  }

  /** Breaks the seals and raises the leaf; false when it already is open. */
  public openDoor(): boolean {
    if (this.open) return false;
    this.open = true;
    this.elapsed = 0;
    return true;
  }

  public update(dt: number): void {
    if (!this.open || this.elapsed >= OPEN_DURATION) return;
    this.elapsed = Math.min(OPEN_DURATION, this.elapsed + Math.max(0, dt));
    const progress = this.elapsed / OPEN_DURATION;
    if (progress < BREAKAWAY) {
      this.leaf.position.y = 0.012 * Math.sin(this.elapsed * 90);
      return;
    }
    const lift = (progress - BREAKAWAY) / (1 - BREAKAWAY);
    this.leaf.position.y = (1 - (1 - lift) ** 2) * OPEN_LIFT;
  }

  public reset(): void {
    this.open = false;
    this.elapsed = 0;
    this.leaf.position.y = 0;
  }
}
