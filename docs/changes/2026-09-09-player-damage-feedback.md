# Feedback de daño al jugador

**Qué**: cada golpe zombie aceptado por `PlayerHealth` produce una vibración angular breve de cámara y una viñeta roja que deja libre el centro de la mira. El estado de vida crítica conserva una viñeta independiente y más tenue.

**Por qué**: el feedback ya estaba conectado, pero el contenedor del overlay tenía `opacity: 0`, ocultando también el pseudo-elemento animado. El impulso de cámara inicial era demasiado pequeño para percibirse con claridad.

**Dónde**: `src/modes/ZombiesMode.ts`, `src/style.css` y `tests/playerDamageFeedback.test.ts`.

**Aprendido**: la opacidad de un elemento afecta a todo su árbol, incluidos `::before` y `::after`. Las capas temporal y persistente deben controlar su opacidad por separado.