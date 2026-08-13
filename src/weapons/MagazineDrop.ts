import * as THREE from 'three';

/** Hard cap of simultaneously visible dropped magazines/cells. */
const MAX_DROPPED = 12;
/** Seconds a dropped magazine stays before fading out. */
const LIFETIME = 5;
const FADE_SECONDS = 1;
const GRAVITY = 9.8;
/** Firing-line platform top; the player never leaves it. */
const GROUND_Y = 0.17;
const BOUNCE = 0.28;

interface DroppedMagazine {
  object: THREE.Object3D;
  materials: THREE.Material[];
  velocity: THREE.Vector3;
  angular: THREE.Vector3;
  life: number;
  settled: boolean;
}

/**
 * World-space pool for ejected magazines and power cells. A reload drops at
 * most one magazine, so a 12-slot ring buffer recycles long before anything
 * accumulates. Motion is a cheap analytic integration (gravity + one floor
 * bounce) — no physics engine involved.
 */
export class MagazineDropPool {
  private readonly group = new THREE.Group();
  private readonly entries: DroppedMagazine[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
  }

  get activeCount(): number {
    return this.entries.length;
  }

  /**
   * Releases a magazine into the world at its current world transform. The
   * pool entry shares geometry with the view-model part but owns cloned
   * materials so it can fade out independently.
   */
  drop(source: THREE.Object3D): void {
    if (this.entries.length >= MAX_DROPPED) this.recycle(this.entries[0]);

    const object = source.clone();
    const materials: THREE.Material[] = [];
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        c.transparent = true;
        c.opacity = 1;
        materials.push(c);
        return c;
      });
      child.material = Array.isArray(child.material) ? cloned : cloned[0];
    });

    source.updateWorldMatrix(true, false);
    object.position.setFromMatrixPosition(source.matrixWorld);
    object.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(source.matrixWorld));
    object.scale.setFromMatrixScale(source.matrixWorld);
    this.group.add(object);

    this.entries.push({
      object,
      materials,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.4, (Math.random() - 0.5) * 0.4),
      angular: new THREE.Vector3(
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
        (Math.random() - 0.5) * 6,
      ),
      life: LIFETIME,
      settled: false,
    });
  }

  update(dt: number): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      entry.life -= dt;

      if (entry.life <= 0) {
        this.recycle(entry);
        continue;
      }

      // Fade during the last stretch.
      if (entry.life < FADE_SECONDS) {
        const opacity = entry.life / FADE_SECONDS;
        for (const m of entry.materials) m.opacity = opacity;
      }

      if (entry.settled) continue;

      entry.velocity.y -= GRAVITY * dt;
      entry.object.position.addScaledVector(entry.velocity, dt);
      entry.object.rotation.x += entry.angular.x * dt;
      entry.object.rotation.y += entry.angular.y * dt;
      entry.object.rotation.z += entry.angular.z * dt;

      if (entry.object.position.y <= GROUND_Y && entry.velocity.y < 0) {
        entry.object.position.y = GROUND_Y;
        if (Math.abs(entry.velocity.y) > 0.6) {
          // Single small bounce, then rest.
          entry.velocity.y = -entry.velocity.y * BOUNCE;
          entry.velocity.x *= 0.5;
          entry.velocity.z *= 0.5;
          entry.angular.multiplyScalar(0.4);
        } else {
          entry.settled = true;
        }
      }
    }
  }

  /** Game restart: every dropped magazine vanishes. */
  clear(): void {
    for (let i = this.entries.length - 1; i >= 0; i--) this.recycle(this.entries[i]);
  }

  private recycle(entry: DroppedMagazine): void {
    this.group.remove(entry.object);
    for (const m of entry.materials) m.dispose();
    const index = this.entries.indexOf(entry);
    if (index >= 0) this.entries.splice(index, 1);
  }
}
