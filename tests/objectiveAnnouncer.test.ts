import { describe, expect, it } from 'vitest';
import { ObjectiveAnnouncer, type ObjectiveNote } from '../src/ui/ObjectiveAnnouncer';

const note = (kicker: string, title: string, details = ''): ObjectiveNote => ({ kicker, title, details });

describe('ObjectiveAnnouncer', () => {
  it('announces a note the first time its objective appears', () => {
    const announcer = new ObjectiveAnnouncer();
    const crystal = note('ФАКЕЛ-33', 'Hunt the carrier', '↑ 4 m');
    expect(announcer.next([crystal])).toBe(crystal);
    expect(announcer.next([crystal])).toBeNull();
  });

  it('ignores live progress: details changing under the same title never re-announce', () => {
    const announcer = new ObjectiveAnnouncer();
    announcer.next([note('ФАКЕЛ-33', 'Hunt the carrier', '↑ 4 m')]);
    expect(announcer.next([note('ФАКЕЛ-33', 'Hunt the carrier', '↗ 12 m')])).toBeNull();
  });

  it('announces a new title under the same kicker as a new objective', () => {
    const announcer = new ObjectiveAnnouncer();
    announcer.next([note('ФАКЕЛ-33', 'Wait for the carrier')]);
    const hunt = note('ФАКЕЛ-33', 'Hunt the carrier');
    expect(announcer.next([hunt])).toBe(hunt);
  });

  it('announces simultaneous objectives one per call, in order', () => {
    const announcer = new ObjectiveAnnouncer();
    const crystal = note('ФАКЕЛ-33', 'Hunt the carrier');
    const protocol = note('ПРОТОКОЛ 33', 'Restore the systems');
    expect(announcer.next([crystal, protocol])).toBe(crystal);
    expect(announcer.next([crystal, protocol])).toBe(protocol);
    expect(announcer.next([crystal, protocol])).toBeNull();
  });

  it('keeps what it announced while the notes are hidden, so a pause does not repeat them', () => {
    const announcer = new ObjectiveAnnouncer();
    const crystal = note('ФАКЕЛ-33', 'Hunt the carrier');
    announcer.next([crystal]);
    expect(announcer.next([])).toBeNull();
    expect(announcer.next([crystal])).toBeNull();
  });

  it('never announces a note that vanished before its turn', () => {
    const announcer = new ObjectiveAnnouncer();
    const crystal = note('ФАКЕЛ-33', 'Hunt the carrier');
    announcer.next([crystal, note('ПРОТОКОЛ 33', 'Restore the systems')]);
    expect(announcer.next([crystal])).toBeNull();
  });

  it('announces everything again after a reset (a new run)', () => {
    const announcer = new ObjectiveAnnouncer();
    const crystal = note('ФАКЕЛ-33', 'Hunt the carrier');
    announcer.next([crystal]);
    announcer.reset();
    expect(announcer.next([crystal])).toBe(crystal);
  });
});
