import { describe, expect, it } from 'vitest';
import { DeveloperCommand } from '../src/game/DeveloperCommand';

describe('DeveloperCommand', () => {
  it('activates only after MOTDRULES is entered in order', () => {
    const command = new DeveloperCommand('MOTDRULES');

    for (const key of 'motdrule') {
      expect(command.push(key)).toBe(false);
    }
    expect(command.push('s')).toBe(true);
  });

  it('resets after a wrong key and can recognize a later complete command', () => {
    const command = new DeveloperCommand('MOTDRULES');

    for (const key of 'MOTDXMOTDRULE') {
      expect(command.push(key)).toBe(false);
    }
    expect(command.push('S')).toBe(true);
  });

  it('ignores non-character keys without losing partial progress', () => {
    const command = new DeveloperCommand('MOTDRULES');

    for (const key of ['M', 'O', 'Shift', 'T', 'D', 'R', 'U', 'L', 'E']) {
      expect(command.push(key)).toBe(false);
    }
    expect(command.push('S')).toBe(true);
  });

  it('can discard partial progress when a run resets', () => {
    const command = new DeveloperCommand('MOTDRULES');
    for (const key of 'MOTD') command.push(key);

    command.reset();

    for (const key of 'RULES') expect(command.push(key)).toBe(false);
  });
});
