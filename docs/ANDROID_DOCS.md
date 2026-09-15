# Android con Capacitor

El APK debug se genera en `android/app/build/outputs/apk/debug/app-debug.apk`.
PWA y web siguen siendo canales independientes.

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