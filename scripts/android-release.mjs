#!/usr/bin/env node
// Genera el AAB (y opcionalmente el APK) release firmado de Zeroed para Google Play.
// Uso: npm run android:release -- [--version 1.0.4] [--apk] [--skip-tests] [--dry-run]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadEnv } from 'vite';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(rootDir, 'android');
const buildGradlePath = path.join(androidDir, 'app', 'build.gradle');
const keyPropertiesPath = path.join(androidDir, 'key.properties');
const releasesDir = path.join(rootDir, 'releases');
const isWindows = platform() === 'win32';

// Gradle 8.14 se ejecuta con JDK 17-24; el JBR de Android Studio puede ser mas nuevo.
const SUPPORTED_JAVA = { min: 17, max: 24, preferred: 21 };

const { values: options } = parseArgs({
  options: {
    version: { type: 'string' },
    apk: { type: 'boolean', default: false },
    'skip-tests': { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
  },
});

function log(message) {
  console.log(`[android-release] ${message}`);
}

function fail(message) {
  console.error(`\n[android-release] ERROR: ${message}\n`);
  process.exit(1);
}

function run(command, args, { cwd = rootDir, env = {} } = {}) {
  log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: true, env: { ...process.env, ...env } });
  if (result.status !== 0) throw new Error(`Fallo "${command} ${args.join(' ')}" (codigo ${result.status}).`);
}

function readProperties(filePath) {
  const properties = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#!=\s]+)\s*=\s*(.*?)\s*$/);
    if (match) properties[match[1]] = match[2];
  }
  return properties;
}

function javaMajorVersion(javaHome) {
  const releaseFile = path.join(javaHome, 'release');
  if (!existsSync(releaseFile)) return null;
  const match = readFileSync(releaseFile, 'utf8').match(/^JAVA_VERSION="(\d+)/m);
  return match ? Number(match[1]) : null;
}

function findJavaHome() {
  const candidates = [process.env.JAVA_HOME];
  const jdksDir = path.join(homedir(), '.jdks');
  if (existsSync(jdksDir)) candidates.push(...readdirSync(jdksDir).map((name) => path.join(jdksDir, name)));
  candidates.push(
    isWindows
      ? path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Android', 'Android Studio', 'jbr')
      : '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  );
  const supported = candidates
    .filter(Boolean)
    .map((javaHome) => ({ javaHome, version: javaMajorVersion(javaHome) }))
    .filter(({ version }) => version && version >= SUPPORTED_JAVA.min && version <= SUPPORTED_JAVA.max);
  if (process.env.JAVA_HOME && supported[0]?.javaHome === process.env.JAVA_HOME) return supported[0];
  return supported.find(({ version }) => version === SUPPORTED_JAVA.preferred) ?? supported[0] ?? null;
}

function checkSigning() {
  if (!existsSync(keyPropertiesPath)) {
    fail('Falta android/key.properties. Copia android/key.properties.example y rellenalo.');
  }
  const properties = readProperties(keyPropertiesPath);
  const missing = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'].filter((key) => !properties[key]);
  if (missing.length) fail(`android/key.properties no define: ${missing.join(', ')}.`);
  const storeFile = path.resolve(androidDir, properties.storeFile);
  if (!existsSync(storeFile)) fail(`No existe el keystore indicado en storeFile: ${storeFile}`);
  return { storeFile, keyAlias: properties.keyAlias };
}

function readVersion(gradle) {
  const code = gradle.match(/versionCode (\d+)/);
  const name = gradle.match(/versionName "([^"]+)"/);
  if (!code || !name) fail('No se encontraron versionCode/versionName en android/app/build.gradle.');
  return { code: Number(code[1]), name: name[1] };
}

function nextVersionName(current) {
  if (options.version) {
    if (!/^\d+\.\d+\.\d+$/.test(options.version)) fail(`--version debe tener formato X.Y.Z (recibido "${options.version}").`);
    return options.version;
  }
  const parts = current.split('.').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) fail(`versionName "${current}" no es X.Y.Z; usa --version.`);
  parts[2] += 1;
  return parts.join('.');
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function verifySignature(artifact, javaHome, sdkDir) {
  if (artifact.endsWith('.aab')) {
    const jarsigner = path.join(javaHome, 'bin', isWindows ? 'jarsigner.exe' : 'jarsigner');
    const result = spawnSync(jarsigner, ['-verify', artifact], { encoding: 'utf8' });
    if (result.status !== 0 || !/jar verified/.test(result.stdout)) {
      throw new Error(`El AAB no esta firmado correctamente:\n${result.stdout}${result.stderr}`);
    }
    return;
  }
  const buildToolsDir = path.join(sdkDir, 'build-tools');
  const latest = readdirSync(buildToolsDir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1);
  const apksigner = path.join(buildToolsDir, latest, isWindows ? 'apksigner.bat' : 'apksigner');
  const result = spawnSync(`"${apksigner}"`, ['verify', `"${artifact}"`], {
    encoding: 'utf8',
    shell: true,
    env: { ...process.env, JAVA_HOME: javaHome },
  });
  if (result.status !== 0) throw new Error(`El APK no esta firmado correctamente:\n${result.stdout}${result.stderr}`);
}

function readSdkDir() {
  const sdkDir = readProperties(path.join(androidDir, 'local.properties'))['sdk.dir'];
  return sdkDir.replace(/\\:/g, ':').replace(/\\\\/g, '\\');
}

function checkWebBundle(coopServerUrl) {
  const assetsDir = path.join(rootDir, 'dist', 'assets');
  const bundles = readdirSync(assetsDir).filter((name) => name.endsWith('.js'));
  const found = bundles.some((name) => readFileSync(path.join(assetsDir, name), 'utf8').includes(coopServerUrl));
  if (!found) throw new Error(`El bundle web no contiene ${coopServerUrl}.`);
}

// --- Comprobaciones previas ---
run('node', [`"${path.join(rootDir, 'scripts', 'ensure-android-sdk.mjs')}"`]);

const java = findJavaHome();
if (!java) {
  fail(`No se encontro un JDK ${SUPPORTED_JAVA.min}-${SUPPORTED_JAVA.max}. Instala un JDK ${SUPPORTED_JAVA.preferred} o define JAVA_HOME.`);
}
log(`JDK ${java.version}: ${java.javaHome}`);

const signing = checkSigning();
log(`Firma: alias "${signing.keyAlias}" en ${signing.storeFile}`);

const coopServerUrl = (process.env.VITE_COOP_SERVER_URL ?? loadEnv('android', rootDir, 'VITE_').VITE_COOP_SERVER_URL)?.trim();
if (!coopServerUrl?.startsWith('wss://')) fail('VITE_COOP_SERVER_URL debe definirse con wss:// en .env.android.');
log(`Relay cooperativo: ${coopServerUrl}`);

const gitStatus = spawnSync('git', ['status', '--porcelain'], { cwd: rootDir, encoding: 'utf8' }).stdout.trim();
if (gitStatus) log('AVISO: hay cambios sin commitear; se incluiran en la release.');

const originalGradle = readFileSync(buildGradlePath, 'utf8');
const current = readVersion(originalGradle);
const next = { code: current.code + 1, name: nextVersionName(current.name) };
const outputs = options.apk ? ['aab', 'apk'] : ['aab'];
log(`Version: ${current.name} (${current.code}) -> ${next.name} (${next.code}); salida: ${outputs.join(' + ')}`);

if (options['dry-run']) {
  log('Dry run: comprobaciones OK, no se ha compilado nada.');
  process.exit(0);
}

// --- Build ---
try {
  if (!options['skip-tests']) run('npm', ['test']);

  writeFileSync(
    buildGradlePath,
    originalGradle
      .replace(/versionCode \d+/, `versionCode ${next.code}`)
      .replace(/versionName "[^"]+"/, `versionName "${next.name}"`),
  );

  // La puerta de la beta solo aplica a la web; nunca debe entrar en la app.
  const webEnv = { BETA_ENABLED: 'false', VITE_COOP_SERVER_URL: coopServerUrl };
  run('npx', ['tsc', '--noEmit']);
  run('npx', ['vite', 'build', '--mode', 'android'], { env: webEnv });
  checkWebBundle(coopServerUrl);
  run('npx', ['cap', 'sync', 'android']);

  const gradleTasks = ['bundleRelease', ...(options.apk ? ['assembleRelease'] : [])];
  run(isWindows ? `"${path.join(androidDir, 'gradlew.bat')}"` : './gradlew', gradleTasks, { cwd: androidDir, env: { JAVA_HOME: java.javaHome } });
} catch (error) {
  writeFileSync(buildGradlePath, originalGradle);
  fail(`${error.message}\nSe ha restaurado la version ${current.name} (${current.code}) en build.gradle.`);
}

// --- Resultado ---
const builtArtifacts = {
  aab: path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab'),
  apk: path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
};
const sdkDir = readSdkDir();
mkdirSync(releasesDir, { recursive: true });
console.log('');
for (const type of outputs) {
  const target = path.join(releasesDir, `zeroed-${next.name}-${next.code}.${type}`);
  try {
    verifySignature(builtArtifacts[type], java.javaHome, sdkDir);
  } catch (error) {
    fail(`${error.message}\nbuild.gradle queda en ${next.name} (${next.code}); revisa la firma antes de subir.`);
  }
  copyFileSync(builtArtifacts[type], target);
  log(`${type.toUpperCase()} firmado: ${path.relative(rootDir, target)}`);
  log(`  SHA-256: ${sha256(target)}`);
}
log(`Release ${next.name} (${next.code}) lista. Commitea android/app/build.gradle con el nuevo versionCode.`);
