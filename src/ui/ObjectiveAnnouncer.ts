/** One quest's entry in the HUD objective corner. */
export interface ObjectiveNote {
  /** Diegetic source of the quest (e.g. ПРОТОКОЛ 33); one note per kicker. */
  readonly kicker: string;
  /** The task itself: a different title under the same kicker is a new objective. */
  readonly title: string;
  /** Live progress (bearing, clock, checklist), one item per line; never re-announced. */
  readonly details: string;
}

/**
 * Decides which objective deserves the HUD spotlight: a note is announced
 * once per title of its kicker, one per call, so simultaneous objectives
 * queue up. Hidden notes (pause, intro, downed) keep their record until
 * `reset()` starts a new run.
 */
export class ObjectiveAnnouncer {
  /** Last title announced for each kicker. */
  private readonly announced = new Map<string, string>();

  /** Marks and returns the first note not yet announced, or null. */
  public next(notes: readonly ObjectiveNote[]): ObjectiveNote | null {
    for (const note of notes) {
      if (this.announced.get(note.kicker) === note.title) continue;
      this.announced.set(note.kicker, note.title);
      return note;
    }
    return null;
  }

  public reset(): void {
    this.announced.clear();
  }
}
