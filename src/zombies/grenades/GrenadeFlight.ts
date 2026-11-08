import * as THREE from 'three';
import type { GrenadeFlightConfig } from '../../config/grenades';
import type { GibWallContact } from '../GibWalls';

/** Solid boxes a grenade bounces off; `GibWallFrame` provides it in world space. */
export interface GrenadeObstacles {
  /** Moves `position` (a ball of `radius` coming from `previous`) out of the first box it entered; the face, or null. */
  collide(position: THREE.Vector3, previous: THREE.Vector3, radius: number): GibWallContact | null;
}

/** Integration step: small enough that a 15 m/s throw never skips a 10 cm wall. */
const STEP = 1 / 120;
/** Below this normal speed a landing stops bouncing and the grenade rolls. */
const SETTLE_SPEED = 1.2;
/** Below this ground speed a rolling grenade comes to rest. */
const REST_SPEED = 0.05;
/** Tumble of a fresh throw, rad/s. */
const THROW_SPIN = 9;

/**
 * Ballistics of one thrown grenade: gravity, bounces off the floor and the
 * map's solid boxes, rolling to rest, and the fuse burning from the throw.
 * Pure state over reusable vectors; the view only reads it.
 */
export class GrenadeFlight {
  public readonly position = new THREE.Vector3();
  public readonly velocity = new THREE.Vector3();
  /** Tumble the view applies to the body, rad/s around each axis. */
  public readonly spin = new THREE.Vector3();
  private readonly previous = new THREE.Vector3();
  private config: GrenadeFlightConfig | null = null;
  private floorY = 0;
  private fuseLeft = 0;
  private rolling = false;
  private resting = false;

  /** Seconds until the blast. */
  public get fuse(): number {
    return this.fuseLeft;
  }

  public get isResting(): boolean {
    return this.resting;
  }

  /**
   * Leaves the hand at `origin` towards `aim` (unit), lifted by the throw.
   * `from` is where the hand started (the eye): a throw against a wall
   * stops at its face instead of starting inside it. `floorY` is the
   * floor the grenade falls on wherever no box holds it.
   */
  public launch(
    config: GrenadeFlightConfig,
    from: THREE.Vector3,
    origin: THREE.Vector3,
    aim: THREE.Vector3,
    fuseSeconds: number,
    floorY: number,
    obstacles: GrenadeObstacles,
  ): void {
    this.config = config;
    this.floorY = floorY;
    this.fuseLeft = fuseSeconds;
    this.rolling = false;
    this.resting = false;
    // Lift the aim in its own vertical plane, never past straight up.
    const horizontal = Math.hypot(aim.x, aim.z);
    const pitch = Math.min(Math.PI / 2 - 0.01, Math.atan2(aim.y, horizontal) + config.throwLift);
    const yaw = horizontal > 1e-6 ? Math.atan2(aim.x, aim.z) : 0;
    this.velocity.set(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ).multiplyScalar(config.throwSpeed);
    this.spin.set(THROW_SPIN, THROW_SPIN * 0.35, THROW_SPIN * 0.2);
    this.position.copy(origin);
    obstacles.collide(this.position, from, config.radius);
  }

  /** Advances `dt` seconds; returns the hardest impact speed of this step (0 when nothing was hit). */
  public step(dt: number, obstacles: GrenadeObstacles): number {
    const config = this.config;
    if (!config) return 0;
    // Spent before it moved: it went off in the hand, right where it is.
    if (this.fuseLeft <= 0) return 0;
    this.fuseLeft = Math.max(0, this.fuseLeft - dt);
    let impact = 0;
    let remaining = Math.max(0, dt);
    while (remaining > 1e-9 && !this.resting) {
      const step = Math.min(remaining, STEP);
      remaining -= step;
      impact = Math.max(impact, this.integrate(config, step, obstacles));
    }
    return impact;
  }

  private integrate(config: GrenadeFlightConfig, dt: number, obstacles: GrenadeObstacles): number {
    this.previous.copy(this.position);
    if (this.rolling) {
      const drag = Math.exp(-config.rollDrag * dt);
      this.velocity.x *= drag;
      this.velocity.z *= drag;
      this.spin.multiplyScalar(drag);
      if (Math.hypot(this.velocity.x, this.velocity.z) < REST_SPEED) {
        this.velocity.set(0, 0, 0);
        this.spin.set(0, 0, 0);
        this.resting = true;
        return 0;
      }
    }
    // A rolling grenade keeps falling: it drops off an edge onto the floor below.
    this.velocity.y -= config.gravity * dt;
    this.position.addScaledVector(this.velocity, dt);
    let impact = 0;
    const contact = obstacles.collide(this.position, this.previous, config.radius);
    if (contact === 'top') impact = this.land(config);
    else if (contact) impact = this.hitWall(config, contact);
    if (this.position.y <= this.floorY + config.radius && this.velocity.y < 0) {
      this.position.y = this.floorY + config.radius;
      impact = Math.max(impact, this.land(config));
    }
    return impact;
  }

  /** Touchdown on a horizontal surface: bounce, or settle into a roll. */
  private land(config: GrenadeFlightConfig): number {
    const speed = -this.velocity.y;
    if (speed <= 0) return 0;
    this.velocity.x *= config.friction;
    this.velocity.z *= config.friction;
    if (speed < SETTLE_SPEED) {
      this.velocity.y = 0;
      this.rolling = true;
      // The gravity of each rolling step is no impact; a soft final drop still clinks.
      return speed < SETTLE_SPEED * 0.5 ? 0 : speed;
    }
    this.velocity.y = speed * config.bounce;
    this.spin.multiplyScalar(0.6);
    return speed;
  }

  /** A side face reflects the normal speed; 'inside' (from below or within a box) kills the horizontal motion. */
  private hitWall(config: GrenadeFlightConfig, contact: Exclude<GibWallContact, 'top'>): number {
    let speed: number;
    if (contact === 'x') {
      speed = Math.abs(this.velocity.x);
      this.velocity.x = -this.velocity.x * config.bounce;
      this.velocity.z *= config.friction;
    } else if (contact === 'z') {
      speed = Math.abs(this.velocity.z);
      this.velocity.z = -this.velocity.z * config.bounce;
      this.velocity.x *= config.friction;
    } else {
      speed = Math.hypot(this.velocity.x, this.velocity.z);
      this.velocity.x = this.velocity.z = 0;
      if (this.velocity.y > 0) this.velocity.y = -this.velocity.y * config.bounce;
    }
    this.spin.multiplyScalar(0.7);
    return speed;
  }
}
