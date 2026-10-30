export type RoundCueKind = 'start' | 'end';

/**
 * Lets each round-transition cue play once per round. Single player reads
 * the RoundManager events and the co-op guest reads host messages; a
 * repeated or late event must never stack a second sting.
 */
export class RoundCueGate {
  private lastStart = 0;
  private lastEnd = 0;

  /** True the first time `kind` is claimed for a round newer than the last one. */
  public claim(kind: RoundCueKind, round: number): boolean {
    const last = kind === 'start' ? this.lastStart : this.lastEnd;
    if (round <= last) return false;
    if (kind === 'start') this.lastStart = round;
    else this.lastEnd = round;
    return true;
  }

  /** A restarted match counts rounds from one again. */
  public reset(): void {
    this.lastStart = 0;
    this.lastEnd = 0;
  }
}
