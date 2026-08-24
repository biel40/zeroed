# Recargas visuales sin manos del jugador

**Que**: los siete viewmodels muestran únicamente el arma. Las recargas siguen animando cargadores, celdas, cerrojos y tapas, pero no crean ni renderizan manos o brazos del jugador.

**Por que**: las manos procedurales degradaban la presentación visual. Eliminarlas por completo también evita su geometría y actualización por frame sin modificar tiempos, munición, disparo, ADS ni estadísticas.

**Donde**: `src/weapons/WeaponView.ts`, `src/weapons/ReloadAnimator.ts`, `src/core/Game.ts`, `tests/reloadAnimator.test.ts`, `tests/m1911View.test.ts`.

**Aprendido**: `Weapon.stateProgress` sigue siendo la única referencia temporal y `ReloadAnimator` restaura las piezas al ocultar o reiniciar un viewmodel. La presentación mecánica no depende de una representación corporal del jugador.
