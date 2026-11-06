# Escritorio (Electron) y Steam

La version de escritorio es el mismo build de Vite dentro de Electron; no hay
gameplay ni assets propios. Web, PWA, Android y escritorio comparten codigo.

## Como funciona

- [main.mjs](../desktop/main.mjs) abre una ventana a pantalla completa y sirve
  `dist/` desde el origen privilegiado `app://zeroed` ([reglas](../desktop/appProtocol.mjs)).
  Un origen estable y seguro mantiene `localStorage`, `fetch` de assets y la
  musica con rangos; `file://` no los soporta igual.
- F11 o Alt+Enter alternan pantalla completa. No hay menu nativo. Los enlaces
  externos (creditos, web, privacidad) se abren en el navegador del sistema y
  la ventana no navega fuera de `app://zeroed`. Una segunda instancia enfoca la
  ventana abierta.
- El cliente detecta el escritorio por el puente del
  [preload](../desktop/preload.cjs) ([DesktopShell](../src/platform/DesktopShell.ts)):
  no registra el Service Worker y muestra SALIR en el menu principal.
- La partida guarda sus ajustes en `localStorage`, dentro de la carpeta de
  datos de usuario de Electron (`%APPDATA%\Zeroed` en Windows).

## Comandos

```powershell
npm run desktop:build      # tsc + vite build --mode desktop en dist/
npm run desktop:build -- --testers # build interno: testers locales sin enlace
npm run desktop:start      # abre dist/ en Electron (F12 = DevTools sin empaquetar)
npm run desktop:pack       # build + releases/desktop/win-unpacked/Zeroed.exe
npm run desktop:pack:linux # build + releases/desktop/linux-unpacked (Steam Deck/Linux)
npm run desktop:test       # tests del protocolo app://
```

La app no se sirve desde el dominio del relay, asi que el build necesita
`VITE_COOP_SERVER_URL` con `wss://`: se toma del entorno, de `.env.desktop` o,
si no existe, de `.env.android`. El build ignora `VITE_ACCOUNT_API_URL` de
`.env.local` para no publicar la API local.

El empaquetado es una carpeta (`target: dir`), que es lo que se sube a un depot
de Steam; no hay instalador ni firma de codigo. La configuracion esta en
[electron-builder.json](../desktop/electron-builder.json).

## Validacion manual

Tras `npm run desktop:pack`, abrir `Zeroed.exe` y comprobar: menu con musica,
partida en Burned Mansion con raton (Pointer Lock, Esc pausa), mando, audio,
F11/Alt+Enter, cooperativo contra la web, enlaces externos en el navegador y
SALIR. Repetir tras reiniciar para ver que los ajustes se conservan.

## Steam y limitaciones

Estado, pasos pendientes y limitaciones en [Steam](STEAM.md).
