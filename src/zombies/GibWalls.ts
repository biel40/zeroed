import * as THREE from 'three';

/**
 * Live set of map wall boxes (world space, the same ones the player collides
 * with) that zombie gibs bounce off. Owners swap `boxes` whenever the map
 * topology changes; every zombie of a pool shares one instance.
 */
export interface GibWalls {
  boxes: ReadonlyArray<THREE.Box3>;
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
  private count = 0;
  private readonly inverse = new THREE.Matrix4();
  private readonly origin = new THREE.Vector3();

  /** `frame` is the world-aligned gib group, with an up-to-date world matrix. */
  capture(walls: GibWalls, frame: THREE.Object3D): void {
    frame.getWorldPosition(this.origin);
    this.inverse.copy(frame.matrixWorld).invert();
    this.count = 0;
    for (const wall of walls.boxes) {
      if (wall.distanceToPoint(this.origin) > WALL_REACH) continue;
      const box = (this.boxes[this.count] ??= new THREE.Box3());
      box.copy(wall).applyMatrix4(this.inverse);
      this.count++;
    }
  }

  /**
   * Moves `position` (a ball of `radius` coming from `previous`) back onto
   * the face of the first wall it entered and says which face, or null.
   */
  collide(position: THREE.Vector3, previous: THREE.Vector3, radius: number): GibWallContact | null {
    for (let index = 0; index < this.count; index++) {
      const box = this.boxes[index];
      if (position.x < box.min.x - radius || position.x > box.max.x + radius
        || position.y < box.min.y - radius || position.y > box.max.y + radius
        || position.z < box.min.z - radius || position.z > box.max.z + radius) continue;
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
}
