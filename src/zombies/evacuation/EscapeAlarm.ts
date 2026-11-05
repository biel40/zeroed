/** How an escape's alarms repeat while its clock runs. */
export interface EscapeAlarmTuning {
  /** Seconds between siren cycles: shorter than one cycle, so the wail never stops. */
  readonly sirenEvery: number;
  /** Seconds between intercom announcements. */
  readonly announceEvery: number;
  /** Seconds left on the clock when the klaxon joins in. */
  readonly klaxonFrom: number;
  /** Seconds between klaxon blasts as it joins in and at zero. */
  readonly klaxonInterval: { readonly slowest: number; readonly fastest: number };
}

export const ESCAPE_ALARM: EscapeAlarmTuning = {
  sirenEvery: 8,
  announceEvery: 15,
  klaxonFrom: 25,
  klaxonInterval: { slowest: 1.4, fastest: 0.35 },
};

/** Which alarms sound this frame. */
export interface EscapeAlarmCues {
  siren: boolean;
  announcement: boolean;
  klaxon: boolean;
}

/**
 * The alarms of an escape against the clock: the siren wailing on, the
 * intercom repeating its order and, in the last stretch, a klaxon that
 * quickens towards zero. Pure and deterministic: each frame it says in
 * `due` which cues are owed; the caller plays them.
 */
export class EscapeAlarm {
  /** Cues owed this frame, rewritten by every `update`. */
  public readonly due: EscapeAlarmCues = { siren: false, announcement: false, klaxon: false };
  private running = false;
  private sirenTimer = 0;
  private announceTimer = 0;
  private klaxonTimer = 0;

  public constructor(private readonly tuning: EscapeAlarmTuning) {}

  public get isRunning(): boolean {
    return this.running;
  }

  /** The exit opened: the siren and the intercom sound at once. */
  public start(): void {
    this.running = true;
    this.sirenTimer = 0;
    this.announceTimer = 0;
    this.klaxonTimer = 0;
  }

  /** `remaining`: seconds left on the escape clock. */
  public update(dt: number, remaining: number): void {
    this.due.siren = false;
    this.due.announcement = false;
    this.due.klaxon = false;
    if (!this.running) return;
    const step = Math.max(0, dt);
    this.sirenTimer -= step;
    if (this.sirenTimer <= 0) {
      this.due.siren = true;
      this.sirenTimer = Math.max(this.sirenTimer + this.tuning.sirenEvery, 0);
    }
    this.announceTimer -= step;
    if (this.announceTimer <= 0) {
      this.due.announcement = true;
      this.announceTimer = Math.max(this.announceTimer + this.tuning.announceEvery, 0);
    }
    if (remaining <= 0 || remaining > this.tuning.klaxonFrom) return;
    this.klaxonTimer -= step;
    if (this.klaxonTimer > 0) return;
    this.due.klaxon = true;
    this.klaxonTimer = this.klaxonInterval(remaining);
  }

  /** Seconds to the next klaxon blast with `remaining` on the clock. */
  public klaxonInterval(remaining: number): number {
    const { klaxonFrom, klaxonInterval } = this.tuning;
    const share = Math.min(1, Math.max(0, remaining / klaxonFrom));
    return klaxonInterval.fastest + (klaxonInterval.slowest - klaxonInterval.fastest) * share;
  }

  /** The escape ended: silence. */
  public stop(): void {
    this.running = false;
    this.due.siren = false;
    this.due.announcement = false;
    this.due.klaxon = false;
  }

  public reset(): void {
    this.stop();
    this.sirenTimer = 0;
    this.announceTimer = 0;
    this.klaxonTimer = 0;
  }
}
