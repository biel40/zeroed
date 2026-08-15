import * as THREE from 'three';
import type { Weapon } from '../weapons/Weapon';
import { clamp, damp, lerp } from '../utils/math';
import type { Input } from './Input';
import type { PlayerBounds } from '../zombies/maps/ZombieArena';

export const BASE_FOV = 75;

const SENSITIVITY = 0.0023;
const PITCH_LIMIT = Math.PI / 2 - 0.02;
export const EYE_HEIGHT = 1.7;
const WALK_SPEED = 4.6;
const ACCELERATION = 14;
const ADS_MOVE_PENALTY = 0.45;
const JUMP_SPEED = 5.2;
const GRAVITY = 15;
/** Body radius used for swept wall collision in arenas that enable it. */
const BODY_RADIUS = 0.35;
/** Vertical speed of stair transitions. */
const FLOOR_BLEND_SPEED = 8;

export interface FloorTransitionZone {
  /** Trigger volume for the transition. */
  readonly box: THREE.Box3;
  /** Floor index after crossing. */
  readonly targetFloor: number;
  /** Floor from which this trigger is valid, preventing trigger oscillation. */
  readonly sourceFloor: number;
  /** Eye height for the destination floor. */
  readonly targetY: number;
  readonly targetX?: number;
  readonly targetZ?: number;
  /** New movement bounds once on the destination floor. */
  readonly bounds: PlayerBounds;
}

/**
 * Delimited walkable area, enforced by the movement clamp below. minZ is
 * the frontier: the firing-line bench (top spanning z 0.8–1.6) plus the
 * angled barriers form a physical barrier the player can neither cross nor
 * round — the field beyond (target lanes, zombie grounds) stays off-limits
 * in every mode. 1.7 keeps a hair of clearance so the view never clips the
 * bench top.
 */
export const PLAYER_BOUNDS: PlayerBounds = {
  minX: -7,
  maxX: 7,
  minZ: 1.7,
  maxZ: 8,
};

/**
 * First-person rig: rig (yaw + position) → pitch node → camera (recoil
 * offset). Keeping recoil on the camera itself means the player aim and the
 * recoil recovery never fight each other.
 */
export class PlayerController {
  readonly rig = new THREE.Group();
  readonly camera: THREE.PerspectiveCamera;
  private readonly pitchNode = new THREE.Group();
  private readonly velocity = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private fov = BASE_FOV;
  private bounds: PlayerBounds = PLAYER_BOUNDS;
  private wallColliders: readonly THREE.Box3[] = [];
  private floorTransitions: readonly FloorTransitionZone[] = [];
  private currentFloor = 0;
  private groundY = EYE_HEIGHT;
  private targetY = EYE_HEIGHT;
  private jumpOffset = 0;
  private jumpVelocity = 0;
  private readonly tmpBox = new THREE.Box3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, aspect, 0.08, 700);
    this.rig.position.set(0, EYE_HEIGHT, 4);
    this.pitchNode.add(this.camera);
    this.rig.add(this.pitchNode);
  }

  /** 0..1 fraction of walk speed, used by the view-model bob. */
  get speed01(): number {
    return clamp(this.velocity.length() / WALK_SPEED, 0, 1);
  }

  get floor(): number {
    return this.currentFloor;
  }

  /** Replace the movement bounds (used when entering a new floor/zone). */
  public setBounds(bounds: PlayerBounds): void {
    this.bounds = bounds;
  }

  /** Replace the wall set used for swept collision. */
  public setWallColliders(colliders: readonly THREE.Box3[]): void {
    this.wallColliders = colliders;
  }

  /** Replace stair transition triggers. */
  public setFloorTransitions(zones: readonly FloorTransitionZone[]): void {
    this.floorTransitions = zones;
  }

  /** Snap player to a spawn point and floor (used on restart). */
  public teleport(x: number, y: number, z: number, floor = 0, bounds?: PlayerBounds): void {
    this.rig.position.set(x, y, z);
    this.groundY = y;
    this.targetY = y;
    this.jumpOffset = 0;
    this.jumpVelocity = 0;
    this.currentFloor = floor;
    if (bounds) this.bounds = bounds;
  }

  update(dt: number, input: Input, weapon: Weapon): void {
    const definition = weapon.definition;

    const sensitivity = SENSITIVITY * lerp(1, definition.ads.sensitivity, weapon.adsAlpha);
    this.yaw -= input.mouseDeltaX * sensitivity;
    this.pitch = clamp(this.pitch - input.mouseDeltaY * sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
    this.rig.rotation.y = this.yaw;
    this.pitchNode.rotation.x = this.pitch;
    this.camera.rotation.set(weapon.recoil.pitch, weapon.recoil.yaw, 0);

    // Digital keys plus the analog touch axes (virtual joystick); the clamp
    // keeps combined input from exceeding full deflection, and desktop is
    // untouched because both axes stay 0 without touch controls.
    const strafe = clamp(
      (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0) + input.moveAxisX,
      -1,
      1,
    );
    const forward = clamp(
      (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0) + input.moveAxisY,
      -1,
      1,
    );
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe);
    if (this.wish.lengthSq() > 1) this.wish.normalize();

    const speed =
      WALK_SPEED * definition.moveSpeedMultiplier * (1 - ADS_MOVE_PENALTY * weapon.adsAlpha);
    this.wish.multiplyScalar(speed);
    this.velocity.x = damp(this.velocity.x, this.wish.x, ACCELERATION, dt);
    this.velocity.z = damp(this.velocity.z, this.wish.z, ACCELERATION, dt);

    let nextX = clamp(
      this.rig.position.x + this.velocity.x * dt,
      this.bounds.minX,
      this.bounds.maxX,
    );
    let nextZ = clamp(
      this.rig.position.z + this.velocity.z * dt,
      this.bounds.minZ,
      this.bounds.maxZ,
    );

    if (this.wallColliders.length > 0) {
      // Resolve each axis independently so the player slides along walls.
      if (this.wouldIntersectWall(nextX, this.rig.position.z)) nextX = this.rig.position.x;
      if (this.wouldIntersectWall(nextX, nextZ)) nextZ = this.rig.position.z;
    }

    this.rig.position.x = nextX;
    this.rig.position.z = nextZ;

    // Floor transitions: automatic on contact with a stair trigger.
    for (const zone of this.floorTransitions) {
      if (zone.sourceFloor === this.currentFloor && zone.box.containsPoint(this.rig.position)) {
        this.currentFloor = zone.targetFloor;
        this.bounds = zone.bounds;
        this.targetY = zone.targetY;
        if (zone.targetX !== undefined) this.rig.position.x = zone.targetX;
        if (zone.targetZ !== undefined) this.rig.position.z = zone.targetZ;
        break;
      }
    }
    this.groundY = damp(this.groundY, this.targetY, FLOOR_BLEND_SPEED, dt);
    if (input.wasPressed('Space') && this.jumpOffset === 0) this.jumpVelocity = JUMP_SPEED;
    if (this.jumpVelocity !== 0 || this.jumpOffset > 0) {
      this.jumpVelocity -= GRAVITY * dt;
      this.jumpOffset += this.jumpVelocity * dt;
      if (this.jumpOffset <= 0) {
        this.jumpOffset = 0;
        this.jumpVelocity = 0;
      }
    }
    this.rig.position.y = this.groundY + this.jumpOffset;

    const targetFov = lerp(BASE_FOV, definition.ads.fov, weapon.adsAlpha);
    if (Math.abs(targetFov - this.fov) > 0.05) {
      this.fov = damp(this.fov, targetFov, 20, dt);
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** True if a body cylinder at (x,z) intersects any wall collider. */
  private wouldIntersectWall(x: number, z: number): boolean {
    const minY = Math.min(this.rig.position.y, this.groundY) - EYE_HEIGHT + 0.05;
    const maxY = Math.max(this.rig.position.y, this.groundY) + 0.25;
    this.tmpBox.min.set(x - BODY_RADIUS, minY, z - BODY_RADIUS);
    this.tmpBox.max.set(x + BODY_RADIUS, maxY, z + BODY_RADIUS);
    for (const wall of this.wallColliders) {
      if (this.tmpBox.intersectsBox(wall)) return true;
    }
    return false;
  }
}
