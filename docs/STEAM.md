# Steam: estado

**Corte:** 2026-11-06. Detalle tecnico de la app en [escritorio](DESKTOP.md).

## Hecho

- App de escritorio Electron que empaqueta el build web (`npm run desktop:pack`
  → `releases/desktop/win-unpacked/Zeroed.exe`). Validada por el usuario en
  Windows: menu, partida, mando, cooperativo y SALIR.
- Build interno con testers locales (`npm run desktop:build -- --testers` y
  `npm run desktop:start`): los correos de
  [LocalTesterBackend](../src/account/LocalTesterBackend.ts) desbloquean
  Station 33 sin enlace. Solo para pruebas propias; no se empaqueta ni se reparte.

## Pendiente

1. App ID de Steamworks: cuenta en revision.
2. `steamworks.js`: inicializacion, overlay y cierre (se puede empezar con el
   App ID de pruebas 480).
3. Station 33 como DLC: proveedor de permisos de Steam en lugar de
   `WebAccount`; el login por correo desaparece en escritorio. Claves del DLC
   para los beta testers.
4. Cooperativo premium verificado en servidor por plataforma.
5. Steamworks web: depots Windows/Linux, opciones de lanzamiento, Steam Cloud,
   Steam Input, ficha, clasificacion por edades y build de revision.
6. Opcional: logros, estadisticas y presencia.

## Limitaciones actuales

- En el build normal, Station 33 esta bloqueado y el login por correo no
  funciona (la API de cuentas no admite el origen `app://zeroed`).
- Sin validar: Linux/Steam Deck, rendimiento en otros equipos, Steam Input y
  overlay.
- Repartir el ZIP de `win-unpacked` fuera de Steam funciona en Windows x64,
  pero el ejecutable no esta firmado (aviso de SmartScreen) y no se actualiza solo.
