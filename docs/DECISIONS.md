# Decisiones arquitectonicas vigentes

- **Shell comun y modos aislados.** `Game` posee servicios compartidos; cada
  `GameMode` recibe un `ModeContext`. Asi Classic y Burned Mansion comparten
  loop sin compartir estado de run.
- **Mapas como estrategia.** Una sola `ZombiesMode` usa `ZombieArena`; el arena
  posee geometria, colliders, spawns, barreras, puertas y ambiente.
- **Logica separada de vistas.** Armas, economia, rondas, salud, Mystery Box,
  barreras, puertas, trayectorias y cadena Tesla son testeables sin Three.js.
- **Armas declarativas.** `WeaponDefinition` concentra cadencia, dano, recoil,
  municion, ADS, proyectil y presentacion; no hay subclases por arma.
- **Economia por autoridad.** `PlayerEconomy` centraliza Points; el modo decide
  reservas de municion para no contaminar definiciones compartidas.
- **Pools fijos.** Proyectiles, zombies, efectos, pasos y drops se reciclan para
  controlar memoria y garbage collection en el loop.
- **Tipos y modelos zombie separados.** Un tipo puede compartir walker o
  reservar un asset propio; el maximo activo global es 24.
- **Navegacion recuperable.** Steering es el camino barato; A* por planta,
  ajuste local y recolocacion validada son fallback, no un navmesh continuo.
- **PWA fuera del gameplay.** Workbox precachea shell y cachea assets pesados
  bajo demanda; navegador actualiza al entrar y standalone espera a selector o
  pausa.
- **Burned Mansion fisico.** La escalera es una pendiente continua; colliders de
  puertas y paredes permanecen hasta que la animacion termina.
- **Sala secreta desacoplada.** `ZombiesMode` envia muertes; el estado puro
  gobierna progreso y el sistema del mapa posee vistas, pool, pared y reset.

## Deudas de contrato

Identificar energia por arma/tipo y no por color; registrar propiedad de
colliders dinamicos; reutilizar cache de `AssetManager`; implementar `dispose()`
y alinear `cameraShare`, `acceptsDecals` y `reserveAmmoFor` con el codigo real.
