/**
 * Stages of a map's evacuation easter egg: `locked` until the map's power
 * comes on, `exploration` while its auxiliary systems are restored,
 * `ready` for the paid start, `defending` while the exit unlocks, then
 * `escaping` against the clock until `completed` or `failed`.
 */
export type EvacuationStage = 'locked' | 'exploration' | 'ready' | 'defending' | 'escaping' | 'completed' | 'failed';

/** What a map asks of its evacuation. */
export interface EvacuationRules {
  /** Auxiliary systems to restore, each once, before the protocol can start. */
  readonly switchIds: readonly string[];
  /** Points the initiating player pays to start the protocol. */
  readonly cost: number;
  /** Seconds of defended unlocking, accumulated, that open the exit. */
  readonly defenseSeconds: number;
  /** Seconds from the exit opening to a failed evacuation. */
  readonly escapeSeconds: number;
}

export type EvacuationEvent =
  | { readonly type: 'switchThrown'; readonly switchId: string }
  | { readonly type: 'ready' }
  | { readonly type: 'initiated' }
  | { readonly type: 'defensePaused' }
  | { readonly type: 'defenseResumed' }
  | { readonly type: 'doorOpened' }
  | { readonly type: 'escapeFailed' }
  | { readonly type: 'extracted' };

/**
 * Pure state machine of an evacuation easter egg. It knows nothing about
 * points, players or Three.js: the caller charges the cost, tells it each
 * frame whether anyone defends the controls, and drains `pendingEvents`
 * to present what happened. Every transition happens at most once per run.
 */
export class EvacuationProtocol {
  /** Events produced since the last `clearEvents()`. */
  public readonly pendingEvents: EvacuationEvent[] = [];
  private current: EvacuationStage = 'locked';
  private readonly thrown = new Set<string>();
  private wasBriefed = false;
  private defendedNow = true;
  private defenseElapsed = 0;
  private escapeLeft = 0;

  public constructor(public readonly rules: EvacuationRules) {}

  public get stage(): EvacuationStage {
    return this.current;
  }

  /** The control panel has told the players what it needs. */
  public get briefed(): boolean {
    return this.wasBriefed;
  }

  /** Defence or escape under way: the map's normal rounds wait. */
  public get active(): boolean {
    return this.current === 'defending' || this.current === 'escaping';
  }

  /** Someone defends the controls right now (meaningful while defending). */
  public get defended(): boolean {
    return this.defendedNow;
  }

  /** Accumulated unlocking, 0..1. */
  public get defenseProgress(): number {
    return this.defenseElapsed / this.rules.defenseSeconds;
  }

  /** Unlocking seconds still owed. */
  public get defenseRemaining(): number {
    return this.rules.defenseSeconds - this.defenseElapsed;
  }

  /** Seconds left to reach the extraction point. */
  public get escapeRemaining(): number {
    return this.escapeLeft;
  }

  public isSwitchThrown(id: string): boolean {
    return this.thrown.has(id);
  }

  /** The map's power came on: the auxiliary systems can be restored. */
  public powerRestored(): boolean {
    if (this.current !== 'locked') return false;
    this.current = 'exploration';
    return true;
  }

  /** Consulting the panel once the power is on; true the first time. */
  public brief(): boolean {
    if (this.current === 'locked' || this.wasBriefed) return false;
    this.wasBriefed = true;
    return true;
  }

  /** Restores one auxiliary system; the last one makes the protocol ready. */
  public throwSwitch(id: string): boolean {
    if (this.current !== 'exploration' || !this.rules.switchIds.includes(id) || this.thrown.has(id)) return false;
    this.thrown.add(id);
    this.wasBriefed = true;
    this.pendingEvents.push({ type: 'switchThrown', switchId: id });
    if (this.thrown.size === this.rules.switchIds.length) {
      this.current = 'ready';
      this.pendingEvents.push({ type: 'ready' });
    }
    return true;
  }

  /**
   * Starts the protocol, once per run. The caller checks the price first
   * and charges it only when this returns true, so it is paid exactly once.
   */
  public initiate(): boolean {
    if (this.current !== 'ready') return false;
    this.current = 'defending';
    this.defendedNow = true;
    this.defenseElapsed = 0;
    this.pendingEvents.push({ type: 'initiated' });
    return true;
  }

  /**
   * Unlocking advances only while `defended`; leaving pauses it without
   * losing what was done. Once open, the escape clock runs regardless.
   */
  public update(dt: number, defended: boolean): void {
    const step = Math.max(0, dt);
    if (this.current === 'defending') {
      if (defended !== this.defendedNow) {
        this.defendedNow = defended;
        this.pendingEvents.push({ type: defended ? 'defenseResumed' : 'defensePaused' });
      }
      if (!defended) return;
      this.defenseElapsed = Math.min(this.rules.defenseSeconds, this.defenseElapsed + step);
      if (this.defenseElapsed < this.rules.defenseSeconds) return;
      this.current = 'escaping';
      this.escapeLeft = this.rules.escapeSeconds;
      this.pendingEvents.push({ type: 'doorOpened' });
      return;
    }
    if (this.current !== 'escaping') return;
    this.escapeLeft = Math.max(0, this.escapeLeft - step);
    if (this.escapeLeft > 0) return;
    this.current = 'failed';
    this.pendingEvents.push({ type: 'escapeFailed' });
  }

  /** Everyone reached the extraction point in time. */
  public extract(): boolean {
    if (this.current !== 'escaping') return false;
    this.current = 'completed';
    this.pendingEvents.push({ type: 'extracted' });
    return true;
  }

  /**
   * Developer shortcut: from any unfinished stage straight to a successful
   * extraction, skipping power, switches, defence and escape. Once per run.
   */
  public skipToExtraction(): boolean {
    if (this.current === 'completed' || this.current === 'failed') return false;
    this.current = 'completed';
    this.pendingEvents.push({ type: 'extracted' });
    return true;
  }

  public clearEvents(): void {
    this.pendingEvents.length = 0;
  }

  /** New run: locked again, nothing restored, nothing paid. */
  public reset(): void {
    this.current = 'locked';
    this.thrown.clear();
    this.wasBriefed = false;
    this.defendedNow = true;
    this.defenseElapsed = 0;
    this.escapeLeft = 0;
    this.pendingEvents.length = 0;
  }
}
