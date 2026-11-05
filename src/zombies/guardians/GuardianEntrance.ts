/** Beats of a guardian's filmed entrance, in seconds from the player waking it. */
export interface GuardianEntranceBeats {
  /** It roars on its perch. */
  readonly roarAt: number;
  /** It leaps in; the landing follows the guardian's own arrival time. */
  readonly leapAt: number;
  /** The camera goes back to the player and the fight starts. */
  readonly duration: number;
}

/** Which beats are reached this frame. */
export interface GuardianEntranceCues {
  roar: boolean;
  leap: boolean;
  finished: boolean;
}

/**
 * The clock of a guardian's filmed entrance, which holds the run while it
 * plays. Pure and deterministic: each frame `due` says which beats were
 * just reached (each once per entrance); the caller presents them.
 */
export class GuardianEntrance {
  /** Beats reached this frame, rewritten by every `update`. */
  public readonly due: GuardianEntranceCues = { roar: false, leap: false, finished: false };
  /** Seconds since `start`, or null while it has not started. */
  private elapsed: number | null = null;

  public constructor(private readonly beats: GuardianEntranceBeats) {
    if (!(beats.roarAt > 0 && beats.leapAt > 0 && beats.roarAt < beats.duration && beats.leapAt < beats.duration)) {
      throw new Error('Every beat of a guardian entrance must fall inside it');
    }
  }

  public get playing(): boolean {
    return this.elapsed !== null && this.elapsed < this.beats.duration;
  }

  /** Seconds since `start`. */
  public get time(): number {
    return this.elapsed ?? 0;
  }

  public start(): void {
    this.elapsed = 0;
    this.clearDue();
  }

  public update(dt: number): void {
    this.clearDue();
    if (!this.playing) return;
    const before = this.time;
    const after = Math.min(this.beats.duration, before + Math.max(0, dt));
    this.elapsed = after;
    this.due.roar = before < this.beats.roarAt && after >= this.beats.roarAt;
    this.due.leap = before < this.beats.leapAt && after >= this.beats.leapAt;
    this.due.finished = after >= this.beats.duration;
  }

  public reset(): void {
    this.elapsed = null;
    this.clearDue();
  }

  private clearDue(): void {
    this.due.roar = false;
    this.due.leap = false;
    this.due.finished = false;
  }
}
