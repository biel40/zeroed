# Sala secreta y lamparas de almas

**Que**: Burned Mansion incorpora tres lamparas industriales que absorben bajas cercanas mediante almas animadas. Ocho almas completan cada lampara; al completar las tres, la pared oeste del bunker se ilumina y se hunde para abrir una sala que contiene el final de 30000 puntos.

**Por que**: la ultima progresion de la partida necesitaba descubrimiento ambiental sin puerta, prompt ni pista visible inicial, manteniendo la entrada fisicamente indistinguible de la pared existente.

**Donde**: `src/zombies/secret-room/`, `src/zombies/maps/BurnedMansionConfig.ts`, `src/zombies/maps/BurnedMansionArena.ts`, `src/modes/ZombiesMode.ts`, `src/audio/AudioSystem.ts`, `tests/secretRoomState.test.ts`, `tests/burnedMansion.test.ts`, `tests/bunkerSecret.test.ts`.

**Aprendido**: las almas deben reservar capacidad al iniciar el vuelo pero sumar progreso solo al llegar; de otro modo varias muertes simultaneas pueden superar el maximo. La pared conserva collider balistico y de jugador durante toda la animacion, y solo entonces dispara el rebuild de navegacion. Los efectos usan buffers fijos y luces sin sombras; el reset restaura estado, particulas, brillo, pared y colliders.
