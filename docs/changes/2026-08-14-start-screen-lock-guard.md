# 2026-08-14 — Start screen bloqueada por el guard de pointer lock

## Qué

El modal CLICK TO START no se ocultaba nunca en desktop: el puntero quedaba
bloqueado y el juego corría detrás, pero el modal seguía en pantalla.

## Por qué

`start()` arma `pointerLockResumeGuard` en TODA llamada (incluido el primer
clic). El guard existe para tragar eventos de unlock OBSOLETOS que llegan
tarde durante un resume desde pausa, pero `handlePointerLockChange` devolvía
early return también para el evento de lock FRESCO concedido dentro de la
ventana de 160 ms — saltándose `hud.hideStartScreen()`. En móvil no ocurría
porque `start()` oculta la pantalla directamente para touch; en desktop,
ocultarla depende exclusivamente del evento de lock.

Un evento `locked=true` NUNCA es obsoleto: solo puede venir de una adquisición
real. El guard ahora solo traga `locked=false`; un lock fresco limpia el guard
y cae al flujo normal que oculta la start screen.

## Dónde

- `src/core/Game.ts` — `handlePointerLockChange`: el guard solo intercepta
  `!locked`; el lock fresco cae al camino que oculta la start screen.
- `tests/audioSystem.test.ts` — nuevo test: lock concedido dentro de la
  ventana del guard debe llamar a `hideStartScreen`. El test preexistente de
  stale unlock sigue verde.

## Lo aprendido

- Los guards de eventos asíncronos deben discriminar por DIRECCIÓN del evento
  (lock vs unlock), no solo por ventana temporal. Tragar "todo lo que llegue
  en 160 ms" es una condición de carrera disfrazada de solución.
- El patrón `Object.create(Game.prototype)` + stub `any` permite testear
  handlers del composition root sin WebGL — útil para lógica atrapada en
  clases que instancian el renderer.
