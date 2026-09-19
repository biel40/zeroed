# Android con Capacitor

El APK debug se genera en `android/app/build/outputs/apk/debug/app-debug.apk`.
PWA y web siguen siendo canales independientes.

## SDK de Android en cada PC

`android/local.properties` no se versiona (la ruta del SDK cambia por
maquina). `npm run android:apk` y `npm run android:run` ejecutan primero
`scripts/ensure-android-sdk.mjs`, que:

1. Si `local.properties` ya apunta a una ruta valida, no hace nada.
2. Si no, usa `ANDROID_HOME`/`ANDROID_SDK_ROOT` si estan definidas.
3. Si no, prueba la ruta por defecto del SDK segun el SO
   (`%LOCALAPPDATA%\Android\Sdk` en Windows, `~/Library/Android/sdk` en
   macOS, `~/Android/Sdk` en Linux) y genera `local.properties` solo.
4. Si nada de eso existe, corta con instrucciones claras (instalar el SDK,
   definir `ANDROID_HOME` con `setx`, o crear `local.properties` a mano).

Tambien se necesita `JAVA_HOME` apuntando a un JDK 21 (Gradle lo toma del
PATH o de esa variable; si tu maquina no la tiene seteada globalmente,
export ala antes de correr gradlew).

## Build e instalacion

```powershell
npm run build
npx cap sync android
Set-Location android
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
.\gradlew.bat installDebug
```

## Iconos y splash

`@capacitor/assets` usa `assets/icon.png` para generar los iconos launcher y
el splash. Tras cambiar el favicon:

```powershell
npm run android:icons
```

El comando sobrescribe `android/app/src/main/res/mipmap-*` y
`res/drawable*/splash.png`; no se editan manualmente.