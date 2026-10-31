# Estado del proyecto

**Corte:** 2026-10-25. La fuente de verdad es el codigo actual. Para comportamientos consulta [sistemas](GAME_SYSTEMS.md), para contratos [arquitectura](ARCHITECTURE.md) y para motivos [decisiones](DECISIONS.md).

## Funcional

- Shell FPS para escritorio, tactil y mandos con mapeo estandar del navegador, selector de mapas, ajustes, audio y consola de desarrollo en individual. Consulta [shell y controles](GAME_SYSTEMS.md#shell-compartido), [mandos](GAME_SYSTEMS.md#mandos) y [consola](GAME_SYSTEMS.md#consola-de-desarrollador).
- Posturas de pie, agachado y tumbado en individual y cooperativo, con controles
  tactiles y representacion del compañero. Consulta [controles](GAME_SYSTEMS.md#shell-compartido)
  y [replica cooperativa](MULTIPLAYER.md#alcance-y-límites).
- Burned Mansion tiene acceso publico individual y cooperativo. Station 33 es individual y premium de presentacion; aparece bloqueado en el menu y temporalmente requiere un correo de la lista de beta para abrirse, tambien por enlace directo. El permiso es local y no verifica la titularidad del correo: consulta [acceso de beta](../public/beta/README.md). Direccion artistica en [Station 33](STATION_33.md). Su final es el easter egg de evacuacion Protocolo 33, hasta la superficie; consulta [evacuacion](GAME_SYSTEMS.md#mapas-e-interacciones).
- Combate, rondas, economia, progresion, enemigos y anillos estan disponibles en individual; el alcance cooperativo se detalla en [MULTIPLAYER.md](MULTIPLAYER.md#alcance-y-límites). Consulta [zombies](GAME_SYSTEMS.md#zombies) y [anillos](GAME_SYSTEMS.md#anillos).
- PWA instalable y distribucion Android preparada; consulta [PWA](PWA.md) y [Android](ANDROID_DOCS.md).
- El relay cooperativo local y el Worker de Cloudflare estan preparados; consulta [despliegue](MULTIPLAYER.md#despliegue-gratuito-vercel--cloudflare).

## Limitaciones y bugs abiertos

- Mandos: falta validacion con hardware y navegadores reales. Los layouts no
  estandar se rechazan; Steam Input depende de como el navegador expone el
  dispositivo. Detalles en [mandos](GAME_SYSTEMS.md#mandos).

- No hay pruebas de WebGL, DOM real, Pointer Lock, fullscreen, audio real ni
  flujo end-to-end. PWA y offline requieren validacion manual en HTTPS.
- El Protocolo 33 es solo individual, como Station 33: su estado no se
  replica ni existe en cooperativo. La salida, la superficie, su ambiente y
  el rendimiento movil con la horda del evento estan pendientes de validacion
  manual en el juego.
- Antes del primer START la simulacion puede avanzar; game over tactil aun
  puede recibir movimiento/disparo.
- Barreras totalmente destruidas no siempre entran en reparacion; el cambio de
  arma tactil debe cancelar reparacion.
- RESTART necesita reset verificable de toda la run. Distancias de impacto y
  fade vertical de cadaveres tienen casos pendientes.
- El registro de colliders dinamicos necesita consolidacion.
- Energia aun se distingue por color. Existen flags de debug que deben
  blindarse o retirarse.
- La suite de tests puede contener expectativas antiguas de headshots o casos
  de navegacion no deterministas.
- Cooperativo de dos jugadores: las puertas empiezan cerradas y el
  anfitrion cobra solo al comprador. La municion del invitado sigue en su
  cliente; faltan pruebas manuales de sesiones reales con latencia. El compañero usa
  `public/assets/players/soldier.glb` con fallback procedural. Falta validar
  juego completo entre navegadores con Pointer Lock, latencia y Android.

## Fuente complementaria

[V0.9.md](V0.9.md) y [AUDIT_V1_0.md](AUDIT_V1_0.md) son historicos; [ROADMAP.md](ROADMAP.md) recoge trabajo previsto. El codigo prevalece sobre estos documentos.
