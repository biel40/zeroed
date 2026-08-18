# Decisiones arquitectonicas

## [2026-08-18] Exponer unicamente mapas Zombies

- Contexto: el producto ya no ofrece el modo de practica normal y debe arrancar con los dos mapas Zombies desarrollados.
- Decision: `main.ts` abre directamente el selector `classic` / `burned-mansion`; se elimina `ShootingRangeMode`, pero se conserva `ShootingRange` como geometria reutilizada por `ClassicArena`.
- Motivo: eliminar una ruta de producto sin duplicar ni romper la infraestructura fisica del mapa Classic Zombies.

## [2026-08-16] Mantener un shell comun con modos aislados

- Contexto: campo de tiro y Zombies comparten render, jugador, armas, balistica, audio y HUD, pero no su estado de juego.
- Decision: `Game` compone los servicios comunes y cada modo implementa `GameMode`, recibiendo un `ModeContext`.
- Motivo: reutilizar infraestructura sin introducir dependencias de Zombies en el campo de tiro ni duplicar el loop.

## [2026-08-16] Definir armas mediante datos y una maquina de estados comun

- Contexto: las armas varian en cadencia, recoil, ADS, municion, proyectil y presentacion.
- Decision: centralizar su personalidad en `WeaponDefinition`; usar `Weapon` para logica y `WeaponView` para representacion.
- Motivo: ampliar el arsenal sin subclases por arma y mantener la logica testeable sin Three.js.

## [2026-08-16] Separar logica determinista de vistas Three.js

- Contexto: armas, Mystery Box, barreras, puertas, salud, economia y rondas necesitan pruebas sin WebGL.
- Decision: conservar maquinas de estado puras y adaptar sus eventos/estado en clases de vista u orquestadores.
- Motivo: reducir acoplamiento, permitir tests Node deterministas y evitar que el render sea fuente de verdad del gameplay.

## [2026-08-16] Representar mapas Zombies mediante `ZombieArena`

- Contexto: Classic reutiliza el range y Burned Mansion necesita geometria, colision, spawns e interacciones propias.
- Decision: una sola instancia de `ZombiesMode` mantiene la run; la estrategia `ZombieArena` posee el entorno y sus datos posicionales.
- Motivo: evitar duplicar rondas, economia, salud, inventario y progresion entre mapas.

## [2026-08-16] Centralizar economia y reservas dependientes del modo

- Contexto: Points solo existen en Zombies y las definiciones de arma se comparten entre modos.
- Decision: todas las recompensas/gastos pasan por `PlayerEconomy`; `GameMode.reserveAmmoFor` decide reservas especificas del modo.
- Motivo: evitar balances duplicados y mutaciones de configuracion compartida.

## [2026-08-16] Usar pools y temporales reutilizables en sistemas frecuentes

- Contexto: balas, zombies, casquillos y efectos se crean con alta frecuencia en el loop.
- Decision: usar pools de tamano fijo y reutilizar vectores temporales en actualizaciones criticas.
- Motivo: limitar crecimiento de escena, garbage collection y coste por frame.

## [2026-08-16] Recuperar navegacion por escalones, no con pathfinding continuo

- Contexto: el steering local es barato para 24 zombies, pero un objetivo inaccesible podia dejar una ronda bloqueada indefinidamente.
- Decision: medir progreso hacia un objetivo unico en intervalos escalonados; ante bloqueo, conservar el steering normal, calcular una ruta de rejilla acotada, probar un ajuste local y finalmente recolocar en un punto validado fuera de vision cuando sea posible.
- Motivo: garantizar recuperacion sin coste de rutas completas por frame, sin matar zombies ni sustituir la arquitectura actual por un navmesh.
