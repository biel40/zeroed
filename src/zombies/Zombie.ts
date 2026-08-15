import * as THREE from 'three';
import type { HitTarget, SurfaceType } from '../shooting/HitTarget';
import type { WindowBarrier } from './barriers/WindowBarrier';
import {
  ZOMBIE_ATTACK_DURATION,
  ZOMBIE_ATTACK_HIT_MOMENT,
  ZOMBIE_ATTACK_RECOVERY,
  ZOMBIE_CORPSE_LINGER,
  ZOMBIE_DEATH_FADE,
  ZOMBIE_DEATH_FALL,
  ZOMBIE_HIT_DURATION,
  ZOMBIE_HIT_HEADSHOT_FACTOR,
  ZOMBIE_SPAWN_DURATION,
} from './ZombieConfig';
import { ZombieVisual } from './ZombieVisual';

export type ZombieState = 'spawn' | 'walk' | 'attack' | 'hit' | 'death' | 'barrierAttack';

// Shared invisible hitbox geometry across every pooled zombie.
let torsoGeometry: THREE.CapsuleGeometry | null = null;
let headGeometry: THREE.SphereGeometry | null = null;
let hitboxMaterial: THREE.MeshBasicMaterial | null = null;

function getTorsoGeometry(): THREE.CapsuleGeometry {
  // Envelope of the animated torso + arms: slightly wider than the visible
  // body, and tall enough to reach the ground (leg shots count as torso).
  torsoGeometry ??= new THREE.CapsuleGeometry(0.38, 0.8, 4, 12);
  return torsoGeometry;
}
function getHeadGeometry(): THREE.SphereGeometry {
  // Slightly wider than the visible skull: headshots stay rewarding without
  // demanding pixel-perfect aim at a swaying target.
  headGeometry ??= new THREE.SphereGeometry(0.26, 12, 10);
  return headGeometry;
}
/** Invisible to the eye, fully visible to the raycaster. */
function getHitboxMaterial(): THREE.MeshBasicMaterial {
  hitboxMaterial ??= new THREE.MeshBasicMaterial({ visible: false });
  return hitboxMaterial;
}

/**
 * One pooled zombie: a tiny state machine driving a ZombieVisual body (GLB
 * skinned humanoid or procedural fallback). Movement decisions live in
 * ZombieManager; this class owns animation timing, hit reactions and the
 * death sequence (fall → corpse linger → fade → recycle). Two invisible
 * humanoid-proportioned meshes double as raycast hitboxes via userData;
 * they ride the animated skeleton (see attachHitboxes) so they can never
 * desync from the rendered pose.
 */
export class Zombie implements HitTarget {
  readonly group = new THREE.Group();
  readonly headHitbox: THREE.Mesh;
  readonly torsoHitbox: THREE.Mesh;
  readonly visual: ZombieVisual;
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
  /** Optional barrier this zombie must breach before chasing the player. */
  barrierTarget: WindowBarrier | null = null;
  /** Logical map floor; Y is the corresponding physical floor elevation. */
  floor = 0;

  private stateTimer = 0;
  private attackCooldown = 0;
  private attackApplied = false;

  constructor(visual?: ZombieVisual) {
    this.visual = visual ?? new ZombieVisual('walker', null, 0xa8b89a);

    // Hitboxes are parented onto the animated rig (bones, or the procedural
    // rig groups): the walk sway and the attack lunge move the visible body
    // up to ~0.5–0.9 m away from any static offset, so colliders fixed to
    // the visual root systematically lagged the rendered pose. Bone-anchored
    // hitboxes follow every animation frame for free — the mixer updates
    // those world matrices anyway.
    this.torsoHitbox = new THREE.Mesh(getTorsoGeometry(), getHitboxMaterial());
    this.headHitbox = new THREE.Mesh(getHeadGeometry(), getHitboxMaterial());

    this.group.add(this.visual.root);
    this.visual.attachHitboxes(this.torsoHitbox, this.headHitbox);

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
  spawn(x: number, z: number, hp: number, speed: number, y = 0, floor = 0): void {
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.state = 'spawn';
    this.stateTimer = ZOMBIE_SPAWN_DURATION;
    this.attackCooldown = 0;
    this.attackApplied = false;
    this.floor = floor;
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, 0, 0);
    this.visual.setOpacity(1);
    this.visual.setSpawnRise(0);
    this.visual.setState('spawn');
    this.group.visible = true;
  }

  /** HitTarget hook: pure visual feedback; damage arrives via applyDamage. */
  onHit(): void {
    if (this.isAlive) this.visual.hitFlash();
  }

  /**
   * Applies pre-computed damage. Returns true when the hit is lethal.
   * Non-lethal hits briefly interrupt the current action; headshots stagger
   * noticeably longer.
   */
  applyDamage(amount: number, headshot = false): boolean {
    if (!this.isAlive) return false;
    this.hp -= amount;
    this.visual.hitFlash();
    if (this.hp <= 0) {
      this.state = 'death';
      this.stateTimer = ZOMBIE_DEATH_FALL + ZOMBIE_CORPSE_LINGER + ZOMBIE_DEATH_FADE;
      this.visual.setState('death');
      return true;
    }
    if (this.state !== 'attack') {
      this.state = 'hit';
      this.stateTimer = headshot
        ? ZOMBIE_HIT_DURATION * ZOMBIE_HIT_HEADSHOT_FACTOR
        : ZOMBIE_HIT_DURATION;
      this.visual.setState('hit');
    }
    return false;
  }

  /** Starts the attack lunge if the cooldown allows it. */
  tryAttack(): boolean {
    if (!this.isAlive || this.attackCooldown > 0 || this.state === 'attack') return false;
    this.state = 'attack';
    this.stateTimer = ZOMBIE_ATTACK_DURATION;
    this.attackApplied = false;
    this.attackCooldown = ZOMBIE_ATTACK_DURATION + ZOMBIE_ATTACK_RECOVERY;
    this.visual.setAttackDuration(ZOMBIE_ATTACK_DURATION);
    this.visual.setState('attack');
    return true;
  }

  /** Starts the barrier-attack animation. Reuses the same timing. */
  tryBarrierAttack(): boolean {
    if (!this.isAlive || this.attackCooldown > 0 || this.state === 'barrierAttack') return false;
    this.state = 'barrierAttack';
    this.stateTimer = ZOMBIE_ATTACK_DURATION;
    this.attackApplied = false;
    this.attackCooldown = ZOMBIE_ATTACK_DURATION + ZOMBIE_ATTACK_RECOVERY;
    this.visual.setAttackDuration(ZOMBIE_ATTACK_DURATION);
    this.visual.setState('barrierAttack');
    return true;
  }

  faceTowards(x: number, z: number, maxTurn = Infinity): void {
    const target = Math.atan2(x - this.group.position.x, z - this.group.position.z);
    const delta = Math.atan2(
      Math.sin(target - this.group.rotation.y),
      Math.cos(target - this.group.rotation.y),
    );
    this.group.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, delta));
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    switch (this.state) {
      case 'spawn': {
        this.stateTimer -= dt;
        const t = 1 - Math.max(0, this.stateTimer / ZOMBIE_SPAWN_DURATION);
        // Ease-out rise from the ground: fast at first, settles at the end.
        this.visual.setSpawnRise(1 - (1 - t) * (1 - t));
        if (this.stateTimer <= 0) this.setWalk();
        break;
      }
      case 'attack':
      case 'barrierAttack': {
        this.stateTimer -= dt;
        const elapsed = ZOMBIE_ATTACK_DURATION - this.stateTimer;
        if (!this.attackApplied && elapsed >= ZOMBIE_ATTACK_HIT_MOMENT) {
          this.attackApplied = true;
          this.onAttackLanded?.();
        }
        if (this.stateTimer <= 0) this.setWalk();
        break;
      }
      case 'hit': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.setWalk();
        break;
      }
      case 'death': {
        this.stateTimer -= dt;
        const total = ZOMBIE_DEATH_FALL + ZOMBIE_CORPSE_LINGER + ZOMBIE_DEATH_FADE;
        const elapsed = total - Math.max(0, this.stateTimer);
        if (elapsed <= ZOMBIE_DEATH_FALL) {
          this.visual.setDeathProgress(elapsed / ZOMBIE_DEATH_FALL);
        } else if (elapsed > ZOMBIE_DEATH_FALL + ZOMBIE_CORPSE_LINGER) {
          const fade =
            (elapsed - ZOMBIE_DEATH_FALL - ZOMBIE_CORPSE_LINGER) / ZOMBIE_DEATH_FADE;
          this.visual.setOpacity(1 - fade);
          this.group.position.y = -fade * 0.35; // sinks gently while fading
        }
        if (this.stateTimer <= 0) {
          this.group.visible = false;
          this.group.position.y = 0;
          this.visual.setOpacity(1);
          this.onDeathFinished?.();
          return;
        }
        break;
      }
      default:
        break;
    }

    this.visual.update(dt, this.speed);
  }

  private setWalk(): void {
    this.state = 'walk';
    // A hit can interrupt the spawn rise: never leave the body half-buried.
    this.visual.setSpawnRise(1);
    this.visual.setState('walk');
  }
}
