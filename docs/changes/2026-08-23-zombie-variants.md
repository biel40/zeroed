# Variantes de zombie Shiny y Brute

**Qué**: el spawn puede producir zombies `normal`, `shiny` o `brute` dentro
del mismo pool global de 24. Shiny recibe un acabado PBR distintivo con 0.5 %
de probabilidad; Brute tiene probabilidad por tramo de ronda, máximo de dos,
salud/daño superiores, velocidad inferior, cuerpo más ancho y radio propio.

**Por qué**: aumentar la variedad y la presión de las rondas tardías sin crear
otra IA, otro pool ni depender de modelos adicionales.

**Dónde**: `src/zombies/ZombieConfig.ts`, `Zombie.ts`, `ZombieVisual.ts`,
`ZombieManager.ts`, `src/modes/ZombiesMode.ts` y sus pruebas de rondas,
manager, assets, hitboxes, visuales y navegación.

**Aprendido**: la variante debe seleccionarse antes de validar el punto de
spawn para usar su radio real. El límite Brute se deriva de los slots activos,
incluidos cadáveres, porque un contador mutable se desincronizaría al fallar un
spawn, reciclar o reiniciar. Los tres perfiles reutilizan el único walker GLB;
el volumen adicional del Brute comparte geometría y material entre instancias.

> Nota posterior: la presentación Brute descrita aquí fue sustituida el
> 2026-08-24 por un GLB original y un catálogo separado de tipos/modelos.
