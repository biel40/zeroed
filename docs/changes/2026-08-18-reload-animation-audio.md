# Animacion y audio de recarga

**Que**: las recargas de rifle y pistola usan trayectorias de cargador mas fisicas, la M4A1 ancla su cargador procedural en el magazine well y cada recarga completada produce un cierre sonoro original segun el estilo del arma.

**Por que**: la heuristica basada en los bounds completos del GLB colocaba el cargador M4A1 demasiado alto y adelantado; las fases de recarga tampoco confirmaban sonoramente el final autoritativo.

**Donde**: `src/weapons/WeaponTypes.ts`, `src/config/weapons.ts`, `src/weapons/WeaponView.ts`, `src/weapons/ReloadAnimator.ts`, `src/audio/AudioSystem.ts`, `src/core/Game.ts`, `tests/m4a1View.test.ts`, `tests/reloadAnimator.test.ts`, `tests/audioSystem.test.ts`.

**Aprendido**: los GLB de armas son mono-mesh, por lo que el cargador animado sigue siendo procedural. Las diferencias espaciales viven en configuracion mediante `magAnchor` y `magRotation`. El sonido final consume `reloadEnd`, no una fase visual, y por eso no se reproduce cuando la recarga se cancela.
