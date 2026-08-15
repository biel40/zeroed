# 2026-08-16 — Pantalla completa en móvil

## Qué

El juego solicita pantalla completa al tocar la pantalla de inicio desde un
dispositivo móvil.

## Por qué

Los navegadores solo permiten entrar en pantalla completa durante un gesto
directo del usuario. `Game.start()` ya es el punto que recibe ese gesto, por
lo que la solicitud ocurre ahí antes de continuar con el inicio del juego.

## Dónde

- `src/core/Game.ts` — solicita `document.documentElement.requestFullscreen()`
  para perfiles móviles que todavía no están en pantalla completa.
- `tests/audioSystem.test.ts` — comprueba que el gesto de inicio móvil realiza
  la solicitud.

## Lo aprendido

- La Fullscreen API no puede activarse automáticamente al cargar la página:
  necesita una interacción del usuario.
- La solicitud es de mejor esfuerzo. Los navegadores sin soporte o que la
  rechacen continúan iniciando el juego con normalidad.