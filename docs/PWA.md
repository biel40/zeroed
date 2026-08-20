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

El precache contiene solamente el app shell versionado por Workbox:

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
`clientsClaim: false`. Una version nueva queda esperando y solo muestra
`ACTUALIZAR ZEROED` en el selector de mapa y en el menu de pausa. No se activa
ni recarga automaticamente durante gameplay.

Al pulsar la accion, `src/pwa.ts` vuelve a comprobar que el selector o la pausa
sean visibles. El selector puede actualizar directamente; desde pausa se pide
confirmacion porque recargar descarta la run en memoria. Cada pestana decide su
propia recarga mediante `onNeedReload`: una pestana que siga jugando conserva
la version actual hasta que el usuario llegue a un menu y acepte actualizar.
Pointer Lock, fullscreen y audio mantienen asi el mismo ciclo de gesto de
usuario que en una carga web normal.

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
7. Publicar otra version durante una partida: debe aparecer la accion al pausar,
   sin recarga previa. Aplicarla desde pausa o desde el selector.

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
