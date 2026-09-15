# PWA

Zeroed usa `vite-plugin-pwa`/Workbox sobre Vite. No cambia Three.js ni el
 gameplay. El manifest es `standalone`, scope `/`, orientacion landscape e
iconos generados desde `public/favicon.svg`.

## Cache

El Service Worker solo se registra en produccion. El shell (HTML, JS, CSS,
manifest e iconos) va a precache. Assets grandes de `public/assets/` van a
runtime cache `StaleWhileRevalidate`:

| Cache | Limite | Caducidad |
| --- | ---: | ---: |
| `zeroed-textures` | 48 | 30 dias |
| `zeroed-models` | 24 | 30 dias |
| `zeroed-audio` | 16 | 30 dias |

Se usan revisiones Workbox, `cleanupOutdatedCaches` y `purgeOnQuotaError`.
Offline solo funciona para assets ya solicitados online.

## Actualizaciones

`registerType: 'prompt'`, `skipWaiting: false`, `clientsClaim: true`.

- Navegador normal: `registration.update()` al entrar; activa y recarga una
  vez cuando hay worker nuevo.
- PWA standalone: conserva el worker pendiente y muestra `UPDATE ZEROED` en
  selector/pausa; aplicar desde pausa requiere confirmacion porque descarta la
  run.
- Un unico `controllerchange` evita dobles recargas. Fallos de comprobacion no
  rompen la version actual.

## Prueba y depuracion

```powershell
npm run build
npm run preview
```

Probar en HTTPS: manifest, instalacion, standalone, ambos mapas offline y una
actualizacion web/standalone. En DevTools > Application se pueden actualizar o
anular workers y limpiar Storage. `npm run dev` no registra Service Worker.

Los iconos se regeneran con:

```powershell
npx pwa-assets-generator --preset minimal-2023 public/favicon.svg
```

Android usa Capacitor; ver `ANDROID_DOCS.md`.
