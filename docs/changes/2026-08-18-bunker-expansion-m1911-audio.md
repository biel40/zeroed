# Bunker ampliado y audio M1911

**Que**: el bunker secreto es ahora una sala de unos 10 x 9 metros con techo abierto sobre la escalera, rellanos seguros, rutas despejadas, laboratorio Ray Gun, estacion ZEUS-77, M60, senal de radiacion, barandillas, consola e iluminacion roja/fria. La M1911 produce feedback mecanico desde el inicio de la recarga.

**Por que**: el techo continuo atravesaba la escalera decorativa y los portales desembocaban en posiciones desconectadas, haciendo el acceso confuso e inestable. El foley corto de fases de la M1911 no daba una confirmacion audible inmediata.

**Donde**: `src/zombies/maps/BurnedMansionConfig.ts`, `src/zombies/maps/BurnedMansionArena.ts`, `src/modes/ZombiesMode.ts`, `src/audio/AudioSystem.ts`, `src/core/Game.ts`, `tests/burnedMansion.test.ts`, `tests/bunkerSecret.test.ts`, `tests/audioSystem.test.ts`.

**Aprendido**: las escaleras siguen usando el portal simplificado del mapa, pero ahora el hueco existe fisicamente y ambos destinos quedan sobre suelo solido fuera del trigger inverso. Ray Gun y ZEUS reutilizan `ArenaWeaponPickup` y marcan los hitos existentes al recogerse. `reloadStart` garantiza feedback inmediato y `reloadEnd` conserva el cierre final.
