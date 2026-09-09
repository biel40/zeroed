# Fix: animacion zombie al abrir una ventana

## Que cambio

Los zombies cancelan `barrierAttack` y vuelven a caminar cuando el ultimo golpe abre la ventana. El zombie que rompe la ultima tabla lo hace en el mismo impacto; los demas atacantes lo detectan antes de procesar su ruta.

## Por que

El objetivo de barrera se limpiaba al destruir la ultima tabla, pero el estado de animacion seguia activo hasta agotar el golpe. Esto dejaba zombies golpeando una ventana ya abierta y retrasaba visualmente la entrada.

## Donde

- `src/zombies/Zombie.ts`
- `src/zombies/ZombieManager.ts`
- `tests/zombieManager.test.ts`

## Aprendido

La cancelacion debe ocurrir antes de perder la referencia al objetivo. Tambien debe preservar el cooldown del golpe para no permitir un ataque inmediato al jugador tras abrir la ventana.
