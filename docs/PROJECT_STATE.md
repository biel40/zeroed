# Estado del proyecto

Estado inspeccionado: 2026-08-20. La fuente de verdad es el codigo actual; `README.md` y algunas notas de `docs/changes/` describen estados anteriores.

## Sistemas funcionales

- Arranque WebGL, carga de GLB/texturas con fallback y selector directo entre los dos mapas Zombies (`src/main.ts`, `src/assets/AssetManager.ts`).
- PWA instalable con manifest, iconos, app shell offline, cache runtime de texturas/modelos/audio y actualizaciones diferidas hasta selector o pausa (`vite.config.ts`, `src/pwa.ts`, `docs/PWA.md`).
- Shell FPS compartido con render, input desktop/tactil, recuperacion de Pointer Lock, jugador, armas, balistica, efectos, audio, HUD, pausa real y perfiles de dispositivo (`src/core/Game.ts`).
- Armas declarativas con cadencia, modos de fuego, municion, recarga, ADS, dispersion, recoil y view models GLB/procedurales (`src/config/weapons.ts`, `src/weapons/`).
- Balistica con gravedad/drag, raycast segmentado y prioridad de hitbox de cabeza (`src/shooting/`).
- Zombies con salud, Points, inventario de dos slots, rondas infinitas, pool de 24 enemigos, ataques y navegacion con steering local, rutas de recuperacion y failsafe de recolocacion (`src/modes/ZombiesMode.ts`, `src/zombies/`).
- Mystery Box, compras de pared, puertas por puntos, barreras reparables y recompensas centralizadas (`src/zombies/`, `src/game/PlayerEconomy.ts`).
- Ray Gun con proyectil y splash; ZEUS-77 con cadena electrica; desbloqueos por bajas y pickups de ambas armas en el bunker.
- Pasos de zombie posicionales 3D con pool de 8 fuentes sobre un unico `AudioListener`, prioridad al mas cercano y asset opcional con fallback sintetizado (`src/zombies/ZombieFootsteps.ts`).
- Mapas Zombies `classic` y `burned-mansion`; la mansion incluye colision del jugador, progresion pagada de tres salas, bunker ampliado, escalera continua compartida por jugador/zombies y final de 30000 puntos con creditos (`src/zombies/maps/`, `src/zombies/ZombiesRunFlow.ts`).
- Suite Vitest de logica determinista y contratos estaticos PWA. `npm run typecheck` pasa; la validacion completa conserva fallos preexistentes detectados en audio y seleccion de mapa.

## Sistemas parciales o limitados

- Los tests se ejecutan en Node: no cubren WebGL, DOM real, pointer lock, fullscreen, audio real ni flujos end-to-end de arranque/pausa/reinicio.
- La instalacion, el modo standalone y el Service Worker real requieren validacion manual en un build de produccion servido por HTTPS; Vitest solo verifica sus contratos estaticos.
- La IA usa rutas explicitas y steering contra AABB, no un navmesh global. El pathfinding A* por planta se activa cuando no existe linea de vision navegable y el anti-stuck fuerza una consulta posterior como fallback; los spawns siguen definidos en planta 0.
- La escalera del bunker usa escalones visuales sobre una pendiente continua y un corredor zombie que forma la cola en ambos rellanos, proyecta la separacion sobre la pendiente y cambia la identidad de planta sin teletransporte.
- Tablas de barrera, Mystery Box, wall buys y pickups son principalmente visuales/logicos; varios no forman parte de la colision fisica o balistica.
- Solo existe la variante zombie `walker`. M60, M1911, Ray Gun y ZEUS-77 usan modelos procedurales.
- Los proyectiles de energia comparten un alcance fijo de 80 m y su comportamiento solo distingue Tesla de Ray Gun por color.
- Cambiar de modo o mapa requiere recargar la pagina; `Game` y `GameMode` no tienen ciclo de `dispose()`.
- `BurnedMansionMaterials` carga texturas al margen de la cache ya precargada por `AssetManager`.
- El diagnostico de navegacion es opcional mediante `?zombieNavDebug` y permanece silencioso por defecto.

## Bugs relevantes detectados

- Una barrera totalmente destruida no puede seleccionarse para reparacion porque `isDamaged` excluye el estado abierto (`src/zombies/barriers/WindowBarrier.ts:81`, `src/modes/ZombiesMode.ts:495`).
- La distancia reportada por balas cuenta dos veces parte del segmento de impacto (`src/shooting/BallisticsSystem.ts:172`, `src/shooting/trajectory.ts:47`).
- La muerte de un zombie asigna una Y absoluta durante el fade; los cadaveres del bunker suben hacia Y=0 (`src/zombies/Zombie.ts:232`).
- En tactil, movimiento y disparo siguen activos detras de la pantalla de game over (`src/core/Game.ts:565`, `src/modes/ZombiesMode.ts:174`).

## Funcionalidad pendiente representada en el codigo

- Sustituir la discriminacion por color antes de incorporar una tercera arma de energia (`docs/changes/2026-08-13-tesla-weapon.md`).
- El pipeline admite reemplazar modelos procedurales y ajustar la alineacion ADS heuristica mediante configuracion (`src/config/weapons.ts`, `src/weapons/WeaponView.ts`).
- Los fallbacks de modelos, texturas y audio forman parte del comportamiento esperado; no indican por si solos una carga pendiente.
- No hay marcadores `TODO` o `FIXME` activos en `src/`.
