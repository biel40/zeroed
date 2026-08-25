# Salida estable y rellano ampliado del bunker

**Que**: los zombies conservan el corredor de escalera hasta avanzar 0.9 m dentro del rellano de destino antes de perseguir de nuevo al jugador. El extremo norte del bunker se amplia un metro, junto con suelo, techo, muros, colisiones y limites navegables.

**Por que**: al cambiar de planta logica dentro del extremo de la rampa, el objetivo pasaba inmediatamente al jugador. Si este estaba a un lado de la escalera, el zombie invertia el sentido mientras aun seguia encerrado entre los costados. El rellano inferior solo dejaba 1.25 m de profundidad para maniobrar.

**Donde**: `src/zombies/ZombieManager.ts`, `src/zombies/maps/BurnedMansionArena.ts`, `src/zombies/maps/BurnedMansionConfig.ts`, `tests/burnedMansion.test.ts`.

**Aprendido**: cruzar un trigger de planta no significa haber terminado fisicamente una escalera. La transicion debe conservar su objetivo longitudinal hasta despejar toda la geometria del canal; despues pueden recuperar el control la persecucion directa y el pathfinding de la planta de destino.
