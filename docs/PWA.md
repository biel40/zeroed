# Progressive Web App

Zeroed se publica como web normal y como PWA instalable. La integracion usa
`vite-plugin-pwa` con Workbox sobre el build Vite existente; no cambia Three.js,
el gameplay ni el despliegue de Vercel.

## Manifest e iconos

Vite genera `manifest.webmanifest` desde `vite.config.ts` con nombre Zeroed,
inicio y scope `/`, modo `standalone`, orientacion `landscape` y los colores
oscuros del shell. Los PNG de 192 y 512 px, el icono maskable de 512 px y el
Apple Touch Icon se generan desde `public/favicon.svg`, que sigue siendo la
fuente vectorial del branding.

Para regenerarlos tras cambiar el favicon:

```bash
npx pwa-assets-generator --preset minimal-2023 public/favicon.svg
```

## Service Worker y cache

`vite-plugin-pwa` genera y registra el Service Worker durante el build de
produccion. `src/pwa.ts` controla su ciclo de vida y deja el modo de desarrollo
sin Service Worker para que una cache anterior no oculte cambios locales.

El precache contiene solamente el app shell versionado por Workbox. JS, CSS y
HTML se descubren mediante `globPatterns`; los favicon se declaran en
`includeAssets`, y el manifest junto con los iconos PWA se incorpora desde la
configuracion PWA, sin entradas duplicadas:

- `index.html`, JS y CSS generados por Vite;
- manifest, favicon e iconos de instalacion;
- otros PNG/SVG pequenos del shell.

Los JPG, GLB y archivos de audio de `public/assets/` NO entran en el precache.
Se guardan cuando el juego los solicita:

| Cache | Estrategia | Politica |
| --- | --- | --- |
| `zeroed-textures` | `StaleWhileRevalidate` | 48 entradas, 30 dias |
| `zeroed-models` | `StaleWhileRevalidate` | 24 entradas, 30 dias |
| `zeroed-audio` | `StaleWhileRevalidate` + byte ranges | 16 entradas, 30 dias |

Esto permite reutilizar offline assets ya descargados sin obligar a bajar todos
los mapas y audios al instalar. La primera ejecucion offline solo puede usar los
assets que ya hayan sido solicitados online.

Workbox asigna revisiones de contenido a cada entrada del precache y elimina
precaches obsoletos con `cleanupOutdatedCaches`. Los caches runtime conservan
nombres estables, revalidan texturas/modelos con la red y aplican expiracion y
`purgeOnQuotaError`, evitando caches versionadas abandonadas.

## Actualizaciones seguras

El registro usa `registerType: 'prompt'`, `skipWaiting: false` y
`clientsClaim: true`. `src/pwa.ts` distingue el navegador normal del modo
`standalone` (incluido el indicador de iOS) sin crear otro registro ni otro
Service Worker.

En navegador normal, cada entrada ejecuta `registration.update()`. Si aparece
un worker nuevo, el callback `onNeedRefresh` usa el `skipWaiting` de
`registerSW`; al activarse, `clientsClaim` permite que tome control de la pagina.
Workbox solo sigue a los workers cuyo `updatefound` observa, y el navegador
lanza su propia comprobacion durante la navegacion: si ese worker ya esta
`installing` cuando la pagina registra, o `update()` resuelve mientras aun se
instala, `src/pwa.ts` lo vigila con `statechange` y aplica el `skipWaiting` al
llegar a `installed`. Sin esto la build nueva quedaba esperando en silencio.
Un unico listener `controllerchange`, compartido con `onNeedReload`, realiza la
recarga y un guard por carga evita procesar dos veces el mismo cambio de control.
Esto tambien cubre una activacion iniciada desde otra pestana. Si la comprobacion
falla o no encuentra una version nueva, Zeroed continua con la version actual
sin recargar. El boton permanece como fallback si la aplicacion automatica no
puede completarse.

En PWA instalada, una version nueva permanece esperando y muestra `UPDATE
ZEROED` en el selector de mapa y en el menu de pausa. Al pulsar la accion,
`src/pwa.ts` vuelve a comprobar que el selector o la pausa sean visibles. El
selector puede actualizar directamente; desde pausa se pide confirmacion porque
recargar descarta la run en memoria. Si otra pestana activa el worker, standalone
muestra el fallback pero no recarga hasta que el usuario lo pulse. Pointer Lock,
fullscreen y audio mantienen asi el mismo ciclo de
gesto de usuario que en una carga web normal.

## Probar instalacion y offline

1. Generar y servir el build de produccion con `npm run build` y
   `npm run preview`, o abrir `https://zeroed.es`.
2. En Chrome/Edge, abrir DevTools > Application.
3. Verificar `Manifest`, los iconos y un Service Worker activado sin errores.
4. Instalar desde la UI nativa del navegador o desde `INSTALAR ZEROED` cuando
   Chrome/Edge entregue `beforeinstallprompt`.
5. Abrir Zeroed desde su icono y comprobar `display-mode: standalone`.
6. Visitar ambos mapas online, activar Offline en DevTools y comprobar de nuevo
   los assets que ya fueron descargados.
7. En navegador normal, publicar otra version y volver a entrar: debe comprobar,
   activar y recargar una sola vez automaticamente.
8. En la PWA instalada, publicar otra version durante una partida: debe aparecer
   la accion al pausar, sin recarga previa. Aplicarla desde pausa o desde el
   selector.

La instalabilidad real de `zeroed.es` requiere HTTPS y que Vercel publique el
contenido actual de `dist/`. No se necesitan rewrites ni cambios de bundler: el
Service Worker y el manifest se generan en la raiz del mismo build Vite.

## Invalidar y depurar caches

- El servidor `npm run dev` no registra el Service Worker.
- En DevTools > Application > Service Workers puede usarse `Update` o
  `Unregister`; `Bypass for network` permite aislar problemas de cache.
- En Application > Storage, `Clear site data` elimina workers, Cache Storage y
  datos de instalacion locales.
- En Cache Storage deben verse el precache de Workbox y, tras jugar,
  `zeroed-textures`, `zeroed-models` y `zeroed-audio`.
- No se debe subir `maximumFileSizeToCacheInBytes` para silenciar avisos: un
  asset pesado debe permanecer en runtime cache.

El siguiente objetivo de distribucion es empaquetar este shell web como Android
mediante Capacitor, reutilizando el build Vite y manteniendo PWA y web como
canales independientes.
