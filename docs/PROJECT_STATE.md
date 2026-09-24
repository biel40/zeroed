# Estado del proyecto

**Corte:** 2026-09-24. La fuente de verdad es el codigo actual.

## Funcional

- Entrada WebGL, menu Zombies, mapa `burned-mansion`, carga de
  assets con fallback y shell FPS compartido desktop/tactil.
- Armas declarativas, balistica segmentada, energia, headshots, recargas,
  economia, rondas, Mystery Box, wall buys, barreras, puertas y pickups.
- Zombies normal/shiny/brute con pool global 24, navegacion con A* y anti-stuck,
  melee validado, pasos 3D, Ray Gun a 115 bajas y ZEUS-77 legendaria.
- Burned Mansion con dos plantas, bunker, escalera continua, progresion pagada,
  nueve ventanas y sala secreta de lamparas/almas. Final de 30000 Points.
- PWA instalable, cache runtime y actualizacion diferenciada entre navegador y
  standalone. Capacitor prepara distribucion Android.
- Música diferenciada para partida y menú/pausa, con reanudación de la pista de
  partida desde su posición anterior y cue independiente al iniciar ronda.
- Cooperativo privado de dos jugadores en Burned Mansion: autoridad del
  anfitrion, servidor de salas WebSocket, replica de jugadores/zombis, arsenal
  completo, Mystery Box y progresion compartida de mapa. El modo
  individual conserva su ruta local y offline. Ver `MULTIPLAYER.md`.
- Relay Cloudflare Worker con Durable Object por sala preparado para despliegue;
  el frontend Vercel apunta al Worker mediante `VITE_COOP_SERVER_URL`.

## Limitaciones y bugs abiertos

- No hay pruebas de WebGL, DOM real, Pointer Lock, fullscreen, audio real ni
  flujo end-to-end. PWA y offline requieren validacion manual en HTTPS.
- Antes del primer START la simulacion puede avanzar; game over tactil aun
  puede recibir movimiento/disparo.
- Barreras totalmente destruidas no siempre entran en reparacion; el cambio de
  arma tactil debe cancelar reparacion.
- RESTART necesita reset verificable de toda la run. Distancias de impacto y
  fade vertical de cadaveres tienen casos pendientes.
- La cache de texturas de Burned Mansion y el registro de colliders dinamicos
  necesitan consolidacion.
- Energia aun se distingue por color. Existen flags de debug que deben
  blindarse o retirarse.
- La suite de tests puede contener expectativas antiguas de headshots o casos
  de navegacion no deterministas.
- Cooperativo de dos jugadores: las puertas empiezan cerradas y el
  anfitrion cobra solo al comprador. La municion del invitado sigue en su
  cliente; faltan pruebas manuales de sesiones reales con latencia. El compañero usa un cuerpo procedural de
  reserva hasta que exista `public/assets/players/soldier.glb`. Falta validar
  juego completo entre navegadores con Pointer Lock, latencia y Android.

## Fuente complementaria

`V0.9.md` conserva el resumen historico de esa version; `ROADMAP.md` ordena el trabajo; `ARCHITECTURE.md`
describe fronteras; `GAME_SYSTEMS.md` describe runtime; `PWA.md` y
`ANDROID_DOCS.md` describen distribucion.
