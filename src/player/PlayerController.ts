import * as THREE from 'three';
import type { Weapon } from '../weapons/Weapon';
import { clamp, damp, lerp } from '../utils/math';
import type { Input } from './Input';

export const BASE_FOV = 75;

const SENSITIVITY = 0.0023;
const PITCH_LIMIT = Math.PI / 2 - 0.02;
const EYE_HEIGHT = 1.7;
const WALK_SPEED = 4.6;
const ACCELERATION = 14;
const ADS_MOVE_PENALTY = 0.45;
/**
 * Delimited walkable area, enforced by the movement clamp below. minZ is
 * the frontier: the firing-line bench (top spanning z 0.8–1.6) plus the
 * angled barriers form a physical barrier the player can neither cross nor
 * round — the field beyond (target lanes, zombie grounds) stays off-limits
 * in every mode. 1.7 keeps a hair of clearance so the view never clips the
 * bench top.
 */
export const PLAYER_BOUNDS = {
  minX: -7,
  maxX: 7,
  minZ: 1.7,
  maxZ: 8,
} as const;

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

  update(dt: number, input: Input, weapon: Weapon): void {
    const definition = weapon.definition;

    const sensitivity = SENSITIVITY * lerp(1, definition.ads.sensitivity, weapon.adsAlpha);
    this.yaw -= input.mouseDeltaX * sensitivity;
    this.pitch = clamp(this.pitch - input.mouseDeltaY * sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
    this.rig.rotation.y = this.yaw;
    this.pitchNode.rotation.x = this.pitch;
    this.camera.rotation.set(weapon.recoil.pitch, weapon.recoil.yaw, 0);

    const strafe = (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0);
    const forward = (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe);
    if (this.wish.lengthSq() > 1) this.wish.normalize();

    const speed =
      WALK_SPEED * definition.moveSpeedMultiplier * (1 - ADS_MOVE_PENALTY * weapon.adsAlpha);
    this.wish.multiplyScalar(speed);
    this.velocity.x = damp(this.velocity.x, this.wish.x, ACCELERATION, dt);
    this.velocity.z = damp(this.velocity.z, this.wish.z, ACCELERATION, dt);

    this.rig.position.x = clamp(
      this.rig.position.x + this.velocity.x * dt,
      PLAYER_BOUNDS.minX,
      PLAYER_BOUNDS.maxX,
    );
    this.rig.position.z = clamp(
      this.rig.position.z + this.velocity.z * dt,
      PLAYER_BOUNDS.minZ,
      PLAYER_BOUNDS.maxZ,
    );

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
}
