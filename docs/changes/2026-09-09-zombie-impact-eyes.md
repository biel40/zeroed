# Impactos sin bloqueo y ojos rojos

**Qué**: los impactos no letales ya no cambian el estado lógico de locomoción del zombie. La reacción de golpe se reproduce como feedback visual temporal mientras continúa la persecución. Todos los modelos incorporan dos ojos rojos pequeños, emisivos y anclados a la cabeza animada, sin luces dinámicas.

**Por qué**: renovar el estado `hit` con cada disparo impedía que `ZombieManager` desplazara al zombie y hacía que pareciera atorado bajo fuego sostenido. Los ojos aportan una presencia inquietante en zonas oscuras sin competir con el hit flash ni molestar al jugador.

**Dónde**: `src/zombies/Zombie.ts`, `src/zombies/ZombieVisual.ts`, `tests/zombie.test.ts` y `tests/zombieHitReaction.test.ts`.

**Aprendido**: la reacción visual y el estado autoritativo de movimiento no deben compartir el mismo bloqueo. Un material emisivo moderado sobre geometría compartida conserva el efecto en oscuridad sin añadir luces ni coste de actualización por frame.