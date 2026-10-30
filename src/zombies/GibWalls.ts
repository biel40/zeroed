import * as THREE from 'three';

/**
 * Faces of a solid box that lie on visible geometry, so blood may stick
 * there. Invisible proxies are often padded around irregular visuals:
 * 'top' accepts only the upper face, 'none' none at all.
 */
export type StainFaces = 'all' | 'top' | 'none';

/**
 * Live set of solid map boxes (world space) that blood and zombie gibs hit.
 * Owners refresh it whenever the map topology changes; every zombie of a
 * pool shares one instance.
 */
export interface GibWalls {
  boxes: ReadonlyArray<THREE.Box3>;
  /** Boxes whose faces only partly match their visuals; absent boxes accept stains everywhere. */
  stainFaces?: ReadonlyMap<THREE.Box3, StainFaces>;
}

/** Snapshots static map colliders and the stain faces each one declares in `userData.stainFaces`. */
export function refreshGibWalls(walls: GibWalls, colliders: ReadonlyArray<THREE.Object3D>): void {
  const stainFaces = new Map<THREE.Box3, StainFaces>();
  walls.boxes = colliders.map((collider) => {
    const box = new THREE.Box3().setFromObject(collider);
    const faces = collider.userData.stainFaces as StainFaces | undefined;
    if (faces && faces !== 'all') stainFaces.set(box, faces);
    return box;
  });
  walls.stainFaces = stainFaces;
}

/** Face of a wall that stopped a moving point; 'inside' means it started within the wall. */
export type GibWallContact = 'top' | 'x' | 'z' | 'inside';

/** Walls farther than this from the burst (m) can never be reached by a piece. */
const WALL_REACH = 25;

/**
 * The walls around one burst, moved into the gibs' own frame (world-aligned,
 * translated and uniformly scaled), so every check is a plain box test
 * against nearby boxes only. Pure geometry, no scene objects.
 */
export class GibWallFrame {
  private readonly boxes: THREE.Box3[] = [];
  private readonly stainFaces: StainFaces[] = [];
  private count = 0;
  private readonly inverse = new THREE.Matrix4();
  private readonly origin = new THREE.Vector3();
  private contactIndex = -1;

  /** `frame` defines simulation coordinates; `origin` optionally selects nearby walls at a wound. */
  public capture(walls: GibWalls, frame: THREE.Object3D, origin?: THREE.Vector3): void {
    if (origin) this.origin.copy(origin);
    else frame.getWorldPosition(this.origin);
    this.inverse.copy(frame.matrixWorld).invert();
    this.count = 0;
    this.contactIndex = -1;
    for (const wall of walls.boxes) {
      if (wall.distanceToPoint(this.origin) > WALL_REACH) continue;
      const box = (this.boxes[this.count] ??= new THREE.Box3());
      box.copy(wall).applyMatrix4(this.inverse);
      this.stainFaces[this.count] = walls.stainFaces?.get(wall) ?? 'all';
      this.count++;
    }
  }

  /**
   * Moves `position` (a ball of `radius` coming from `previous`) back onto
   * the face of the first wall it entered and says which face, or null.
   */
  public collide(position: THREE.Vector3, previous: THREE.Vector3, radius: number): GibWallContact | null {
    this.contactIndex = -1;
    for (let index = 0; index < this.count; index++) {
      const box = this.boxes[index];
      if (position.x < box.min.x - radius || position.x > box.max.x + radius
        || position.y < box.min.y - radius || position.y > box.max.y + radius
        || position.z < box.min.z - radius || position.z > box.max.z + radius) continue;
      this.contactIndex = index;
      if (previous.y - radius >= box.max.y) {
        position.y = box.max.y + radius;
        return 'top';
      }
      if (previous.x + radius <= box.min.x || previous.x - radius >= box.max.x) {
        position.x = previous.x < box.min.x ? box.min.x - radius : box.max.x + radius;
        return 'x';
      }
      if (previous.z + radius <= box.min.z || previous.z - radius >= box.max.z) {
        position.z = previous.z < box.min.z ? box.min.z - radius : box.max.z + radius;
        return 'z';
      }
      position.x = previous.x;
      position.z = previous.z;
      return 'inside';
    }
    return null;
  }

  /** Whether the last contacted face lies on visible geometry and may keep a stain. */
  public acceptsStain(face: Exclude<GibWallContact, 'inside'>): boolean {
    const faces = this.contactIndex < 0 ? 'all' : this.stainFaces[this.contactIndex];
    return faces === 'all' || (faces === 'top' && face === 'top');
  }

  /** Fits a flattened unit-radius mesh wholly onto the last contacted box face. */
  public fitStain(position: THREE.Vector3, scale: THREE.Vector3, face: Exclude<GibWallContact, 'inside'>): void {
    if (this.contactIndex < 0) return;
    const box = this.boxes[this.contactIndex];
    // Bound the full rendered footprint, not just its impact point. Radius-only
    // grazes move onto the supporting face; narrow faces also reduce the stain.
    if (face !== 'x') fitStainAxis(box, position, scale, 'x');
    if (face !== 'top') fitStainAxis(box, position, scale, 'y');
    if (face !== 'z') fitStainAxis(box, position, scale, 'z');
  }
}

function fitStainAxis(box: THREE.Box3, position: THREE.Vector3, scale: THREE.Vector3, axis: 'x' | 'y' | 'z'): void {
  const extent = Math.min(scale[axis], (box.max[axis] - box.min[axis]) / 2);
  scale[axis] = extent;
  position[axis] = THREE.MathUtils.clamp(position[axis], box.min[axis] + extent, box.max[axis] - extent);
}
