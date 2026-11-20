import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isDocumentation, readDevelopmentChanges, readFeatureChanges, readWorkingState, requiresFullValidation,
} from './test-impact-state.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const cache = join(root, 'node_modules', '.vite', 'vitest', 'zeroed-impact');
const checkpoint = join(cache, 'checkpoint.json');
const cacheVersion = 1;

function readSnapshot() {
  const state = JSON.parse(readFileSync(checkpoint, 'utf8'));
  if (state.version !== cacheVersion || !/^(?:[a-f\d]{40}|[a-f\d]{64})$/.test(state.head)
    || !state.files || Array.isArray(state.files) || typeof state.files !== 'object'
    || !Object.values(state.files).every((value) => typeof value === 'string')) {
    throw new Error('The impact cache is invalid.');
  }
  return state;
}

function pendingRuns() {
  try {
    return readdirSync(cache).filter((name) => /^retry-[\da-f-]+\.json$/.test(name));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function writeCache(path, data) {
  mkdirSync(cache, { recursive: true });
  const temporary = join(cache, `${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(data));
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function select(mode, current, pending) {
  if (mode === 'full') return { reason: 'Full validation requested.' };
  if (mode === 'feature') {
    const { base, files } = readFeatureChanges(root);
    console.log(`Impact: main merge base ${base.slice(0, 12)}.`);
    return checkPaths(files);
  }

  const previous = readSnapshot();
  const retries = pending.map((name) => JSON.parse(readFileSync(join(cache, name), 'utf8')));
  if (retries.includes(null)) return { reason: 'A previous full validation must be retried.' };
  if (!retries.every((paths) => Array.isArray(paths) && paths.every((path) => typeof path === 'string'))) {
    throw new Error('The impact cache is invalid.');
  }
  return checkPaths([...readDevelopmentChanges(root, previous, current), ...retries.flat()]);
}

function checkPaths(paths) {
  const files = [...new Set(paths.filter((path) => !isDocumentation(path)))];
  if (requiresFullValidation(root, files)) return { reason: 'High-impact or removed inputs changed.' };
  return { files };
}

async function runVitest(files) {
  process.env.TEST = 'true';
  process.env.VITEST = 'true';
  process.env.NODE_ENV ??= 'test';
  let ctx;
  try {
    let specs;
    try {
      const { createVitest } = await import('vitest/node');
      ctx = await createVitest('test', {
        root,
        watch: false,
        related: files.map((path) => resolve(root, path).split(sep).join('/')),
        reporters: ['dot'],
        silent: 'passed-only',
        passWithNoTests: false,
      });
      specs = await ctx.getRelevantTestSpecifications();
    } catch (error) {
      console.error(`Impact: Vitest could not determine related tests (${error.message}).`);
      return false;
    }
    if (specs.length === 0) return false;

    const names = specs.map(({ moduleId }) => moduleId.slice(ctx.config.root.length + 1)).sort();
    console.log(`Impact: ${names.length} Vitest file(s) selected from ${files.length} changed input(s).`);
    if (names.length <= 8) console.log(names.join(', '));
    await ctx.init();
    const { testModules } = await ctx.runTestSpecifications(specs);
    return Boolean(process.exitCode) || testModules.some((module) => !module.children.allTests('passed').next().done);
  } finally {
    await ctx?.close();
  }
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.error) console.error(result.error);
  if (result.status !== 0) process.exitCode ||= result.status || 1;
}

async function runFull(reason) {
  console.log(`Impact: ${reason} Running the complete suite.`);
  const packagePath = createRequire(import.meta.url).resolve('vitest/package.json');
  runNode([join(dirname(packagePath), 'vitest.mjs'), 'run', '--reporter=dot', '--silent=passed-only']);
  // Run the other existing suites even if Vitest fails, and preserve any failure.
  runNode(['--test', 'server/multiplayer.test.mjs', 'desktop/appProtocol.test.mjs']);
  const { runCloudflareTest } = await import('./test-cloudflare-worker.mjs');
  const status = await runCloudflareTest(root);
  process.exitCode ||= status;
}

function recordResult(current, pending, files) {
  try {
    if (process.exitCode) {
      writeCache(join(cache, `retry-${randomUUID()}.json`), files ?? null);
      return;
    }
    const after = readWorkingState(root);
    if (current.head !== after.head || readDevelopmentChanges(root, current, after).length > 0) {
      console.log('Impact: the workspace changed during validation. The checkpoint was kept.');
      return;
    }
    writeCache(checkpoint, { version: cacheVersion, ...after });
    for (const name of pending) rmSync(join(cache, name), { force: true });
  } catch (error) {
    console.log(`Impact: could not update the checkpoint (${error.message}).`);
  }
}

async function main(mode) {
  let current;
  let pending = [];
  let selection;
  try {
    if (mode !== 'feature') {
      pending = pendingRuns();
      current = readWorkingState(root);
    }
    selection = select(mode, current, pending);
  } catch (error) {
    if (mode === 'full') {
      selection = { reason: 'Full validation requested.' };
    } else {
      const detail = error.code === 'ENOENT' ? 'No impact checkpoint or Git executable is available.' : error.message.split('\n')[0];
      selection = { reason: `Safe selection was unavailable (${detail}).` };
    }
  }

  if (selection.files?.length === 0) {
    console.log('Impact: no relevant changes. 0 tests executed.');
    return;
  }
  try {
    if (selection.files && !await runVitest(selection.files)) {
      selection = { reason: 'Related test selection was empty or unavailable.' };
    }
    if (selection.reason) await runFull(selection.reason);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
  if (current) recordResult(current, pending, selection.files);
}

const [mode, ...args] = process.argv.slice(2);
if (!['affected', 'feature', 'full'].includes(mode) || args.length > 0) {
  console.error('Usage: node scripts/test-impact.mjs <affected|feature|full>');
  process.exitCode = 1;
} else {
  await main(mode);
}
