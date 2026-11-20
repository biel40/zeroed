import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function git(root, ...args) {
  return execFileSync('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function pathsFromGit(output) {
  if (output.includes('\uFFFD')) throw new Error('Git returned paths that could not be decoded reliably.');
  return output.split('\0').filter(Boolean);
}

function changedBetween(root, from, to) {
  if (from === to) return [];
  return pathsFromGit(git(root, 'diff', '--name-only', '-z', '--no-renames', from, to, '--'));
}

function workingPaths(root) {
  const entries = pathsFromGit(git(root, 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames'));
  return entries.map((entry) => {
    if (entry[2] !== ' ' || /^(DD|AU|UD|UA|DU|AA|UU)$/.test(entry.slice(0, 2))) {
      throw new Error('Git has unresolved changes or returned an unexpected status.');
    }
    return entry.slice(3);
  });
}

export function isDocumentation(path) {
  return /^(?:docs\/.+|README|AGENTS|ASSETS)\.md$/i.test(path);
}

function fingerprint(root, path) {
  const absolutePath = join(root, path);
  const stat = lstatSync(absolutePath, { throwIfNoEntry: false });
  if (!stat) return 'missing';
  if (!stat.isFile()) throw new Error(`Cannot track content changes to ${path}.`);
  return `${stat.mode}:${createHash('sha256').update(readFileSync(absolutePath)).digest('hex')}`;
}

export function readWorkingState(root) {
  const head = git(root, 'rev-parse', '--verify', 'HEAD').trim();
  const files = Object.fromEntries(workingPaths(root)
    .filter((path) => !isDocumentation(path))
    .map((path) => [path, fingerprint(root, path)]));
  return { head, files };
}

export function readDevelopmentChanges(root, previous, current) {
  const dirtyPaths = new Set([...Object.keys(previous.files), ...Object.keys(current.files)]);
  const changes = new Set(changedBetween(root, previous.head, current.head));
  for (const path of dirtyPaths) {
    // Staging or committing identical content should not invalidate a successful run.
    if (Object.hasOwn(previous.files, path) && previous.files[path] === (current.files[path] ?? fingerprint(root, path))) {
      changes.delete(path);
    } else {
      changes.add(path);
    }
  }
  return [...changes];
}

function mainReference(root) {
  for (const ref of ['refs/remotes/origin/main', 'refs/heads/main']) {
    try {
      return { ref, commit: git(root, 'rev-parse', '--verify', `${ref}^{commit}`).trim() };
    } catch (error) {
      if (error.status !== 128) throw error;
    }
  }
  throw new Error('Neither origin/main nor main is available.');
}

export function readFeatureChanges(root) {
  const head = git(root, 'rev-parse', '--verify', 'HEAD').trim();
  const { ref, commit } = mainReference(root);
  if (ref === 'refs/heads/main' && commit === head) {
    throw new Error('Local main matches HEAD and origin/main is unavailable.');
  }
  const bases = git(root, 'merge-base', '--all', commit, head).trim().split('\n');
  if (bases.length !== 1) throw new Error('Git returned multiple main merge bases.');
  const [base] = bases;
  return { base, files: [...new Set([...changedBetween(root, base, head), ...workingPaths(root)])] };
}

export function requiresFullValidation(root, paths) {
  return paths.some((path) => {
    if (isDocumentation(path)) return false;

    // Vite cannot see raw file reads or the dependencies of global test setup.
    if (/^src\/(?:core\/|modes\/|i18n\/|(?:main|pwa)\.ts$|config\/(?:mapRelease|zombieMaps)\.ts$|zombies\/Zombie(?:Manager|Spawner)\.ts$)/.test(path)) return true;
    const testModule = /^tests\/.+\.test\.ts$/.test(path);
    const sourceModule = /^(?:src|cloudflare\/api\/src)\/.+\.[cm]?[jt]sx?$/.test(path);
    if (!testModule && !sourceModule) return true;

    // A present-day import graph cannot recover edges to removed or renamed modules.
    return !lstatSync(join(root, path), { throwIfNoEntry: false })?.isFile();
  });
}
