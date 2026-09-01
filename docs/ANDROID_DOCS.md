Cuando generamos la versión compilada como .apk la ruta en la que se guarda el fichero es la siguiente:

- ./android/app/build/outputs/apk/debug/app-debug.apk
- 
# 1. Build del bundle web + copia a Android
npm run build
npx cap sync android

# 2. Compilar + instalar directo en el móvil conectado por USB
cd android
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot"
.\gradlew.bat installDebug