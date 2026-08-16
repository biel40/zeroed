# 2026-08-16 - Recuperacion de Pointer Lock en escritorio

## Que

La perdida de Pointer Lock por `Esc`, `Alt+Tab`, cambio de pestana o foco pausa
la partida y permite recuperar todos los controles FPS con un clic en `RESUME`.

## Por que

`Game` reanudaba la simulacion antes de que el navegador confirmara el lock y
un guard temporal podia ignorar un unlock real. Eso dejaba cursor, input y
pausa desincronizados cuando la adquisicion fallaba o los eventos se cruzaban.

## Donde

- `src/player/DesktopInput.ts` mantiene `document.pointerLockElement` como
  fuente de verdad, reconcilia el estado al recuperar visibilidad/foco y libera
  teclas y botones retenidos al ocultarse o perder foco.
- `src/core/Game.ts` conserva la pausa y su menu hasta que
  `pointerlockchange` confirma el canvas; nunca intenta relock sin gesto.
- `tests/desktopInput.test.ts` y `tests/audioSystem.test.ts` cubren perdida,
  reconciliacion, ausencia de listeners duplicados y reanudacion confirmada.

## Aprendido

- Un timeout no puede sustituir al estado real del navegador en una API
  asincrona dependiente de permisos y gestos de usuario.
- `visibilitychange` y `focus` sirven para reconciliar eventos perdidos, pero
  no deben inventar el lock ni solicitarlo automaticamente.
- La simulacion solo puede reanudarse despues de confirmar el lock; ocultar el
  overlay al solicitarlo crea un estado intermedio irrecuperable si se rechaza.
