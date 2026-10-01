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

## Google Play: releases y avance de canal

### Privacidad

La politica se mantiene en `public/privacy.html` y el menu la muestra en un
dialogo con una copia local, tambien en Android y sin conexion. Vite la copia
a `dist/privacy.html`; la URL prevista tras desplegar en Vercel es
`https://zeroed.es/privacy.html`. Verificar su disponibilidad publica antes
de introducirla en Play Console. Publicar la web no actualiza el AAB: para
incorporar el acceso desde el menu, sincronizar y generar una nueva release.

Datos confirmados por el usuario el 2026-10-01: desarrollador **Biel40**,
contacto **biel40aws@gmail.com**, web en **Vercel**, cooperativo en **Cloudflare**
y sin analitica ni registros adicionales activados sobre los valores por defecto.
No afirmar que la infraestructura no procesa IPs ni conserva registros tecnicos.

Contexto confirmado por el usuario el 2026-10-01: Zeroed esta en **Prueba
interna** y la cuenta de desarrollador es **personal**. La fecha de creacion
de la cuenta no esta confirmada. No asumir que tiene acceso a produccion.

### Publicar cambios o bug fixes

1. Ejecutar `npm test` y comprobar los cambios en el movil, incluido individual.
2. En `android/app/build.gradle`, incrementar `versionCode` por encima del
   maximo subido a Play Console y ajustar `versionName` para identificar la release.
3. Ejecutar `npm run android:sync` y despues `npx cap open android`. Si se
   modifica el juego otra vez, repetir la sincronizacion antes de generar el AAB.
4. En Android Studio: Build > Generate Signed Bundle / APK > Android App
   Bundle. Usar el mismo keystore y alias, variante release y applicationId
   `es.zeroed.game`. Conservar el keystore y sus credenciales fuera del repositorio.
5. Crear una version en el canal correspondiente, subir el AAB nuevo,
   completar nombre y notas, revisar errores y completar el envio/lanzamiento.
6. Cuando este disponible, actualizar desde Google Play con una cuenta que
   tenga acceso al canal y comprobar los arreglos. Un borrador no se distribuye.

### Pasar de prueba interna a prueba cerrada

1. Completar las tareas pendientes del panel de Play Console: ficha de la
   tienda, contenido de la app, seguridad de datos, clasificacion, privacidad
   y configuracion de paises/precio segun lo que solicite Google.
2. Abrir Pruebas y lanzamiento > Pruebas > Prueba cerrada. Crear o gestionar
   un canal; configurar paises y testers mediante correos o Google Groups.
3. Crear una release y elegir **Anadir desde la biblioteca** para reutilizar
   el AAB ya probado. Cambiar de canal sin modificar el binario no requiere
   recompilar ni incrementar versionCode. Si cambia el juego, generar un AAB nuevo.
4. Revisar y enviar los cambios desde la consola; completar la publicacion
   cuando corresponda. Compartir el enlace de participacion cuando este disponible.
5. Los testers deben aceptar participar con la cuenta autorizada e instalar
   desde Google Play. Quienes esten en prueba interna deben salir de ella
   antes de unirse a la cerrada o abierta.

### Acceso a produccion y prueba abierta

Para cuentas personales creadas despues del 2023-11-13, Google exige una
prueba **cerrada** con al menos **12 testers inscritos durante 14 dias
consecutivos** antes de solicitar acceso a produccion. La prueba interna no
satisface ese requisito. Recoger feedback y documentar las correcciones para
la solicitud; cumplir el minimo no garantiza la aprobacion.

Tras cumplir los requisitos, solicitar acceso a produccion desde el panel
y responder las preguntas sobre las pruebas y la preparacion del juego.
Al aprobarse, se habilitan produccion y prueba abierta para esas cuentas.
La prueba abierta es opcional. En otras cuentas, comprobar los canales y
requisitos disponibles en su consola; no todas necesitan este recorrido.

Con acceso habilitado: abrir Produccion, configurar paises, crear una release
con el AAB validado de la biblioteca, revisar y enviar a revision. Si esta
activada la publicacion gestionada, publicar despues de la aprobacion.

Fuentes oficiales (consultadas el 2026-10-01; verificar requisitos al publicar):

- [Crear y lanzar releases](https://support.google.com/googleplay/android-developer/answer/9859348?hl=es)
- [Configurar pruebas y acceso de testers](https://support.google.com/googleplay/android-developer/answer/9845334?hl=es)
- [Requisitos para cuentas personales nuevas](https://support.google.com/googleplay/android-developer/answer/14151465?hl=es)
