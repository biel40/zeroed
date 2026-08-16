# Failsafe de navegacion zombie

**Que**: la deteccion de bloqueo ahora mide progreso hacia el objetivo real y aplica recuperacion progresiva: nueva ruta acotada, ajuste local y recolocacion validada como ultimo recurso.

**Por que**: el rodeo anterior podia aceptar movimiento lateral infinito como progreso y dejar un zombie vivo e inaccesible bloqueando la ronda.

**Donde**: `src/zombies/ZombieManager.ts`, `src/zombies/ZombieSpawner.ts`, `src/modes/ZombiesMode.ts`, `tests/zombieStuck.test.ts`, `tests/zombieManager.test.ts`, `tests/burnedMansion.test.ts`.

**Aprendido**: las comprobaciones se escalonan por zombie y el pathfinding solo se ejecuta tras falta de progreso. Abrir puertas invalida rutas antiguas. Separacion y movimiento estan limitados y subdivididos para no atravesar paredes. Si no existe una transicion entre la planta del zombie y la del jugador, el failsafe sigue midiendo el bloqueo sin aceptar desplazamiento XZ como progreso y acaba recolocandolo de forma validada. Los spawns rechazados se reencolan y no acortan la ronda. `?zombieNavDebug` activa logs de eventos de recuperacion; produccion permanece silenciosa.
