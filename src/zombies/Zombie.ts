import * as THREE from 'three';
import type { HitTarget, SurfaceType } from '../shooting/HitTarget';
import type { WindowBarrier } from './barriers/WindowBarrier';
import { findVaultStart, openingDepth, vaultProgress, WINDOW_VAULT, type VaultOpening } from './barriers/WindowVault';
import {
  ZOMBIE_ATTACK_DURATION,
  ZOMBIE_ATTACK_HIT_MOMENT,
  ZOMBIE_BARRIER_ATTACK_HIT_MOMENT,
  ZOMBIE_ATTACK_RECOVERY,
  ZOMBIE_BARRIER_ATTACK_RECOVERY,
  ZOMBIE_BARRIER_BREAK_FINISH_DURATION,
  ZOMBIE_CORPSE_LINGER,
  ZOMBIE_DEATH_FADE,
  ZOMBIE_DEATH_FALL,
  ZOMBIE_ELECTRIFIED_DURATION,
  ZOMBIE_RAYGUN_DEATH_DURATION,
  ZOMBIE_SPAWN_DURATION,
  ZOMBIE_ATTACK_DAMAGE,
  ZOMBIE_TYPE_CONFIGS,
  type ZombieTypeId,
} from './ZombieConfig';
import { ZOMBIE_MODELS, ZombieVisual } from './ZombieVisual';
import { resolveZombieDeathStyle, type ZombieDeathStyle, type ZombieKillSource } from './ZombieDeath';
import type { GibWalls } from './GibWalls';
import { ZombieGibs } from './ZombieGibs';
import { ZombieBloodPool } from './ZombieBloodPool';

/** Metres ahead of the feet where a body burnt to death lies on its chest. */
const BURN_POOL_FORWARD = 0.6;

export type ZombieState =
  | 'spawn'
  | 'walk'
  | 'attack'
  | 'hit'
  | 'death'
  | 'barrierAttack'
  | 'barrierBreak';

/** Lifecycle of the death: a fallen corpse, the Ray Gun dissolve, or a body blown into gibs. */
export type ZombieDeathKind = 'normal' | 'raygun' | 'shatter';

/** Death lifecycle a replicated style implies; the Ray Gun dissolve also follows a lethal headshot locally. */
function deathKindOf(style: ZombieDeathStyle): ZombieDeathKind {
  if (style === 'blast') return 'raygun';
  return style === 'shatter' ? 'shatter' : 'normal';
}

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
  // Closely follows the visible skull: the animated anchor keeps it fair
  // while the tighter radius makes the high-value headshot deliberate.
  headGeometry ??= new THREE.SphereGeometry(0.22, 12, 10);
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
  deathKind: ZombieDeathKind = 'normal';
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
  /** Fall chosen by the killing blow; replicated so co-op guests see the same death. */
  deathStyle: ZombieDeathStyle = 'knockback';

  private stateTimer = 0;
  private attackCooldown = 0;
  private attackApplied = false;
  private attackRecovery = ZOMBIE_ATTACK_RECOVERY;
  private readonly torsoBaseScale = new THREE.Vector3();
  private readonly headBaseScale = new THREE.Vector3();
  private readonly tmpImpactOrigin = new THREE.Vector3();
  private previousYaw = 0;
  private deathGroundY = 0;
  /** Window this body is climbing through, from outside its sill until it is clear inside. */
  private vaultOpening: VaultOpening | null = null;
  /** Pieces shown in place of the body after a 'shatter' death; built on the first one. */
  private gibs: ZombieGibs | null = null;
  /** Blood under a body burnt to death; built on the first one. */
  private bloodPool: ZombieBloodPool | null = null;
  /** Body-local unit direction of the latest impact (x: its left, y: forward). */
  readonly impact = new THREE.Vector2();

  /** `gibWalls` is the map wall set shared by the pool; a shattered body's pieces bounce off it. */
  constructor(visual?: ZombieVisual, private readonly gibWalls: GibWalls = { boxes: [] }) {
    this.visual = visual ?? new ZombieVisual('walker', null, ZOMBIE_MODELS.walker.tints[0]);

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

  /** Standing movement volume, without the animated attack lunge or death pose. */
  get bodyHeight(): number {
    return ZOMBIE_MODELS[this.visual.modelId].height * this.group.scale.y;
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
    this.deathKind = 'normal';
    this.stateTimer = ZOMBIE_SPAWN_DURATION;
    this.previousYaw = 0;
    this.deathGroundY = y;
    this.deathStyle = 'knockback';
    this.attackCooldown = 0;
    this.attackApplied = false;
    this.vaultOpening = null;
    this.visual.clearWindowVault();
    this.floor = floor;
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, 0, 0);
    this.visual.setDissolveProgress(0);
    this.visual.setOpacity(1);
    this.visual.setSpawnRise(0);
    this.visual.root.visible = true;
    this.gibs?.hide();
    this.bloodPool?.hide();
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

  /** Ends the ground rise at once: the body appears standing (a map ambush). */
  skipSpawnRise(): void {
    if (this.state === 'spawn') this.setWalk();
  }

  /** HitTarget hook: pure visual feedback; damage arrives via applyDamage. */
  onHit(): void {
    if (this.isAlive) this.visual.hitFlash();
  }

  /**
   * Applies pre-computed damage. Returns true when the hit is lethal.
   * Non-lethal hits trigger directional visual feedback without interrupting
   * pursuit. Headshots and stronger damage produce a larger brief reaction.
   * The lethal blow's source and direction pick the death performance.
   */
  applyDamage(
    amount: number,
    headshot = false,
    sourceX?: number,
    sourceZ?: number,
    source?: ZombieKillSource | 'normal',
  ): boolean {
    if (!this.isAlive) return false;
    this.hp -= amount;
    this.visual.hitFlash();
    this.reactToDamage(amount, headshot, sourceX, sourceZ);
    if (this.hp <= 0) {
      const killSource = source === 'normal' ? undefined : source;
      const style = resolveZombieDeathStyle(killSource, headshot, this.impact.y);
      this.enterDeath(style, killSource === 'raygun' ? 'raygun' : deathKindOf(style), headshot);
      return true;
    }
    return false;
  }

  /** Network replica: host-confirmed hit feedback; the replica never owns health. */
  public playReplicatedHit(amount: number, headshot: boolean, sourceX: number, sourceZ: number): void {
    if (!this.isAlive) return;
    this.visual.hitFlash();
    this.reactToDamage(amount, headshot, sourceX, sourceZ);
  }

  /** Network replica: the host decided this zombie died, how, and from which body-local side. */
  public playReplicatedDeath(style: ZombieDeathStyle = 'knockback', impactX = 0, impactZ = -1): void {
    if (!this.isAlive) return;
    this.impact.set(impactX, impactZ);
    this.enterDeath(style);
  }

  /** ФАКЕЛ-33 fire on the body for `seconds`, surviving or not; damage is the mode's (ZombieBurns). */
  public ignite(seconds: number): void {
    if (this.group.visible) this.visual.ignite(seconds);
  }

  /** ZEUS-77 hit: residual arcs crawl over the body, surviving or not. */
  public electrify(): void {
    if (this.group.visible) this.visual.electrify(ZOMBIE_ELECTRIFIED_DURATION);
  }

  /** Network replica: animation-only swing; it can never emit onAttackLanded. */
  public playReplicatedAttack(kind: 'attack' | 'barrierAttack'): void {
    if (!this.isAlive) return;
    this.state = kind;
    this.stateTimer = ZOMBIE_ATTACK_DURATION;
    this.attackApplied = true;
    this.visual.setAttackDuration(ZOMBIE_ATTACK_DURATION);
    this.visual.setState(kind);
  }

  private reactToDamage(amount: number, headshot: boolean, sourceX?: number, sourceZ?: number): void {
    this.updateImpact(sourceX, sourceZ);
    this.visual.reactToHit(
      this.impact.x,
      this.impact.y,
      Math.min(0.3, 0.07 + amount / Math.max(1, this.maxHp) * 0.3 + (headshot ? 0.06 : 0)),
    );
  }

  /** Body-local unit direction the impact travels (x: its left, y: forward); unknown sources push from the front. */
  private updateImpact(sourceX?: number, sourceZ?: number): void {
    const yaw = this.group.rotation.y;
    const dx = sourceX === undefined ? -Math.sin(yaw) : this.position.x - sourceX;
    const dz = sourceZ === undefined ? -Math.cos(yaw) : this.position.z - sourceZ;
    const length = Math.hypot(dx, dz) || 1;
    this.impact.set(
      (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / length,
      (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / length,
    );
  }

  private enterDeath(
    style: ZombieDeathStyle,
    deathKind: ZombieDeathKind = deathKindOf(style),
    headshot = false,
  ): void {
    this.deathGroundY = this.position.y;
    this.deathStyle = style;
    this.deathKind = deathKind;
    this.state = 'death';
    this.stateTimer = ZOMBIE_DEATH_FALL + ZOMBIE_CORPSE_LINGER + ZOMBIE_DEATH_FADE;
    if (style === 'shatter') {
      // The body is gone at once; its pieces take the corpse's place and time.
      this.visual.root.visible = false;
      if (!this.gibs) {
        this.gibs = new ZombieGibs(this.visual.tint, this.gibWalls);
        this.group.add(this.gibs.group);
      }
      this.gibs.burst(this.impact.x, this.impact.y, ZOMBIE_TYPE_CONFIGS[this.typeId].bodyScale[1], this.group.rotation.y);
      return;
    }
    this.visual.prepareDeath(style, this.impact.x, this.impact.y);
    this.visual.setState('death');
    if (style === 'shock') this.electrify();
    if (style === 'burn') {
      this.visual.incinerate();
      if (!this.bloodPool) {
        this.bloodPool = new ZombieBloodPool();
        this.group.add(this.bloodPool.mesh);
      }
      // The body falls forward onto its face: the blood spreads under its chest.
      this.bloodPool.bleed(BURN_POOL_FORWARD * ZOMBIE_TYPE_CONFIGS[this.typeId].bodyScale[2]);
    }
    if (deathKind === 'raygun') {
      this.stateTimer = ZOMBIE_RAYGUN_DEATH_DURATION;
      this.tmpImpactOrigin.set(0, headshot ? 1.55 : 1.05, 0);
      this.visual.setDissolveProgress(0.01, this.tmpImpactOrigin);
    } else {
      this.visual.setDissolveProgress(0);
    }
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

  /** Starts the dedicated barrier strike with its own deliberate impact timing. */
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

  /**
   * Starts, follows or ends the climb through an open window from where the
   * body stands; called by the owner (simulation or co-op replica) before
   * update(). Purely visual: movement never waits for the climb.
   */
  trackWindowVault(openings: ReadonlyArray<VaultOpening>): void {
    if (this.isAlive && !this.vaultOpening) this.vaultOpening = findVaultStart(openings, this.position.x, this.position.z, this.floor);
    const opening = this.vaultOpening;
    const depth = opening && this.isAlive && opening.floor === this.floor ? openingDepth(opening, this.position.x, this.position.z) : null;
    if (!opening || depth === null || depth < WINDOW_VAULT.endDepth || depth > WINDOW_VAULT.startDepth) {
      this.vaultOpening = null;
      this.visual.clearWindowVault();
      return;
    }
    const scale = Math.max(0.01, this.group.scale.y);
    this.visual.setWindowVault(vaultProgress(depth), opening.sill / scale, depth / scale);
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
        const hitMoment = this.state === 'attack' ? ZOMBIE_ATTACK_HIT_MOMENT : ZOMBIE_BARRIER_ATTACK_HIT_MOMENT;
        if (!this.attackApplied && elapsed + 1e-9 >= hitMoment) {
          this.attackApplied = true;
          this.onAttackLanded?.();
        }
        if (this.stateTimer <= 0) this.setWalk();
        break;
      }
      case 'barrierBreak':
      case 'hit': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.setWalk();
        break;
      }
      case 'death': {
        this.stateTimer -= dt;
        if (this.deathKind === 'raygun') {
          const progress = 1 - Math.max(0, this.stateTimer / ZOMBIE_RAYGUN_DEATH_DURATION);
          this.visual.setDissolveProgress(progress);
          if (this.stateTimer <= 0) {
            this.group.visible = false;
            this.group.position.y = 0;
            this.visual.setDissolveProgress(0);
            this.visual.setOpacity(1);
            this.onDeathFinished?.();
            return;
          }
          break;
        }
        const total = ZOMBIE_DEATH_FALL + ZOMBIE_CORPSE_LINGER + ZOMBIE_DEATH_FADE;
        const elapsed = total - Math.max(0, this.stateTimer);
        if (this.deathKind === 'shatter') {
          // The hidden body needs no animation; only its pieces move.
          this.gibs?.update(dt, Math.max(0, elapsed - ZOMBIE_DEATH_FALL - ZOMBIE_CORPSE_LINGER) / ZOMBIE_DEATH_FADE);
          if (this.stateTimer <= 0) {
            this.group.visible = false;
            this.gibs?.hide();
            this.visual.root.visible = true;
            this.onDeathFinished?.();
          }
          return;
        }
        this.visual.setDeathProgress(Math.min(1, elapsed / ZOMBIE_DEATH_FALL));
        this.bloodPool?.update(dt, Math.max(0, elapsed - ZOMBIE_DEATH_FALL - ZOMBIE_CORPSE_LINGER) / ZOMBIE_DEATH_FADE);
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
          this.bloodPool?.hide();
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

  public dispose(): void {
    this.visual.dispose();
    this.bloodPool?.dispose();
    this.gibs?.dispose();
  }

  private setWalk(): void {
    this.state = 'walk';
    // A hit can interrupt the spawn rise: never leave the body half-buried.
    this.visual.setSpawnRise(1);
    this.visual.setState('walk');
  }
}
