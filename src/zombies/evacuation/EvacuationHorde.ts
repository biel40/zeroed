import { MAX_ALIVE } from '../ZombieConfig';

/** How an evacuation's horde builds up: from its opening pressure to its peak. */
export interface EvacuationHordeTuning {
  /** Seconds from the start for the pressure to reach its peak. */
  readonly rampSeconds: number;
  /** Seconds between spawns for one player, at the start and at the peak. */
  readonly interval: { readonly start: number; readonly end: number };
  /** Simultaneous zombies for one player in round 1, at the start and at the peak. */
  readonly alive: { readonly start: number; readonly end: number };
  /** Extra simultaneous zombies per round past the first. */
  readonly alivePerRound: number;
  /** Extra simultaneous zombies per player past the first. */
  readonly alivePerExtraPlayer: number;
  /** Each player past the first shortens the interval by this share. */
  readonly ratePerExtraPlayer: number;
  /** Hard cap on simultaneous zombies, lower on reduced-effects devices. */
  readonly cap: { readonly full: number; readonly reduced: number };
}

export const EVACUATION_HORDE: EvacuationHordeTuning = {
  rampSeconds: 150,
  interval: { start: 2.6, end: 0.85 },
  alive: { start: 8, end: 17 },
  alivePerRound: 0.25,
  alivePerExtraPlayer: 3,
  ratePerExtraPlayer: 0.35,
  cap: { full: Math.min(20, MAX_ALIVE), reduced: 14 },
};

/**
 * Spawn cadence of an evacuation, which replaces the rounds while it runs.
 * Pure and deterministic: it says how many zombies are due this frame; the
 * caller spawns them (with the current round's stats) and hands back any it
 * could not place.
 */
export class EvacuationHorde {
  private running = false;
  private elapsed = 0;
  private timer = 0;
  private round = 1;
  private players = 1;

  public constructor(
    private readonly tuning: EvacuationHordeTuning,
    private readonly reducedEffects: boolean,
  ) {}

  public get isRunning(): boolean {
    return this.running;
  }

  /** Simultaneous zombies allowed right now. */
  public get aliveCap(): number {
    const { alive, alivePerRound, alivePerExtraPlayer, cap } = this.tuning;
    const base = alive.start + (alive.end - alive.start) * this.pressure();
    const scaled = base + alivePerRound * (this.round - 1) + alivePerExtraPlayer * (this.players - 1);
    return Math.min(this.reducedEffects ? cap.reduced : cap.full, Math.round(scaled));
  }

  /** Seconds between spawns right now. */
  public get spawnInterval(): number {
    const { interval, ratePerExtraPlayer } = this.tuning;
    const base = interval.start + (interval.end - interval.start) * this.pressure();
    return base / (1 + ratePerExtraPlayer * (this.players - 1));
  }

  /** Starts the cadence for the run's current round and player count; the first spawn is immediate. */
  public start(round: number, players: number): void {
    this.running = true;
    this.elapsed = 0;
    this.timer = 0;
    this.round = Math.max(1, Math.floor(round));
    this.players = Math.max(1, Math.floor(players));
  }

  /** Spawns due this frame, never past the alive cap and never banked while full. */
  public update(dt: number, aliveCount: number): number {
    if (!this.running) return 0;
    const step = Math.max(0, dt);
    this.elapsed += step;
    this.timer -= step;
    const cap = this.aliveCap;
    let due = 0;
    while (this.timer <= 0 && aliveCount + due < cap) {
      due++;
      this.timer += this.spawnInterval;
    }
    this.timer = Math.max(0, this.timer);
    return due;
  }

  /** A due spawn found no free body or spawn point: try again next frame. */
  public requeue(): void {
    this.timer = 0;
  }

  public stop(): void {
    this.running = false;
  }

  public reset(): void {
    this.running = false;
    this.elapsed = 0;
    this.timer = 0;
    this.round = 1;
    this.players = 1;
  }

  private pressure(): number {
    return Math.min(1, this.elapsed / this.tuning.rampSeconds);
  }
}
