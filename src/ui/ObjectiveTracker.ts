import { ObjectiveAnnouncer, type ObjectiveNote } from './ObjectiveAnnouncer';

/** How long a new objective holds the spotlight before docking. */
const SPOTLIGHT_HOLD_MS = 4500;
/** Flight from the spotlight into its corner note; matches `.docking` in style.css. */
const SPOTLIGHT_DOCK_MS = 1200;
/** Fade of a spotlight or corner note whose objective ends; matches `.leaving` in style.css. */
const LEAVE_MS = 700;

type SpotlightPhase = 'idle' | 'waiting' | 'showing' | 'docking' | 'leaving';

/** The elements showing one `ObjectiveNote`: a corner note or the spotlight card. */
export interface ObjectiveNoteElements {
  readonly root: HTMLElement;
  readonly kicker: HTMLElement;
  readonly title: HTMLElement;
  readonly details: HTMLElement;
}

function writeText(element: HTMLElement, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

/**
 * HUD objective corner: the persistent notes at the top left and, when the
 * `ObjectiveAnnouncer` reports a new objective, a large spotlight card that
 * holds for a moment and then flies into its corner note. The spotlight never
 * shares the screen with the round banner: it waits for one to clear, and one
 * that appears during its hold sends it to its corner at once. An objective that
 * ends fades away instead of vanishing; a new run (`reset`) clears at once.
 */
export class ObjectiveTracker {
  private readonly announcer = new ObjectiveAnnouncer();
  private readonly notes: ObjectiveNoteElements[] = [];
  private readonly spotlight: HTMLElement;
  private phase: SpotlightPhase = 'idle';
  /** Kicker of the note in the spotlight; its corner note stays hidden until it docks. */
  private spotlightKicker: string | null = null;
  private timer = 0;
  /** Copies of ended corner notes fading where they stood, with their removal timers. */
  private readonly leavingNotes = new Map<HTMLElement, number>();

  public constructor(
    private readonly corner: HTMLElement,
    private readonly spotlightNote: ObjectiveNoteElements,
    /** Milliseconds until the round banner clears (0 when none shows). */
    private readonly bannerRemainingMs: () => number,
  ) {
    this.spotlight = spotlightNote.root;
  }

  /** Called every frame: null (or empty) hides the corner without forgetting what was announced. */
  public update(notes: readonly ObjectiveNote[] | null, urgent: boolean): void {
    const visible = notes !== null && notes.length > 0;
    this.corner.classList.toggle('hidden', !visible);
    this.corner.classList.toggle('urgent', visible && urgent);
    if (!visible) {
      this.cancelSpotlight();
      return;
    }
    if (this.phase === 'idle' || this.phase === 'leaving') this.announce(notes);
    let spotlit: ObjectiveNote | null = null;
    for (let index = 0; index < notes.length; index++) {
      const note = notes[index];
      const element = this.noteAt(index);
      this.leaveIfEnded(element, notes);
      element.root.classList.remove('hidden');
      element.root.classList.toggle('awaiting', note.kicker === this.spotlightKicker && this.phase !== 'docking');
      this.render(element, note);
      if (note.kicker === this.spotlightKicker) spotlit = note;
    }
    for (let index = notes.length; index < this.notes.length; index++) {
      this.leaveIfEnded(this.notes[index], notes);
      this.notes[index].root.classList.add('hidden');
    }
    if (this.phase === 'idle' || this.phase === 'leaving') return;
    if (spotlit === null) {
      this.cancelSpotlight();
      return;
    }
    this.spotlight.classList.toggle('urgent', urgent);
    this.render(this.spotlightNote, spotlit);
    if (this.phase === 'showing' && this.bannerRemainingMs() > 0) this.dockSpotlight();
  }

  /** A new run: hides everything and announces every objective again. */
  public reset(): void {
    this.announcer.reset();
    this.update(null, false);
    this.stopSpotlight();
    for (const [copy, timer] of this.leavingNotes) {
      clearTimeout(timer);
      copy.remove();
    }
    this.leavingNotes.clear();
    for (const note of this.notes) note.root.classList.add('hidden');
  }

  private announce(notes: readonly ObjectiveNote[]): void {
    const fresh = this.announcer.next(notes);
    if (fresh === null) return;
    // A spotlight still fading out finishes before the new one enters.
    const delay = this.phase === 'leaving' ? Math.max(this.bannerRemainingMs(), LEAVE_MS) : this.bannerRemainingMs();
    clearTimeout(this.timer);
    this.spotlightKicker = fresh.kicker;
    this.phase = 'waiting';
    this.timer = window.setTimeout(() => this.showSpotlight(), delay);
  }

  private showSpotlight(): void {
    // A banner that began after the announcement keeps the card waiting.
    const bannerMs = this.bannerRemainingMs();
    if (bannerMs > 0) {
      this.timer = window.setTimeout(() => this.showSpotlight(), bannerMs);
      return;
    }
    this.phase = 'showing';
    this.spotlight.style.removeProperty('transform');
    this.spotlight.classList.remove('hidden', 'docking', 'leaving');
    // Reflow so the entrance replays on back-to-back objectives.
    void this.spotlight.offsetWidth;
    this.spotlight.classList.add('entering');
    this.timer = window.setTimeout(() => this.dockSpotlight(), SPOTLIGHT_HOLD_MS);
  }

  /**
   * Flies the card onto the rectangle of its corner note, shrinking to fit
   * inside it, while the note fades in underneath (see `.docking` in style.css).
   */
  private dockSpotlight(): void {
    // Docking early on a banner cuts the hold short.
    clearTimeout(this.timer);
    const target = this.notes.find((note) => note.kicker.textContent === this.spotlightKicker && !note.root.classList.contains('hidden'));
    if (!target) {
      this.cancelSpotlight();
      return;
    }
    this.phase = 'docking';
    const from = this.spotlight.getBoundingClientRect();
    const to = target.root.getBoundingClientRect();
    const scale = Math.min(1, to.width / Math.max(1, from.width), to.height / Math.max(1, from.height));
    target.root.classList.remove('awaiting');
    this.spotlight.classList.remove('entering');
    this.spotlight.classList.add('docking');
    this.spotlight.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${scale})`;
    this.timer = window.setTimeout(() => this.finishSpotlight(target), SPOTLIGHT_DOCK_MS);
  }

  private finishSpotlight(target: ObjectiveNoteElements): void {
    this.cancelSpotlight();
    target.root.classList.remove('arrived');
    void target.root.offsetWidth;
    target.root.classList.add('arrived');
  }

  /** Ends the spotlight: a card on show fades away, anything else hides at once. */
  private cancelSpotlight(): void {
    if (this.phase === 'leaving') return;
    if (this.phase !== 'showing') {
      this.stopSpotlight();
      return;
    }
    clearTimeout(this.timer);
    this.phase = 'leaving';
    this.releaseSpotlitNote();
    this.spotlight.classList.remove('entering');
    this.spotlight.classList.add('leaving');
    this.timer = window.setTimeout(() => this.stopSpotlight(), LEAVE_MS);
  }

  private stopSpotlight(): void {
    clearTimeout(this.timer);
    this.phase = 'idle';
    this.releaseSpotlitNote();
    this.spotlight.classList.add('hidden');
    this.spotlight.classList.remove('entering', 'docking', 'leaving');
    this.spotlight.style.removeProperty('transform');
  }

  private releaseSpotlitNote(): void {
    this.spotlightKicker = null;
    for (const note of this.notes) note.root.classList.remove('awaiting');
  }

  /**
   * A shown corner note whose kicker is no longer listed leaves a copy fading
   * in its place, so the element can take the next note's content at once.
   */
  private leaveIfEnded(element: ObjectiveNoteElements, notes: readonly ObjectiveNote[]): void {
    const root = element.root;
    if (root.classList.contains('hidden') || root.classList.contains('awaiting')) return;
    const kicker = element.kicker.textContent;
    for (const note of notes) if (note.kicker === kicker) return;
    const copy = root.cloneNode(true) as HTMLElement;
    copy.classList.remove('arrived');
    copy.classList.add('leaving');
    root.before(copy);
    this.leavingNotes.set(copy, window.setTimeout(() => {
      this.leavingNotes.delete(copy);
      copy.remove();
    }, LEAVE_MS));
  }

  private render(element: ObjectiveNoteElements, note: ObjectiveNote): void {
    writeText(element.kicker, note.kicker);
    writeText(element.title, note.title);
    writeText(element.details, note.details);
    element.details.classList.toggle('hidden', note.details === '');
  }

  /** The corner note at `index`, built on first use (one per quest). */
  private noteAt(index: number): ObjectiveNoteElements {
    while (this.notes.length <= index) {
      const part = (className: string): HTMLElement => {
        const element = document.createElement('div');
        element.className = className;
        return element;
      };
      const note = {
        root: part('objective-note'),
        kicker: part('objective-note-kicker'),
        title: part('objective-note-title'),
        details: part('objective-note-details'),
      };
      note.root.append(note.kicker, note.title, note.details);
      this.corner.append(note.root);
      this.notes.push(note);
    }
    return this.notes[index];
  }
}
