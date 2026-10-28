import * as THREE from 'three';
import { stepBloodDrop, type BloodDrop } from './BloodDropMotion';
import { GibWallFrame, type GibWalls } from './GibWalls';
import type { BloodBurstProfile } from './ZombieBleeding';
import { bloodGeometry, bloodMaterial } from './ZombieBloodAssets';

const CAPACITY = 1024;
const LIFETIME = 45;
const FADE_TIME = 5;

interface BloodSlot extends BloodDrop {
  collision: BloodCollision | null;
  floor: number;
  age: number;
}

interface BloodCollision {
  readonly walls: GibWallFrame;
  users: number;
}

/** Run-owned blood: one bounded instanced draw, independent of moving/recycled zombies. */
export class ZombieBlood {
  public readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh | null = null;
  private readonly slots: BloodSlot[] = [];
  private readonly transform = new THREE.Matrix4();
  private readonly rotation = new THREE.Quaternion();
  private readonly shownScale = new THREE.Vector3();
  private readonly localOrigin = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();
  private readonly freeCollisions: BloodCollision[] = [];
  private cursor = 0;

  public constructor(private readonly walls: GibWalls, private readonly rng: () => number = Math.random) {}

  /** `origin` and shot direction are world-space; floor is the victim's physical floor Y. */
  public emit(origin: THREE.Vector3, floor: number, directionX: number, directionZ: number, profile: BloodBurstProfile): void {
    this.initialize();
    const mesh = this.mesh!;
    this.group.updateWorldMatrix(true, false);
    this.inverse.copy(this.group.matrixWorld).invert();
    this.localOrigin.copy(origin).applyMatrix4(this.inverse);
    const collision = this.freeCollisions.pop() ?? { walls: new GibWallFrame(), users: 0 };
    collision.walls.capture(this.walls, this.group, origin);
    const length = Math.hypot(directionX, directionZ) || 1;
    // Owners keep this group on the map's world axes, as they do their zombie pool.
    for (let i = 0; i < profile.drops; i++) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % CAPACITY;
      const slot = this.slots[index];
      this.releaseCollision(slot);
      slot.collision = collision;
      collision.users++;
      slot.position.copy(this.localOrigin);
      slot.position.x += (this.rng() - 0.5) * 0.18;
      slot.position.y += (this.rng() - 0.5) * 0.18;
      slot.position.z += (this.rng() - 0.5) * 0.18;
      const force = profile.force * (0.65 + this.rng() * 0.7);
      slot.velocity.set(directionX / length * force + (this.rng() - 0.5) * profile.spread * 2,
        0.5 + this.rng() * 3.5, directionZ / length * force + (this.rng() - 0.5) * profile.spread * 2);
      slot.radius = profile.radius * (0.65 + this.rng() * 0.7);
      slot.scale.setScalar(slot.radius);
      slot.floor = floor - this.group.matrixWorld.elements[13];
      slot.age = 0;
      slot.resting = false;
      this.writeMatrix(index, slot, 1);
      mesh.count = Math.max(mesh.count, index + 1);
    }
    mesh.visible = true;
    mesh.instanceMatrix.needsUpdate = true;
  }

  public update(dt: number): void {
    const mesh = this.mesh;
    if (!mesh || !mesh.visible || dt <= 0) return;
    let active = false;
    let changed = false;
    for (let i = 0; i < mesh.count; i++) {
      const slot = this.slots[i];
      if (slot.age >= LIFETIME) continue;
      const wasResting = slot.resting;
      slot.age += dt;
      const fade = Math.max(0, Math.min(1, (LIFETIME - slot.age) / FADE_TIME));
      if (fade > 0) {
        if (!slot.resting) stepBloodDrop(slot, dt, slot.collision!.walls, slot.floor);
        active = true;
      }
      if (slot.resting || fade === 0) this.releaseCollision(slot);
      if (!wasResting || slot.age >= LIFETIME - FADE_TIME) {
        this.writeMatrix(i, slot, fade);
        changed = true;
      }
    }
    mesh.visible = active;
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  }

  public reset(): void {
    if (this.mesh) { this.mesh.count = 0; this.mesh.visible = false; }
    this.cursor = 0;
    for (const slot of this.slots) { this.releaseCollision(slot); slot.age = LIFETIME; }
  }

  public dispose(): void {
    this.reset();
    this.mesh?.dispose();
    this.group.clear();
    this.mesh = null;
    this.slots.length = 0;
    this.freeCollisions.length = 0;
  }

  private initialize(): void {
    if (this.mesh) return;
    const mesh = new THREE.InstancedMesh(bloodGeometry(), bloodMaterial(), CAPACITY);
    mesh.name = 'zombie-blood';
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh = mesh;
    this.group.add(mesh);
    for (let i = 0; i < CAPACITY; i++) {
      this.slots.push({ position: new THREE.Vector3(), previous: new THREE.Vector3(), velocity: new THREE.Vector3(),
        scale: new THREE.Vector3(), radius: 0, resting: true, floor: 0, age: LIFETIME, collision: null });
    }
  }

  private writeMatrix(index: number, slot: BloodSlot, fade: number): void {
    this.shownScale.copy(slot.scale).multiplyScalar(fade);
    this.transform.compose(slot.position, this.rotation, this.shownScale);
    this.mesh!.setMatrixAt(index, this.transform);
  }

  private releaseCollision(slot: BloodSlot): void {
    const collision = slot.collision;
    if (!collision) return;
    if (--collision.users === 0) this.freeCollisions.push(collision);
    slot.collision = null;
  }
}
