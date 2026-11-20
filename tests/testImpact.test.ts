import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error The Node CLI helper is an ES module without TypeScript declarations.
import { readDevelopmentChanges, readFeatureChanges, readWorkingState, requiresFullValidation } from '../scripts/test-impact-state.mjs';

const weapon = 'src/weapons/BarrettAttachments.ts';
const combat = 'src/shooting/trajectory.ts';
const ui = 'src/ui/ConfirmDialog.ts';
const removed = 'src/ui/Obsolete.ts';
const existingTest = 'tests/confirmDialog.test.ts';
const newTest = 'tests/impact selección.test.ts';
const highImpact = [
  'cloudflare/api/migrations/0001.sql',
  'index.html',
  'package-lock.json',
  'public/assets/zombies/zombie_walker.glb',
  'src/core/Game.ts',
  'src/main.ts',
  'src/style.css',
  'tests/setup.ts',
  'unclassified.config',
  'vite.config.ts',
];

function git(root: string, ...args: string[]): string {
  return execFileSync('git', [
    '-C', root,
    '-c', 'core.autocrlf=false',
    '-c', 'core.fsmonitor=false',
    '-c', 'commit.gpgSign=false',
    '-c', 'user.name=Zeroed Test',
    '-c', 'user.email=test@example.invalid',
    ...args,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function write(root: string, path: string, contents: string): void {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

describe('test impact state', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'zeroed-test-impact-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('selects committed and working changes against a checkpoint or the main merge base', () => {
    git(root, 'init', '--quiet', '--template=', '--initial-branch=main');
    for (const path of [weapon, combat, ui, removed, existingTest]) write(root, path, 'original\n');
    write(root, '.gitignore', 'ignored.txt\n');
    git(root, 'add', '.');
    git(root, 'commit', '--quiet', '-m', 'Initial state');
    const clean = readWorkingState(root);
    git(root, 'branch', 'feature');
    write(root, 'docs/main-only.md', 'Main moved after the feature branched.\n');
    git(root, 'add', '--', 'docs/main-only.md');
    git(root, 'commit', '--quiet', '-m', 'Advance main');
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(root, 'switch', '--quiet', 'feature');
    write(root, weapon, 'modified\n');
    git(root, 'commit', '--quiet', '-am', 'Change isolated weapon');
    const committed = readWorkingState(root);
    expect(readDevelopmentChanges(root, clean, committed)).toEqual([weapon]);

    write(root, combat, 'modified\n');
    git(root, 'add', '--', combat);
    write(root, ui, 'modified\n');
    write(root, existingTest, 'modified\n');
    write(root, newTest, 'new test\n');
    write(root, 'ignored.txt', 'ignored\n');
    const edits = [combat, ui, existingTest, newTest];
    const changed = readWorkingState(root);
    expect(readDevelopmentChanges(root, committed, changed).sort()).toEqual([...edits].sort());
    expect(readDevelopmentChanges(root, changed, readWorkingState(root))).toEqual([]);

    const feature = readFeatureChanges(root);
    expect(feature.base).toBe(clean.head);
    expect(feature.files.sort()).toEqual([weapon, ...edits].sort());

    git(root, 'commit', '--quiet', '-m', 'Commit already validated combat content');
    const afterCommit = readWorkingState(root);
    expect(readDevelopmentChanges(root, changed, afterCommit)).toEqual([]);

    write(root, ui, 'original\n');
    rmSync(join(root, removed));
    const revertedAndRemoved = readDevelopmentChanges(root, afterCommit, readWorkingState(root));
    expect(revertedAndRemoved.sort()).toEqual([ui, removed].sort());
    expect(requiresFullValidation(root, revertedAndRemoved)).toBe(true);

    git(root, 'branch', '-D', 'main');
    git(root, 'update-ref', '-d', 'refs/remotes/origin/main');
    expect(() => readFeatureChanges(root)).toThrow();
  });

  it('runs full validation for core code, test setup, runtime assets and unknown files', () => {
    for (const path of [weapon, combat, ui, newTest, ...highImpact]) write(root, path, 'example\n');
    expect(requiresFullValidation(root, [weapon, combat, ui, newTest])).toBe(false);
    for (const path of highImpact) expect(requiresFullValidation(root, [path]), path).toBe(true);
  });
});
