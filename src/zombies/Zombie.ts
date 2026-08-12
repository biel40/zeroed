import * as THREE from 'three';
import type { HitTarget, SurfaceType } from '../shooting/HitTarget';

export type ZombieState = 'spawn' | 'walk' | 'attack' | 'hit' | 'death';

const SPAWN_DURATION = 0.35;
const HIT_DURATION = 0.18;
const ATTACK_DURATION =0.6;
const ATTACK_HIT_MOMENT = 0.32;
const DEATH_DURATION = 1.2;
const WALK_BOB_FREQUENCY = 6.5;

// Shared geometry across every pooled zombie: allocated once per session.
let torsoGeometry: THREE.CapsuleGeometry | null = null;
let headGeometry: THREE.SphereGeometry | null = null;
let armsGeometry: THREE.BoxGeometry | null = null;

function getTorsoGeometry(): THREE.CapsuleGeometry {
  torsoGeometry ??= new THREE.CapsuleGeometry(0.32, 0.72, 4, 10);
  return torsoGeometry;
}
function getHeadGeometry(): THREE.SphereGeometry {
  headGeometry ??= new THREE.SphereGeometry(0.2, 12, 10);
  return headGeometry;
}
function getArmsGeometry(): THREE.BoxGeometry {
  armsGeometry ??= new THREE.BoxGeometry(0.85, 0.13, 0.13);
  return armsGeometry;
}

/**
 * One pooled zombie: procedural placeholder body (shared geometry, two
 * per-zombie materials created once at pool construction) plus a tiny state
 * machine. Movement decisions live in ZombieManager; this class owns its
 * visual animation, hit reactions and death sequence. The torso and head
 * meshes double as raycast hitboxes via userData.
 */
export class Zombie implements HitTarget {
  readonly group = new THREE.Group();
  readonly headHitbox: THREE.Mesh;
  readonly torsoHitbox: THREE.Mesh;
  readonly acceptsDecals = false;
  readonly surface: SurfaceType = 'flesh';

  /** Fired at the damage moment of the attack animation. */
  onAttackLanded: (() => void) | null = null;
  /** Fired when the death animation finishes and the zombie can be pooled. */
  onDeathFinished: (() => void) | null = null;

  state: ZombieState = 'spawn';
  hp = 0;
  maxHp = 0;
  speed = 0;

  private readonly bodyMaterial: THREE.MeshStandardMaterial;
  private readonly headMaterial: THREE.MeshStandardMaterial;
  private readonly arms: THREE.Mesh;
  private stateTimer = 0;
  private attackCooldown = 0;
  private attackApplied = false;
  private flash = 0;
  private bobPhase = 0;

  constructor() {
    // Per-zombie materials (created once, reused forever) so hit flashes and
    // death fades never touch shared state.
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x55613f,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      emissive: 0xff2211,
      emissiveIntensity: 0,
    });
    this.headMaterial = new THREE.MeshStandardMaterial({
      color: 0x6d7a52,
      roughness: 0.85,
      metalness: 0,
      transparent: true,
      emissive: 0xff2211,
      emissiveIntensity: 0,
    });

    this.torsoHitbox = new THREE.Mesh(getTorsoGeometry(), this.bodyMaterial);
    this.torsoHitbox.position.y = 0.95;
    this.torsoHitbox.castShadow = true;

    this.headHitbox = new THREE.Mesh(getHeadGeometry(), this.headMaterial);
    this.headHitbox.position.y = 1.62;
    this.headHitbox.castShadow = true;

    this.arms = new THREE.Mesh(getArmsGeometry(), this.bodyMaterial);
    this.arms.position.set(0, 1.28, -0.34);

    this.group.add(this.torsoHitbox, this.headHitbox, this.arms);

    this.torsoHitbox.userData.target = this;
    this.torsoHitbox.userData.zombie = this;
    this.torsoHitbox.userData.hitPart = 'torso';
    this.torsoHitbox.userData.surface = this.surface;
    this.headHitbox.userData.target = this;
    this.headHitbox.userData.zombie = this;
    this.headHitbox.userData.hitPart = 'head';
    this.headHitbox.userData.surface = this.surface;

    this.group.visible = false;
  }

  get isAlive(): boolean {
    return this.state !== 'death';
  }

  get position(): THREE.Vector3 {
    return this.group.position;
  }

  /** Resets the pooled zombie and places it at the spawn point. */
  spawn(x: number, z: number, hp: number, speed: number): void {
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.state = 'spawn';
    this.stateTimer = SPAWN_DURATION;
    this.attackCooldown = 0;
    this.attackApplied = false;
    this.flash = 0;
    this.bobPhase = Math.random() * Math.PI * 2;
    this.group.position.set(x, 0, z);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(0.6);
    this.bodyMaterial.opacity = 1;
    this.headMaterial.opacity = 1;
    this.group.visible = true;
  }

  /** HitTarget hook: pure visual feedback; damage arrives via applyDamage. */
  onHit(): void {
    if (this.isAlive) this.flash = 1;
  }

  /**
   * Applies pre-computed damage. Returns true when the hit is lethal.
   * Non-lethal hits briefly interrupt the current action.
   */
  applyDamage(amount: number): boolean {
    if (!this.isAlive) return false;
    this.hp -= amount;
    this.flash = 1;
    if (this.hp <= 0) {
      this.state = 'death';
      this.stateTimer = DEATH_DURATION;
      return true;
    }
    if (this.state !== 'attack') {
      this.state = 'hit';
      this.stateTimer = HIT_DURATION;
    }
    return false;
  }

  /** Starts the attack lunge if the cooldown allows it. */
  tryAttack(): boolean {
    if (!this.isAlive || this.attackCooldown > 0 || this.state === 'attack') return false;
    this.state = 'attack';
    this.stateTimer = ATTACK_DURATION;
    this.attackApplied = false;
    this.attackCooldown = ATTACK_DURATION + 0.5;
    return true;
  }

  faceTowards(x: number, z: number): void {
    this.group.rotation.y = Math.atan2(x - this.group.position.x, z - this.group.position.z);
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 6);
      this.bodyMaterial.emissiveIntensity = this.flash * 1.4;
      this.headMaterial.emissiveIntensity = this.flash * 1.4;
    }

    switch (this.state) {
      case 'spawn': {
        this.stateTimer -= dt;
        const t = 1 - Math.max(0, this.stateTimer / SPAWN_DURATION);
        this.group.scale.setScalar(0.6 + t * 0.4);
        if (this.stateTimer <= 0) this.setWalk();
        break;
      }
      case 'walk': {
        // Shamble: side-to-side sway with a slight forward hunch.
        this.bobPhase += dt * (WALK_BOB_FREQUENCY * (0.7 + this.speed * 0.2));
        this.group.rotation.z = Math.sin(this.bobPhase) * 0.07;
        this.group.rotation.x = 0.12;
        this.arms.position.y = 1.28 + Math.sin(this.bobPhase * 2) * 0.03;
        break;
      }
      case 'attack': {
        this.stateTimer -= dt;
        const t = 1 - this.stateTimer / ATTACK_DURATION;
        // Lunge forward then recover.
        this.group.rotation.x = 0.12 + Math.sin(t * Math.PI) * 0.38;
        if (!this.attackApplied && t * ATTACK_DURATION >= ATTACK_HIT_MOMENT) {
          this.attackApplied = true;
          this.onAttackLanded?.();
        }
        if (this.stateTimer <= 0) this.setWalk();
        break;
      }
      case 'hit': {
        this.stateTimer -= dt;
        this.group.rotation.x = -0.15;
        if (this.stateTimer <= 0) this.setWalk();
        break;
      }
      case 'death': {
        this.stateTimer -= dt;
        const t = 1 - Math.max(0, this.stateTimer / DEATH_DURATION);
        // Tip over backwards, then sink and fade during the last stretch.
        this.group.rotation.x = -t * 1.5;
        if (t > 0.5) {
          const fade = (t - 0.5) * 2;
          this.bodyMaterial.opacity = 1 - fade;
          this.headMaterial.opacity = 1 - fade;
          this.group.position.y = -fade * 0.4;
        }
        if (this.stateTimer <= 0) {
          this.group.visible = false;
          this.group.position.y = 0;
          this.onDeathFinished?.();
        }
        break;
      }
    }
  }

  private setWalk(): void {
    this.state = 'walk';
    this.group.rotation.x = 0.12;
    this.group.rotation.z = 0;
  }
}
