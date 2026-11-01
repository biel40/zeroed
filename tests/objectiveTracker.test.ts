import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObjectiveNote } from '../src/ui/ObjectiveAnnouncer';
import { ObjectiveTracker, type ObjectiveNoteElements } from '../src/ui/ObjectiveTracker';

/** Only the DOM operations ObjectiveTracker uses. */
class FakeElement {
  public readonly classes = new Set<string>();
  public readonly children: FakeElement[] = [];
  public parent: FakeElement | null = null;
  public textContent = '';
  public readonly offsetWidth = 0;
  public readonly style = { transform: '', removeProperty: (): void => { this.style.transform = ''; } };
  public readonly classList = {
    add: (...names: string[]): void => { for (const name of names) this.classes.add(name); },
    remove: (...names: string[]): void => { for (const name of names) this.classes.delete(name); },
    toggle: (name: string, force?: boolean): void => {
      if (force ?? !this.classes.has(name)) this.classes.add(name);
      else this.classes.delete(name);
    },
    contains: (name: string): boolean => this.classes.has(name),
  };

  public set className(value: string) { this.classes.add(value); }

  public append(...nodes: FakeElement[]): void {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }

  public before(node: FakeElement): void {
    const parent = this.parent!;
    node.parent = parent;
    parent.children.splice(parent.children.indexOf(this), 0, node);
  }

  public remove(): void {
    this.parent?.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }

  public cloneNode(): FakeElement {
    const copy = new FakeElement();
    for (const name of this.classes) copy.classes.add(name);
    copy.textContent = this.textContent;
    copy.append(...this.children.map((child) => child.cloneNode()));
    return copy;
  }

  public getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 100, height: 20 };
  }
}

const crystal: ObjectiveNote = { kicker: 'CRYSTAL', title: 'Find it', details: '' };
const guardian: ObjectiveNote = { kicker: 'GUARDIAN', title: 'Kill it', details: '' };

function harness(): { tracker: ObjectiveTracker; corner: FakeElement; spotlight: FakeElement } {
  const corner = new FakeElement();
  const part = (): HTMLElement => new FakeElement() as unknown as HTMLElement;
  const spotlightNote: ObjectiveNoteElements = { root: part(), kicker: part(), title: part(), details: part() };
  const tracker = new ObjectiveTracker(corner as unknown as HTMLElement, spotlightNote, () => 0);
  return { tracker, corner, spotlight: spotlightNote.root as unknown as FakeElement };
}

/** Corner children still fading out. */
function leaving(corner: FakeElement): FakeElement[] {
  return corner.children.filter((child) => child.classes.has('leaving'));
}

describe('ObjectiveTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', { setTimeout: (handler: () => void, ms: number) => setTimeout(handler, ms) });
    vi.stubGlobal('document', { createElement: () => new FakeElement() });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('fades the spotlight out when its objective ends before docking', () => {
    const { tracker, spotlight } = harness();
    tracker.update([crystal], false);
    vi.advanceTimersByTime(0);
    expect(spotlight.classes.has('entering')).toBe(true);

    tracker.update([], false);
    expect(spotlight.classes.has('leaving')).toBe(true);
    expect(spotlight.classes.has('hidden')).toBe(false);
    vi.advanceTimersByTime(699);
    expect(spotlight.classes.has('hidden')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(spotlight.classes.has('hidden')).toBe(true);
    expect(spotlight.classes.has('leaving')).toBe(false);
  });

  it('keeps fading while the corner stays hidden frame after frame', () => {
    const { tracker, spotlight } = harness();
    tracker.update([crystal], false);
    vi.advanceTimersByTime(0);
    for (let frame = 0; frame < 20; frame++) {
      tracker.update(null, false);
      vi.advanceTimersByTime(16);
    }
    expect(spotlight.classes.has('hidden')).toBe(false);
    vi.advanceTimersByTime(380);
    expect(spotlight.classes.has('hidden')).toBe(true);
  });

  it('lets a new objective enter only after the previous spotlight has faded', () => {
    const { tracker, spotlight } = harness();
    tracker.update([crystal], false);
    vi.advanceTimersByTime(0);
    tracker.update([guardian], false);
    expect(spotlight.classes.has('leaving')).toBe(true);
    // The next frame announces the new objective.
    tracker.update([guardian], false);

    vi.advanceTimersByTime(699);
    expect(spotlight.classes.has('entering')).toBe(false);
    vi.advanceTimersByTime(1);
    expect(spotlight.classes.has('leaving')).toBe(false);
    expect(spotlight.classes.has('entering')).toBe(true);
    expect(spotlight.classes.has('hidden')).toBe(false);
  });

  it('fades an ended corner note in place while the next note takes its element', () => {
    const { tracker, corner } = harness();
    tracker.update([crystal, guardian], false);
    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(10_000);
    expect(leaving(corner)).toHaveLength(0);

    tracker.update([guardian], false);
    const [copy] = leaving(corner);
    expect(copy.children[0].textContent).toBe('CRYSTAL');
    expect(corner.children.indexOf(copy)).toBe(0);
    expect(corner.children[1].children[0].textContent).toBe('GUARDIAN');

    tracker.update([guardian], false);
    expect(leaving(corner)).toHaveLength(1);
    vi.advanceTimersByTime(700);
    expect(leaving(corner)).toHaveLength(0);
  });

  it('clears every fade at once on a new run', () => {
    const { tracker, corner, spotlight } = harness();
    tracker.update([crystal, guardian], false);
    vi.advanceTimersByTime(10_000);
    vi.advanceTimersByTime(10_000);
    tracker.update([guardian], false);
    vi.advanceTimersByTime(0);
    expect(spotlight.classes.has('hidden')).toBe(false);

    tracker.reset();
    expect(spotlight.classes.has('hidden')).toBe(true);
    expect(spotlight.classes.has('leaving')).toBe(false);
    expect(leaving(corner)).toHaveLength(0);

    tracker.update([crystal], false);
    expect(leaving(corner)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(1);
  });
});
