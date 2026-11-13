import * as THREE from 'three';
import type { CaptainUssrField, GuardianDuelPhase } from './CaptainUssrBrain';
import { CaptainUssrPuffs, PUFF_STYLES } from './CaptainUssrPuffs';
import { ElectricArcs } from './ElectricArcs';

/**
 * How often the duel's ground spits electricity (seconds between, shortest
 * and longest), by phase: sparks and smoke from Containment Protocol, bolts
 * to the ground in LAST ORDER. `inset`: metres in from the field's edge;
 * `height`: where a bolt or a shower starts over the ground.
 */
export const GUARDIAN_DISCHARGES = {
  every: { 2: [3.5, 7], 3: [1.6, 3.4] },
  inset: 0.9,
  height: { spark: [1.8, 3], bolt: [3.4, 4.6] },
} as const;

/** This frame's discharge, for the mode to make heard: how strong (0 when none) and where. */
export interface GuardianDischargeCue {
  strength: number;
  readonly at: THREE.Vector3;
}

/**
 * The emergency around a guardian's duel: from Containment Protocol, now
 * and then a shower of sparks and a wisp of smoke along the field's edge;
 * in LAST ORDER, bolts of electricity striking the ground there instead.
 * Never within the field's middle, where the fight is. The injected
 * `random` places and times them; `cue` reports each for its sound.
 */
export class GuardianDuelDischarges {
  public readonly group = new THREE.Group();
  public readonly cue: GuardianDischargeCue = { strength: 0, at: new THREE.Vector3() };
  private readonly arcs: ElectricArcs;
  private readonly puffs: CaptainUssrPuffs;
  private readonly from = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private timer = 0;
  private phase: GuardianDuelPhase = 0;

  public constructor(
    private readonly field: CaptainUssrField,
    private readonly groundY: number,
    private readonly random: () => number,
    fullEffects: boolean,
  ) {
    this.group.name = 'guardian-duel-discharges';
    this.arcs = new ElectricArcs(fullEffects ? 4 : 2, random);
    this.puffs = new CaptainUssrPuffs(fullEffects ? 40 : 16);
    this.group.add(this.arcs.group, this.puffs.group);
  }

  public update(dt: number, phase: GuardianDuelPhase): void {
    const step = Math.max(0, dt);
    this.cue.strength = 0;
    if (phase !== this.phase) {
      this.phase = phase;
      this.timer = this.interval();
    }
    this.arcs.update(step);
    this.puffs.update(step);
    if (phase < 2) return;
    this.timer -= step;
    if (this.timer > 0) return;
    this.timer = this.interval();
    this.discharge(phase === 3);
  }

  public reset(): void {
    this.phase = 0;
    this.timer = 0;
    this.cue.strength = 0;
    this.arcs.reset();
    this.puffs.reset();
  }

  public dispose(): void {
    this.arcs.dispose();
    this.puffs.dispose();
    this.group.removeFromParent();
  }

  /** Seconds to the next discharge in the current phase. */
  private interval(): number {
    if (this.phase < 2) return 0;
    const [shortest, longest] = GUARDIAN_DISCHARGES.every[this.phase as 2 | 3];
    return shortest + (longest - shortest) * this.random();
  }

  /** A shower of sparks at a point on the field's edge; in LAST ORDER, a bolt down to the ground there. */
  private discharge(bolt: boolean): void {
    this.pointOnEdge(this.cue.at);
    const [low, high] = GUARDIAN_DISCHARGES.height[bolt ? 'bolt' : 'spark'];
    this.from.set(this.cue.at.x, this.groundY + low + (high - low) * this.random(), this.cue.at.z);
    if (bolt) {
      this.arcs.strike(this.from, this.cue.at, 0.22, 0.45);
      this.arcs.strike(this.from, this.cue.at, 0.16, 0.6);
    }
    const sparksAt = bolt ? this.cue.at : this.from;
    const sparks = bolt ? 10 : 7;
    for (let spark = 0; spark < sparks; spark++) {
      const angle = this.random() * Math.PI * 2;
      const speed = 1 + 2.2 * this.random();
      this.velocity.set(Math.cos(angle) * speed, 1 + 2 * this.random(), Math.sin(angle) * speed);
      this.puffs.emit(sparksAt, this.velocity, PUFF_STYLES.spark);
    }
    this.puffs.emit(sparksAt, this.velocity.set(0, 0.4, 0), PUFF_STYLES.smoke, bolt ? 1.6 : 1.1);
    this.cue.strength = bolt ? 1 : 0.45;
  }

  /** A random point along one of the field's four edges, `inset` in, on the ground. */
  private pointOnEdge(out: THREE.Vector3): void {
    const { bounds } = this.field;
    const { inset } = GUARDIAN_DISCHARGES;
    const minX = bounds.minX + inset;
    const maxX = bounds.maxX - inset;
    const minZ = bounds.minZ + inset;
    const maxZ = bounds.maxZ - inset;
    const side = Math.floor(this.random() * 4);
    const along = this.random();
    const x = side < 2 ? minX + (maxX - minX) * along : side === 2 ? minX : maxX;
    const z = side < 2 ? (side === 0 ? minZ : maxZ) : minZ + (maxZ - minZ) * along;
    out.set(x, this.groundY, z);
  }
}
