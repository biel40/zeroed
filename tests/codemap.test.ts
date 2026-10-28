import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';

const run = (...args: string[]) => spawnSync(process.execPath, ['scripts/codemap.mjs', ...args], { encoding: 'utf8' });

describe('codemap CLI', () => {
  it('filters by area and literal symbol together', () => {
    const result = run('--area', 'src/weapons', '--query', 'weapondefinition');
    expect(result.status).toBe(0);
    expect(result.stdout.toLowerCase()).toContain('weapondefinition');
    expect(result.stdout).not.toContain('## Tree');
    expect(result.stdout).not.toContain('### src/zombies/');
  });
  it('finds paths case insensitively', () => {
    expect(run('--query', 'ZOMBIEARENA.TS').stdout).toContain('src/zombies/maps/ZombieArena.ts');
  });
  it('reports invalid arguments and empty searches', () => {
    for (const args of [['--bad'], ['--area'], ['--area', '../'], ['--query', 'no-such-symbol-987654']]) {
      const result = run(...args);
      expect(result.status).not.toBe(0);
      expect(result.stderr.trim()).not.toBe('');
    }
  });
});
