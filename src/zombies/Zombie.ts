import * as THREE from 'three';
import type { HitTarget, SurfaceType } from '../shooting/HitTarget';
import type { WindowBarrier } from './barriers/WindowBarrier';
import {
  ZOMBIE_ATTACK_DURATION,
  ZOMBIE_ATTACK_HIT_MOMENT,
  ZOMBIE_ATTACK_RECOVERY,
  ZOMBIE_BARRIER_ATTACK_RECOVERY,
  ZOMBIE_BARRIER_BREAK_FINISH_DURATION,
  ZOMBIE_CORPSE_LINGER,
  ZOMBIE_DEATH_FADE,
  ZOMBIE_DEATH_FALL,
  ZOMBIE_SPAWN_DURATION,
  ZOMBIE_ATTACK_DAMAGE,
  ZOMBIE_TYPE_CONFIGS,
  type ZombieTypeId,
} from './ZombieConfig';
import { ZombieVisual } from './ZombieVisual';

export type ZombieState =
  | 'spawn'
  | 'walk'
  | 'attack'
  | 'hit'
  | 'death'
  | 'barrierAttack'
  | 'barrierBreak';

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
  attackDamage = ZOMBIE_ATTACK_DAMAGE;
  bodyRadius = ZOMBIE_TYPE_CONFIGS.normal.bodyRadius;
  typeId: ZombieTypeId = 'normal';
  /** Optional barrier this zombie must breach before chasing the player. */
  barrierTarget: WindowBarrier | null = null;
  /** Logical map floor; Y is the corresponding physical floor elevation. */
  floor = 0;

  private stateTimer = 0;
  private attackCooldown = 0;
  private attackApplied = false;
  private attackRecovery = ZOMBIE_ATTACK_RECOVERY;
  private readonly torsoBaseScale = new THREE.Vector3();
  private readonly headBaseScale = new THREE.Vector3();
  private previousYaw = 0;
  private deathGroundY = 0;

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
    this.torsoBaseScale.copy(this.torsoHitbox.scale);
    this.headBaseScale.copy(this.headHitbox.scale);

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
  spawn(
    x: number,
    z: number,
    hp: number,
    speed: number,
    y = 0,
    floor = 0,
    typeId: ZombieTypeId = 'normal',
    attackDamage = ZOMBIE_ATTACK_DAMAGE,
  ): void {
    this.typeId = typeId;
    this.attackDamage = attackDamage;
    const profile = ZOMBIE_TYPE_CONFIGS[typeId];
    this.attackRecovery = profile.attackRecovery;
    this.bodyRadius = profile.bodyRadius;
    this.visual.setZombieType(typeId);
    this.applyHitboxProfile(profile.bodyScale, profile.hitboxScale);
    this.hp = hp;
    this.maxHp = hp;
    this.speed = speed;
    this.state = 'spawn';
    this.stateTimer = ZOMBIE_SPAWN_DURATION;
    this.previousYaw = 0;
    this.deathGroundY = y;
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

  private applyHitboxProfile(
    bodyScale: readonly [number, number, number],
    hitboxScale: readonly [number, number, number],
  ): void {
    const apply = (hitbox: THREE.Object3D, base: THREE.Vector3): void => {
      hitbox.scale.set(
        base.x * hitboxScale[0] / bodyScale[0],
        base.y * hitboxScale[1] / bodyScale[1],
        base.z * hitboxScale[2] / bodyScale[2],
      );
    };
    apply(this.torsoHitbox, this.torsoBaseScale);
    apply(this.headHitbox, this.headBaseScale);
  }

  /** HitTarget hook: pure visual feedback; damage arrives via applyDamage. */
  onHit(): void {
    if (this.isAlive) this.visual.hitFlash();
  }

  /**
   * Applies pre-computed damage. Returns true when the hit is lethal.
   * Non-lethal hits trigger directional visual feedback without interrupting
   * pursuit. Headshots and stronger damage produce a larger brief reaction.
   */
  applyDamage(amount: number, headshot = false, sourceX?: number, sourceZ?: number): boolean {
    if (!this.isAlive) return false;
    this.hp -= amount;
    this.visual.hitFlash();
    const dx = sourceX === undefined ? -Math.sin(this.group.rotation.y) : this.position.x - sourceX;
    const dz = sourceZ === undefined ? -Math.cos(this.group.rotation.y) : this.position.z - sourceZ;
    const length = Math.hypot(dx, dz) || 1;
    const yaw = this.group.rotation.y;
    this.visual.reactToHit(
      (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / length,
      (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / length,
      Math.min(0.3, 0.07 + amount / Math.max(1, this.maxHp) * 0.3 + (headshot ? 0.06 : 0)),
    );
    if (this.hp <= 0) {
      this.deathGroundY = this.position.y;
      this.state = 'death';
      this.stateTimer = ZOMBIE_DEATH_FALL + ZOMBIE_CORPSE_LINGER + ZOMBIE_DEATH_FADE;
      this.visual.setState('death');
      return true;
    }
    return false;
  }

  /** Starts the attack lunge if the cooldown allows it. */
  tryAttack(): boolean {
    if (!this.isAlive || this.attackCooldown > 0 || this.state === 'attack') return false;
    this.state = 'attack';
    this.stateTimer = ZOMBIE_ATTACK_DURATION;
    this.attackApplied = false;
    this.attackCooldown = ZOMBIE_ATTACK_DURATION + this.attackRecovery;
    this.visual.setAttackDuration(ZOMBIE_ATTACK_DURATION);
    this.visual.setState('attack');
    return true;
  }

  /** Starts the dedicated barrier strike. Gameplay impact timing stays aligned with melee. */
  tryBarrierAttack(): boolean {
    if (!this.isAlive || this.attackCooldown > 0 || this.state === 'barrierAttack') return false;
    this.state = 'barrierAttack';
    this.stateTimer = ZOMBIE_ATTACK_DURATION;
    this.attackApplied = false;
    this.attackCooldown = ZOMBIE_ATTACK_DURATION + ZOMBIE_BARRIER_ATTACK_RECOVERY;
    this.visual.setAttackDuration(ZOMBIE_ATTACK_DURATION);
    this.visual.setState('barrierAttack');
    return true;
  }

  /** Resume pursuit after navigation recovery without changing combat stats. */
  resumePursuit(): void {
    if (!this.isAlive) return;
    this.stateTimer = 0;
    this.attackCooldown = 0;
    this.attackApplied = false;
    this.setWalk();
  }

  /** Stops a committed barrier swing when the target has already opened. */
  public cancelBarrierAttack(): void {
    if (this.state !== 'barrierAttack') return;
    this.finishBarrierAttack();
  }

  /** Completes the last committed strike before entering through the opened window. */
  public finishBarrierAttack(): void {
    if (this.state !== 'barrierAttack') return;
    this.state = 'barrierBreak';
    this.stateTimer = ZOMBIE_BARRIER_BREAK_FINISH_DURATION;
    this.attackApplied = true;
    this.visual.setBarrierBreakDuration(ZOMBIE_BARRIER_BREAK_FINISH_DURATION);
    this.visual.setState('barrierBreak');
  }

  faceTowards(x: number, z: number, maxTurn = Infinity): void {
    const target = Math.atan2(x - this.group.position.x, z - this.group.position.z);
    const delta = Math.atan2(
      Math.sin(target - this.group.rotation.y),
      Math.cos(target - this.group.rotation.y),
    );
    this.group.rotation.y += Math.max(-maxTurn, Math.min(maxTurn, delta));
  }

  update(dt: number, visualSpeed = this.speed): void {
    if (!this.group.visible) return;
    const yawDelta = Math.atan2(Math.sin(this.group.rotation.y - this.previousYaw), Math.cos(this.group.rotation.y - this.previousYaw));
    this.visual.setMotion(dt, visualSpeed, dt > 0 ? yawDelta / dt : 0);
    this.previousYaw = this.group.rotation.y;
    let visualUpdated = false;
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
        // Sample this frame's strike before emitting its impact. A breaking
        // callback can now continue from the exact displayed contact pose.
        this.visual.update(dt, visualSpeed);
        visualUpdated = true;
        if (!this.attackApplied && elapsed >= ZOMBIE_ATTACK_HIT_MOMENT) {
          this.attackApplied = true;
          this.onAttackLanded?.();
        }
        if (this.stateTimer <= 0) this.setWalk();
        break;
      }
      case 'barrierBreak': {
        this.stateTimer -= dt;
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
        this.visual.setDeathProgress(Math.min(1, elapsed / ZOMBIE_DEATH_FALL));
        if (elapsed > ZOMBIE_DEATH_FALL + ZOMBIE_CORPSE_LINGER) {
          const fade =
            (elapsed - ZOMBIE_DEATH_FALL - ZOMBIE_CORPSE_LINGER) / ZOMBIE_DEATH_FADE;
          this.visual.setOpacity(1 - fade);
          this.group.position.y = this.deathGroundY - fade * 0.35;
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

    if (!visualUpdated) this.visual.update(dt, visualSpeed);
  }

  private setWalk(): void {
    this.state = 'walk';
    // A hit can interrupt the spawn rise: never leave the body half-buried.
    this.visual.setSpawnRise(1);
    this.visual.setState('walk');
  }
}
