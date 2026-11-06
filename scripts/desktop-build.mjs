#!/usr/bin/env node
// Compiles the web build for the desktop app (Electron) into dist/.
// Uso: npm run desktop:build -- [--testers]
// --testers: build interno en el que los testers locales entran sin enlace; no se sube a Steam.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadEnv } from 'vite';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { values: options } = parseArgs({ options: { testers: { type: 'boolean', default: false } } });

function fail(message) {
  console.error(`\n[desktop-build] ERROR: ${message}\n`);
  process.exit(1);
}

function run(command, args, env) {
  console.log(`[desktop-build] > ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd: rootDir, stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (result.status !== 0) fail(`"${command} ${args.join(' ')}" termino con codigo ${result.status}.`);
}

// The app is not served from the relay's domain, so it needs the public relay explicitly.
// Native builds share it: .env.desktop wins, otherwise the Android one is reused.
const coopServerUrl = (process.env.VITE_COOP_SERVER_URL
  ?? loadEnv('desktop', rootDir, 'VITE_').VITE_COOP_SERVER_URL
  ?? loadEnv('android', rootDir, 'VITE_').VITE_COOP_SERVER_URL)?.trim();
if (!coopServerUrl?.startsWith('wss://')) {
  fail('VITE_COOP_SERVER_URL debe definirse con wss:// en .env.desktop o .env.android.');
}
console.log(`[desktop-build] Relay cooperativo: ${coopServerUrl}`);
if (options.testers) {
  console.warn('[desktop-build] AVISO: build interno con testers locales. No lo empaquetes para Steam.');
}

run('npx', ['tsc', '--noEmit']);
run('npx', ['vite', 'build', '--mode', 'desktop'], {
  VITE_COOP_SERVER_URL: coopServerUrl,
  // An empty value overrides a local API from .env.local, so the build falls back to production.
  VITE_ACCOUNT_API_URL: '',
  VITE_LOCAL_TESTERS: options.testers ? 'true' : '',
});
