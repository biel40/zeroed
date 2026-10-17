#!/usr/bin/env node
// Genera el AAB release firmado y lo copia a releases/.
// Uso: npm run android:release [-- <versionName>]
// Incrementa versionCode, ajusta versionName (por defecto sube el patch),
// ejecuta tests, sincroniza Capacitor y lanza bundleRelease. Si algo falla,
// restaura build.gradle para no dejar una version a medias.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(rootDir, 'android');
const buildGradlePath = path.join(androidDir, 'app', 'build.gradle');
const keyPropertiesPath = path.join(androidDir, 'key.properties');
const bundlePath = path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
const releasesDir = path.join(rootDir, 'releases');
const isWindows = platform() === 'win32';

function fail(message) {
  console.error(`\n[android-release] ${message}`);
  process.exit(1);
}

function run(command, cwd = rootDir, env = process.env) {
  console.log(`\n[android-release] > ${command}`);
  const result = spawnSync(command, { cwd, env, stdio: 'inherit', shell: true });
  if (result.status !== 0) throw new Error(`Fallo: ${command}`);
}

function resolveJavaHome() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const bundledJbr = isWindows
    ? 'C:\\Program Files\\Android\\Android Studio\\jbr'
    : '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  if (existsSync(bundledJbr)) return bundledJbr;
  fail('No se encontro un JDK. Define JAVA_HOME o instala Android Studio.');
}

function bumpPatch(versionName) {
  const parts = versionName.split('.');
  const last = Number(parts.at(-1));
  if (!Number.isInteger(last)) fail(`No se puede incrementar versionName "${versionName}"; pasalo como argumento.`);
  parts[parts.length - 1] = String(last + 1);
  return parts.join('.');
}

if (!existsSync(keyPropertiesPath)) {
  fail('Falta android/key.properties. Copia android/key.properties.example y rellena los datos del keystore.');
}

const originalGradle = readFileSync(buildGradlePath, 'utf8');
const codeMatch = originalGradle.match(/versionCode (\d+)/);
const nameMatch = originalGradle.match(/versionName "([^"]+)"/);
if (!codeMatch || !nameMatch) fail('No se encontraron versionCode/versionName en android/app/build.gradle.');

const versionCode = Number(codeMatch[1]) + 1;
const versionName = process.argv[2] ?? bumpPatch(nameMatch[1]);
const javaHome = resolveJavaHome();

console.log(`[android-release] Version ${nameMatch[1]} (${codeMatch[1]}) -> ${versionName} (${versionCode})`);
writeFileSync(
  buildGradlePath,
  originalGradle
    .replace(/versionCode \d+/, `versionCode ${versionCode}`)
    .replace(/versionName "[^"]+"/, `versionName "${versionName}"`),
  'utf8',
);

try {
  run('npm test');
  run('npm run android:sync');
  run(isWindows ? 'gradlew.bat bundleRelease' : './gradlew bundleRelease', androidDir, { ...process.env, JAVA_HOME: javaHome });
} catch (error) {
  writeFileSync(buildGradlePath, originalGradle, 'utf8');
  fail(`${error.message}. build.gradle restaurado.`);
}

mkdirSync(releasesDir, { recursive: true });
const outputPath = path.join(releasesDir, `zeroed-${versionName}-${versionCode}.aab`);
copyFileSync(bundlePath, outputPath);
console.log(`\n[android-release] AAB firmado: ${path.relative(rootDir, outputPath)}`);
console.log('[android-release] Haz commit del cambio de version en android/app/build.gradle.');
