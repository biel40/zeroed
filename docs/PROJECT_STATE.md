# Estado del proyecto

Estado inspeccionado: 2026-08-16. La fuente de verdad es el codigo actual; `README.md` y algunas notas de `docs/changes/` describen estados anteriores.

## Sistemas funcionales

- Arranque WebGL, carga de GLB/texturas con fallback, selector de modo y selector de mapa (`src/main.ts`, `src/assets/AssetManager.ts`).
- Shell FPS compartido con render, input desktop/tactil, jugador, armas, balistica, efectos, audio, HUD, pausa real y perfiles de dispositivo (`src/core/Game.ts`).
- Campo de tiro con cinco armas, blancos a 25/50/100/200 m, estadisticas y telemetro (`src/modes/ShootingRangeMode.ts`, `src/range/`).
- Armas declarativas con cadencia, modos de fuego, municion, recarga, ADS, dispersion, recoil y view models GLB/procedurales (`src/config/weapons.ts`, `src/weapons/`).
- Balistica con gravedad/drag, raycast segmentado y prioridad de hitbox de cabeza (`src/shooting/`).
- Zombies con salud, Points, inventario de dos slots, rondas infinitas, pool de 24 enemigos, ataques y navegacion con steering local, rutas de recuperacion y failsafe de recolocacion (`src/modes/ZombiesMode.ts`, `src/zombies/`).
- Mystery Box, compras de pared, puertas por puntos, barreras reparables y recompensas centralizadas (`src/zombies/`, `src/game/PlayerEconomy.ts`).
- Ray Gun con proyectil y splash; ZEUS-77 con cadena electrica; desbloqueos por bajas y pickup de Ray Gun en el bunker.
- Mapas Zombies `classic` y `burned-mansion`; la mansion incluye colision del jugador, zonas desbloqueables y transiciones de planta (`src/zombies/maps/`).
- Suite Vitest de logica determinista: 44 archivos y 353 tests pasan. `npm run typecheck` tambien pasa.

## Sistemas parciales o limitados

- Los tests se ejecutan en Node: no cubren WebGL, DOM real, pointer lock, fullscreen, audio real ni flujos end-to-end de arranque/pausa/reinicio.
- La IA usa rutas explicitas y steering contra AABB, no un navmesh global. El pathfinding acotado solo se activa al detectar falta de progreso; los spawns siguen definidos en planta 0.
- Las escaleras de la mansion son zonas de transicion, no superficies navegables continuas.
- Tablas de barrera, Mystery Box, wall buys y pickups son principalmente visuales/logicos; varios no forman parte de la colision fisica o balistica.
- Solo existe la variante zombie `walker`. M60, M1911, Ray Gun y ZEUS-77 usan modelos procedurales.
- Los proyectiles de energia comparten un alcance fijo de 80 m y su comportamiento solo distingue Tesla de Ray Gun por color.
- Cambiar de modo o mapa requiere recargar la pagina; `Game` y `GameMode` no tienen ciclo de `dispose()`.
- `BurnedMansionMaterials` carga texturas al margen de la cache ya precargada por `AssetManager`.
- El diagnostico de navegacion es opcional mediante `?zombieNavDebug` y permanece silencioso por defecto.

## Bugs relevantes detectados

- La simulacion empieza al construir `Game`, antes de pulsar START; rondas y zombies pueden avanzar tras el overlay (`src/core/Game.ts:91`, `src/core/Game.ts:288`, `src/core/Game.ts:552`).
- Una barrera totalmente destruida no puede seleccionarse para reparacion porque `isDamaged` excluye el estado abierto (`src/zombies/barriers/WindowBarrier.ts:81`, `src/modes/ZombiesMode.ts:495`).
- RESTART en el campo de tiro cierra la pausa sin volver a pedir pointer lock (`src/core/Game.ts:367`, `src/modes/ShootingRangeMode.ts`).
- La M1911 conserva reserva finita en el campo de tiro, aunque el contrato del modo declara reserva ilimitada (`src/config/weapons.ts`, `src/modes/ShootingRangeMode.ts`).
- La distancia reportada por balas cuenta dos veces parte del segmento de impacto (`src/shooting/BallisticsSystem.ts:172`, `src/shooting/trajectory.ts:47`).
- La muerte de un zombie asigna una Y absoluta durante el fade; los cadaveres del bunker suben hacia Y=0 (`src/zombies/Zombie.ts:232`).
- En tactil, movimiento y disparo siguen activos detras de la pantalla de game over (`src/core/Game.ts:565`, `src/modes/ZombiesMode.ts:174`).
- La musica de inicio de ronda no tiene caller de produccion; el loop de fondo se usa durante la pausa, no durante la partida (`src/audio/MusicManager.ts`, `src/core/Game.ts:348`).

## Funcionalidad pendiente representada en el codigo

- Sustituir la discriminacion por color antes de incorporar una tercera arma de energia (`docs/changes/2026-08-13-tesla-weapon.md`).
- El pipeline admite reemplazar modelos procedurales y ajustar la alineacion ADS heuristica mediante configuracion (`src/config/weapons.ts`, `src/weapons/WeaponView.ts`).
- Los fallbacks de modelos, texturas y audio forman parte del comportamiento esperado; no indican por si solos una carga pendiente.
- No hay marcadores `TODO` o `FIXME` activos en `src/`.
