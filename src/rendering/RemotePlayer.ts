import * as THREE from 'three';
import { lerpAngle, RemoteClock, SnapshotBuffer, type SampleBracket } from '../network/Interpolation';
import type { PlayerNetState } from '../network/Protocol';
import { EYE_HEIGHT } from '../player/PlayerController';
import type { RemoteAvatar, RemoteAvatarMotion } from './RemotePlayerAvatar';

/** Slightly more than two 20 Hz player ticks. */
const INTERPOLATION_DELAY = 0.12;
const SAMPLE_CAPACITY = 12;
/** Low-pass on the measured speed so packet spacing never flickers the gait. */
const SPEED_SMOOTHING = 10;

/**
 * A teammate as a world entity: an interpolated transform plus an animated
 * body. It owns no camera, input, HUD, pointer lock or first-person weapon,
 * and never touches the local player's ammo, points or pause state.
 */
export class RemotePlayer {
  public readonly root = new THREE.Group();

  private readonly samples = new SnapshotBuffer<PlayerNetState>(SAMPLE_CAPACITY);
  private readonly clock = new RemoteClock(INTERPOLATION_DELAY);
  private readonly bracket: SampleBracket<PlayerNetState> = { from: null, to: null, alpha: 0 };
  private readonly motion: RemoteAvatarMotion = {
    speed: 0, forwardSpeed: 0, pitch: 0, aiming: false, reloading: false, alive: true,
  };
  private hasPosition = false;
  private lastX = 0;
  private lastZ = 0;

  public constructor(private readonly avatar: RemoteAvatar) {
    this.root.add(avatar.group);
    this.root.visible = false;
  }

  /** Newest authoritative sample (host validation reads this, rendering interpolates). */
  public get latest(): PlayerNetState | null {
    return this.samples.latest;
  }

  public push(state: PlayerNetState): void {
    this.clock.observe(state.t);
    if (this.samples.push(state)) this.root.visible = true;
  }

  public setAlive(alive: boolean): void {
    this.motion.alive = alive;
  }

  public playFire(): void {
    this.avatar.playFire();
  }

  public update(dt: number): void {
    if (!this.samples.sample(this.clock.renderTime, this.bracket)) return;
    const from = this.bracket.from as PlayerNetState;
    const to = this.bracket.to as PlayerNetState;
    const alpha = this.bracket.alpha;
    const x = from.x + (to.x - from.x) * alpha;
    const z = from.z + (to.z - from.z) * alpha;
    const yaw = lerpAngle(from.yaw, to.yaw, alpha);
    this.root.position.set(x, from.y + (to.y - from.y) * alpha - EYE_HEIGHT, z);
    this.root.rotation.y = yaw;
    if (!this.hasPosition) {
      this.hasPosition = true;
      this.lastX = x;
      this.lastZ = z;
    }
    const vx = dt > 0 ? (x - this.lastX) / dt : 0;
    const vz = dt > 0 ? (z - this.lastZ) / dt : 0;
    this.lastX = x;
    this.lastZ = z;
    const blend = Math.min(1, dt * SPEED_SMOOTHING);
    this.motion.speed += (Math.hypot(vx, vz) - this.motion.speed) * blend;
    // Gameplay forward at yaw is (-sin, -cos): the camera looks down -Z.
    this.motion.forwardSpeed += (-vx * Math.sin(yaw) - vz * Math.cos(yaw) - this.motion.forwardSpeed) * blend;
    this.motion.pitch = from.pitch + (to.pitch - from.pitch) * alpha;
    this.motion.aiming = to.ads;
    this.motion.reloading = to.reloading;
    this.avatar.update(dt, this.motion);
  }

  /** Teammate left: forget the timeline so a rejoin never interpolates from stale data. */
  public clear(): void {
    this.samples.clear();
    this.clock.reset();
    this.hasPosition = false;
    this.motion.speed = 0;
    this.motion.forwardSpeed = 0;
    this.motion.alive = true;
    this.root.visible = false;
  }

  public dispose(): void {
    this.avatar.dispose();
    this.root.removeFromParent();
  }
}
