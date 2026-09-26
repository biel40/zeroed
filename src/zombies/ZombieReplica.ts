import * as THREE from 'three';
import type { ZombieNetState } from '../network/Protocol';
import { lerpAngle, RemoteClock, SnapshotBuffer, type SampleBracket } from '../network/Interpolation';
import { Zombie } from './Zombie';
import { ZOMBIE_ATTACK_LUNGE, ZOMBIE_TYPE_CONFIGS, MAX_ALIVE } from './ZombieConfig';
import { ZOMBIE_POOL_MODELS, type ZombieModelSources } from './ZombieManager';
import { ZombiePool } from './ZombiePool';
import { ZombieVisual, ZOMBIE_MODELS } from './ZombieVisual';

/** Two host ticks at 15 Hz, so a bracketing pair almost always exists. */
const INTERPOLATION_DELAY = 0.14;
const SAMPLE_CAPACITY = 8;
/** Above any legitimate walk speed: a larger step is a correction, not a stride. */
const MAX_VISUAL_SPEED = 6;

interface ZombieSample {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

interface ReplicaEntry {
  readonly id: number;
  readonly zombie: Zombie;
  readonly samples: SnapshotBuffer<ZombieSample>;
  dying: boolean;
  generation: number;
  lastX: number;
  lastZ: number;
}

/**
 * Guest-side view of the host's zombies. It never runs navigation, targeting,
 * combat or rounds: spawn/attack/hit/death arrive as host events, transforms
 * arrive in match snapshots and are interpolated on a delayed timeline. The
 * local Zombie state machine only times animations (rise, swing, fall, fade).
 * Hitboxes join the shared collider array so the guest's own bullets can
 * report hits; the host decides what those hits do.
 */
export class ZombieReplica {
  public readonly group = new THREE.Group();

  private readonly pool: ZombiePool;
  private readonly entries = new Map<number, ReplicaEntry>();
  private readonly ids = new Map<Zombie, number>();
  private readonly clock = new RemoteClock(INTERPOLATION_DELAY);
  private readonly bracket: SampleBracket<ZombieSample> = { from: null, to: null, alpha: 0 };
  private generation = 0;

  public constructor(
    sources: ZombieModelSources,
    castShadows: boolean,
    private readonly colliders: THREE.Object3D[],
  ) {
    this.pool = new ZombiePool(ZOMBIE_POOL_MODELS.length, (index) => {
      const modelId = ZOMBIE_POOL_MODELS[index];
      const model = ZOMBIE_MODELS[modelId];
      const zombie = new Zombie(new ZombieVisual(modelId, sources[modelId] ?? null,
        model.tints[index % model.tints.length], castShadows));
      zombie.onDeathFinished = () => this.release(zombie);
      this.group.add(zombie.group);
      return zombie;
    }, MAX_ALIVE);
  }

  public get aliveCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) if (!entry.dying) count++;
    return count;
  }

  /** Spawn id of a replica body hit by a local bullet; null when it already left. */
  public networkIdOf(zombie: Zombie): number | null {
    const id = this.ids.get(zombie);
    const entry = id === undefined ? undefined : this.entries.get(id);
    return entry && !entry.dying ? entry.id : null;
  }

  public spawn(state: ZombieNetState): void {
    if (!this.entries.has(state.id)) this.create(state, true);
  }

  public applyStates(time: number, states: readonly ZombieNetState[]): void {
    this.clock.observe(time);
    const generation = ++this.generation;
    for (const state of states) {
      let entry: ReplicaEntry | null = this.entries.get(state.id) ?? null;
      if (!entry) {
        // Late join or a missed spawn: adopt the body without replaying its rise.
        if (state.state === 'death') continue;
        entry = this.create(state, false);
        if (!entry) continue;
      }
      entry.generation = generation;
      if (entry.dying) continue;
      entry.samples.push({ t: time, x: state.x, y: state.y, z: state.z, yaw: state.yaw });
      entry.zombie.hp = state.hp;
      this.replicateState(entry, state);
    }
    for (const entry of this.entries.values()) {
      if (entry.generation !== generation && !entry.dying) this.release(entry.zombie);
    }
  }

  public attack(id: number, targetX: number, targetY: number, targetZ: number): void {
    const entry = this.entries.get(id);
    if (!entry || entry.dying) return;
    const zombie = entry.zombie;
    zombie.playReplicatedAttack('attack');
    const dx = targetX - zombie.position.x;
    const dz = targetZ - zombie.position.z;
    const yaw = zombie.group.rotation.y;
    const scale = zombie.group.scale.x;
    zombie.visual.setAttackReach(Math.min(ZOMBIE_ATTACK_LUNGE, Math.max(0, Math.hypot(dx, dz) - 1.1)) / scale);
    zombie.visual.setStrikeTarget((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / scale,
      (targetY - 0.3 - zombie.position.y) / scale, (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / scale);
  }

  public hit(id: number, headshot: boolean, amount: number, fromX: number, fromZ: number): void {
    const entry = this.entries.get(id);
    if (entry && !entry.dying) entry.zombie.playReplicatedHit(amount, headshot, fromX, fromZ);
  }

  public kill(id: number): void {
    const entry = this.entries.get(id);
    if (!entry || entry.dying) return;
    entry.dying = true;
    this.removeColliders(entry.zombie);
    entry.zombie.playReplicatedDeath();
  }

  public update(dt: number): void {
    const renderTime = this.clock.renderTime;
    for (const entry of this.entries.values()) {
      const zombie = entry.zombie;
      if (!entry.dying && this.sampleInto(entry, renderTime)) {
        const from = this.bracket.from as ZombieSample;
        const to = this.bracket.to as ZombieSample;
        const alpha = this.bracket.alpha;
        zombie.position.set(
          from.x + (to.x - from.x) * alpha,
          from.y + (to.y - from.y) * alpha,
          from.z + (to.z - from.z) * alpha,
        );
        zombie.group.rotation.y = lerpAngle(from.yaw, to.yaw, alpha);
      }
      const travelled = Math.hypot(zombie.position.x - entry.lastX, zombie.position.z - entry.lastZ);
      entry.lastX = zombie.position.x;
      entry.lastZ = zombie.position.z;
      const speed = dt > 0 ? Math.min(MAX_VISUAL_SPEED, travelled / dt) : 0;
      zombie.update(dt, speed / Math.max(0.01, zombie.group.scale.x));
    }
  }

  public reset(): void {
    for (const entry of [...this.entries.values()]) this.release(entry.zombie);
    this.clock.reset();
  }

  private sampleInto(entry: ReplicaEntry, renderTime: number): boolean {
    return entry.samples.sample(renderTime, this.bracket) && this.bracket.from !== null && this.bracket.to !== null;
  }

  private replicateState(entry: ReplicaEntry, state: ZombieNetState): void {
    const zombie = entry.zombie;
    if (state.state === 'death') {
      this.kill(entry.id);
    } else if (state.state === 'barrierAttack' && zombie.state === 'walk') {
      zombie.playReplicatedAttack('barrierAttack');
    } else if (state.state === 'barrierBreak' && zombie.state === 'barrierAttack') {
      zombie.finishBarrierAttack();
    }
  }

  private create(state: ZombieNetState, rise: boolean): ReplicaEntry | null {
    const zombie = this.pool.acquire(ZOMBIE_TYPE_CONFIGS[state.type].modelId);
    if (!zombie) return null;
    zombie.group.scale.setScalar(state.scale);
    zombie.visual.setWalkPhase((state.id * 0.618034) % 1);
    zombie.spawn(state.x, state.z, state.maxHp, 1, state.y, state.floor, state.type);
    zombie.hp = state.hp;
    zombie.group.rotation.y = state.yaw;
    if (!rise) zombie.resumePursuit();
    this.colliders.push(zombie.torsoHitbox, zombie.headHitbox);
    const entry: ReplicaEntry = {
      id: state.id,
      zombie,
      samples: new SnapshotBuffer<ZombieSample>(SAMPLE_CAPACITY),
      dying: false,
      generation: this.generation,
      lastX: state.x,
      lastZ: state.z,
    };
    this.entries.set(state.id, entry);
    this.ids.set(zombie, state.id);
    return entry;
  }

  private release(zombie: Zombie): void {
    const id = this.ids.get(zombie);
    if (id !== undefined) this.entries.delete(id);
    this.ids.delete(zombie);
    this.removeColliders(zombie);
    zombie.state = 'death';
    zombie.group.visible = false;
    zombie.visual.setOpacity(1);
    this.pool.release(zombie);
  }

  private removeColliders(zombie: Zombie): void {
    for (const hitbox of [zombie.torsoHitbox, zombie.headHitbox]) {
      const index = this.colliders.indexOf(hitbox);
      if (index >= 0) this.colliders.splice(index, 1);
    }
  }
}
