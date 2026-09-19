#!/usr/bin/env node
// Autodetecta el Android SDK y genera android/local.properties si falta.
// Se ejecuta como pre-hook de android:apk / android:run para que el build
// funcione en cualquier PC sin pasos manuales repetidos.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const androidDir = path.resolve(__dirname, '..', 'android');
const localPropertiesPath = path.join(androidDir, 'local.properties');

function readSdkDirFromLocalProperties() {
  if (!existsSync(localPropertiesPath)) return null;
  const content = readFileSync(localPropertiesPath, 'utf8');
  const match = content.match(/^sdk\.dir=(.+)$/m);
  if (!match) return null;
  return match[1].trim().replace(/\\\\/g, '\\');
}

function defaultSdkPaths() {
  const home = homedir();
  switch (platform()) {
    case 'win32':
      return [path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')];
    case 'darwin':
      return [path.join(home, 'Library', 'Android', 'sdk')];
    default:
      return [path.join(home, 'Android', 'Sdk'), path.join(home, 'android-sdk')];
  }
}

function writeLocalProperties(sdkDir) {
  const escaped = platform() === 'win32' ? sdkDir.replace(/\\/g, '\\\\') : sdkDir;
  writeFileSync(localPropertiesPath, `sdk.dir=${escaped}\n`, 'utf8');
  console.log(`[android-sdk] Generado android/local.properties -> sdk.dir=${sdkDir}`);
}

const existingSdkDir = readSdkDirFromLocalProperties();
if (existingSdkDir && existsSync(existingSdkDir)) {
  console.log(`[android-sdk] OK: local.properties ya apunta a ${existingSdkDir}`);
  process.exit(0);
}

const envSdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
if (envSdk && existsSync(envSdk)) {
  writeLocalProperties(envSdk);
  process.exit(0);
}

const candidate = defaultSdkPaths().find((candidatePath) => candidatePath && existsSync(candidatePath));
if (candidate) {
  writeLocalProperties(candidate);
  process.exit(0);
}

console.error(`
[android-sdk] No se encontro el Android SDK en esta maquina.

No hay ANDROID_HOME/ANDROID_SDK_ROOT definido, ni android/local.properties,
ni un SDK en la ruta por defecto de este sistema operativo:
  ${defaultSdkPaths().join('\n  ')}

Soluciones:
  1) Instala el SDK con Android Studio (SDK Manager) y vuelve a correr el
     comando: se detecta solo en la ruta por defecto de arriba.
  2) O define la variable de entorno de forma persistente y reabre la terminal:
       setx ANDROID_HOME "C:\\ruta\\a\\Android\\Sdk"
  3) O crea android/local.properties a mano con:
       sdk.dir=C:\\ruta\\a\\Android\\Sdk
`);
process.exit(1);
