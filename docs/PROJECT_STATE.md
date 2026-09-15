# Estado del proyecto

**Corte:** 2026-09-15. La fuente de verdad es el codigo actual.

## Funcional

- Entrada WebGL, menu Zombies, mapas `classic` y `burned-mansion`, carga de
  assets con fallback y shell FPS compartido desktop/tactil.
- Armas declarativas, balistica segmentada, energia, headshots, recargas,
  economia, rondas, Mystery Box, wall buys, barreras, puertas y pickups.
- Zombies normal/shiny/brute con pool global 24, navegacion con A* y anti-stuck,
  melee validado, pasos 3D, Ray Gun a 115 bajas y ZEUS-77 legendaria.
- Burned Mansion con dos plantas, bunker, escalera continua, progresion pagada,
  nueve ventanas y sala secreta de lamparas/almas. Final de 30000 Points.
- PWA instalable, cache runtime y actualizacion diferenciada entre navegador y
  standalone. Capacitor prepara distribucion Android.

## Limitaciones y bugs abiertos

- No hay pruebas de WebGL, DOM real, Pointer Lock, fullscreen, audio real ni
  flujo end-to-end. PWA y offline requieren validacion manual en HTTPS.
- Antes del primer START la simulacion puede avanzar; game over tactil aun
  puede recibir movimiento/disparo.
- Barreras totalmente destruidas no siempre entran en reparacion; el cambio de
  arma tactil debe cancelar reparacion.
- RESTART necesita reset verificable de toda la run. Distancias de impacto y
  fade vertical de cadaveres tienen casos pendientes.
- La musica al reanudar, la cache de texturas de Burned Mansion y el registro de
  colliders dinamicos necesitan consolidacion.
- Energia aun se distingue por color; cambiar modo/mapa requiere recarga por
  falta de `dispose()`. Existen flags de debug que deben blindarse o retirarse.
- La suite de tests puede contener expectativas antiguas de headshots o casos
  de navegacion no deterministas.

## Fuente complementaria

`V0.9.md` resume el producto; `ROADMAP.md` ordena el trabajo; `ARCHITECTURE.md`
describe fronteras; `GAME_SYSTEMS.md` describe runtime; `PWA.md` y
`ANDROID_DOCS.md` describen distribucion.
