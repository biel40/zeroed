# Estado del proyecto

Estado inspeccionado: 2026-08-25. La fuente de verdad es el codigo actual; `README.md` y algunas notas de `docs/changes/` describen estados anteriores.

## Sistemas funcionales

- Arranque WebGL, carga de GLB/texturas con fallback y selector directo entre los dos mapas Zombies (`src/main.ts`, `src/assets/AssetManager.ts`).
- PWA instalable con manifest, iconos, app shell offline, cache runtime de texturas/modelos/audio, actualizacion automatica al entrar desde navegador y actualizacion diferida hasta selector o pausa en standalone (`vite.config.ts`, `src/pwa.ts`, `docs/PWA.md`).
- Shell FPS compartido con render, input desktop/tactil, recuperacion de Pointer Lock, jugador, armas, balistica, efectos, audio, HUD, pausa real y perfiles de dispositivo (`src/core/Game.ts`).
- Armas declarativas con cadencia, modos de fuego, munición, recarga, ADS, dispersión y recoil; sus viewmodels GLB/procedurales no muestran manos del jugador y conservan recargas mecánicas diferenciadas sin controlar la munición (`src/config/weapons.ts`, `src/weapons/`).
- Balistica con gravedad/drag, raycast segmentado, prioridad de hitbox de cabeza y confirmacion visual/sonora especifica de headshot (`src/shooting/`, `src/modes/ZombiesMode.ts`, `src/ui/HUD.ts`, `src/audio/AudioSystem.ts`).
- Zombies `normal`, `shiny` y `brute` definidos mediante un registro extensible de tipos/modelos; Brute usa un GLB y clips originales, reservas visuales por modelo y máximo derivado de dos bajo el límite global de 24. Todos comparten combate y navegación con steering local, rutas de recuperación y failsafe (`src/modes/ZombiesMode.ts`, `src/zombies/`).
- Mystery Box, compras de pared, puertas por puntos, barreras reparables y recompensas centralizadas (`src/zombies/`, `src/game/PlayerEconomy.ts`).
- Ray Gun con proyectil y splash, garantizada a 115 bajas; ZEUS-77 con cadena electrica y resultado legendario raro de Mystery Box. Ambas mantienen pickups en el bunker.
- Pasos de zombie posicionales 3D con pool de 8 fuentes sobre un unico `AudioListener`, prioridad al mas cercano y asset opcional con fallback sintetizado (`src/zombies/ZombieFootsteps.ts`).
- Mapas Zombies `classic` y `burned-mansion`; la mansion incluye colision del jugador, progresion pagada de tres salas, ala este ampliada para la M4A1 y el acceso al bunker, bunker inferior ensanchado, escalera continua encerrada en un unico canal longitudinal compartido por jugador/zombies y final de 30000 puntos con creditos (`src/zombies/maps/`, `src/zombies/ZombiesRunFlow.ts`).
- Suite Vitest de logica determinista y contratos estaticos PWA; `npm run typecheck` y la validacion completa pasan.

## Sistemas parciales o limitados

- Los tests se ejecutan en Node: no cubren WebGL, DOM real, pointer lock, fullscreen, audio real ni flujos end-to-end de arranque/pausa/reinicio.
- La instalacion, el modo standalone y el Service Worker real requieren validacion manual en un build de produccion servido por HTTPS; Vitest solo verifica sus contratos estaticos.
- La IA usa rutas explicitas y steering contra AABB, no un navmesh global. El pathfinding A* por planta se activa cuando no existe linea de vision navegable y el anti-stuck fuerza una consulta posterior como fallback; los spawns siguen definidos en planta 0.
- La escalera del bunker usa escalones visuales sobre una pendiente continua ensanchada; dos rellenos macizos eliminan los pasillos laterales y fuerzan el recorrido entre el acceso superior y la salida inferior. El corredor zombie forma la cola en ambos rellanos, proyecta la separacion sobre la pendiente y cambia la identidad de planta sin teletransporte.
- Tablas de barrera, Mystery Box, wall buys y pickups son principalmente visuales/logicos; varios no forman parte de la colision fisica o balistica.
- Existen los modelos zombie `walker` y `brute`; Shiny es un tratamiento material del walker. M60, M1911, Ray Gun y ZEUS-77 usan modelos procedurales.
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
