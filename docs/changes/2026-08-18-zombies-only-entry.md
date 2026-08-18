# Entrada exclusiva de Zombies

**Que**: el juego abre directamente un selector con `Classic Zombies` y `Burned Mansion`; se eliminan el selector de modos, `ShootingRangeMode`, el telemetro y el panel de precision exclusivos del campo de tiro normal.

**Por que**: la experiencia publica debe ofrecer unicamente los dos mapas Zombies desarrollados.

**Donde**: `index.html`, `src/main.ts`, `src/ui/HUD.ts`, `src/core/Game.ts`, `src/modes/GameMode.ts`, `src/style.css`, `tests/mapSelection.test.ts`.

**Aprendido**: `ShootingRangeMode` era eliminable, pero `range/ShootingRange.ts` no: `ClassicArena` reutiliza su geometria, objetivos y colliders para el mapa Zombies exterior.
