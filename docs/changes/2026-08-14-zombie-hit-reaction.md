# Fix: animación zombie saltaba a frame 0 al recibir disparos

**Qué**: cada impacto de bala (y cada ataque) reiniciaba visiblemente el ciclo
de caminata del zombie. Ahora el walk reanuda su fase con crossfade y nunca
se reinicia; el flinch sin clip ya no se re-ancla en ráfagas.

**Por qué**: bug reportado — "las animaciones saltan al recibir disparos".
Causa raíz confirmada parseando el GLB: el walker NO tiene clip de hit
(`ZombieBite/ZombieCrawl/ZombieIdle/ZombieRun/ZombieWalk` únicamente), así que
el estado `hit` cae al fallback `hitDip` (ralentiza el walk al 25 %) mientras
walk sigue siendo `currentAction`. El viejo `setState('walk')` llamaba
`next.reset()` siempre → el ciclo saltaba al frame 0 tras CADA hit y CADA
ataque, sin crossfade que lo enmascarara. Secundario: `hitDip` se re-anclaba
a 1 por bala en fuego auto → walk al 25 % permanente (pies que resbalan).

**Dónde**: `src/zombies/ZombieVisual.ts` — `setState()`. Tests de regresión en
`tests/zombieHitReaction.test.ts` (5 casos).

**Cómo funciona**:
- **Walk NUNCA resetea**: al volver a walk se re-habilita la acción
  (`next.enabled = true`), se aplica `crossFadeFrom` y `play()`, pero no
  `reset()` → el ciclo reanuda la fase donde se congeló.
- **Re-entrar al estado actual es no-op** (fuego sostenido re-entra a `hit`
  por bala; reiniciar estroboscopiaría los primeros frames del clip).
- **`hitDip = 1` solo si `previous !== 'hit'`**: la segunda bala de una ráfaga
  no vuelve a hundir el timeScale.
- Los one-shots (`spawn`/`attack`/`death`/`hit` con clip) MANTIENEN `reset()`:
  un ataque nuevo debe empezar desde el principio.

**Aprendido** (verificado en `node_modules/three/src/animation/AnimationAction.js`):
- **Un action en fadeOut se congela al completar el fade.** `_updateWeight`
  pone `enabled = false` cuando el fade llega a peso 0, y `_update` hace
  early-return para acciones deshabilitadas → `action.time` deja de avanzar.
  NO sigue corriendo "a peso cero" por debajo. En la práctica: tras
  walk→attack, la fase del walk avanza solo la ventana del crossfade
  (~0.167 s) y se congela hasta que `setState('walk')` la re-habilita.
- **`crossFadeFrom`/`fadeIn`/`play` NO re-habilitan** una acción deshabilitada
  por fadeOut: hay que poner `enabled = true` explícitamente.
- Los tests deben avanzar por frames de 1/60 (helper `step()`): el decay de
  `hitDip` se aplica DESPUÉS del timeScale dentro del mismo `update()`.
- Al corregir una expectativa mal calibrada, bloquear el mecanismo real con
  cota inferior Y superior (`> faseAntes`, `< fase + 0.3`) para que nadie
  "arregle" producción contra una suposición falsa.
