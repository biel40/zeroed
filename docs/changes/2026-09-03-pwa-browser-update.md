# Actualizacion web fiable del Service Worker

**Que**: en navegador, `src/pwa.ts` vigila con `statechange` el worker que ya esta `installing` al registrar o al resolver `registration.update()`, y aplica `skipWaiting` cuando llega a `installed`.

**Por que**: al entrar en `zeroed.es` tras un deploy, a veces seguia cargando la version anterior y hacia falta F5 o `UPDATE ZEROED`.

**Donde**: `src/pwa.ts`, `tests/pwa.test.ts`, `docs/PWA.md`.

**Aprendido**: el navegador comprueba el SW por su cuenta en cada navegacion; si la build nueva ya esta instalando cuando corre `Workbox.register()`, `updatefound` ya paso y Workbox nunca emite `waiting`, asi que `onNeedRefresh` no se dispara. Ademas `registration.update()` resuelve cuando el worker pasa a `installing`, no a `waiting`, por lo que comprobar solo `registration.waiting` tras el `await` fallaba en casi todos los deploys reales. `messageSkipWaiting()` usa `registration.waiting` directamente, asi que funciona aunque Workbox no siga al worker.
