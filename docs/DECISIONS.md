# Decisiones arquitectonicas vigentes

- **Shell comun y modos aislados.** `Game` posee servicios compartidos; cada
  `GameMode` recibe un `ModeContext`. Individual y cooperativo comparten loop
  sin compartir estado de run.
- **Mapas por registro.** Burned Mansion y Station 33 son los mapas jugables;
  Station 33 es solo individual, sera de pago y por ahora es un stub. `zombieMaps.ts`
  declara por mapa visibilidad, nombre i18n, soporte cooperativo, si es premium
  y factoria de arena; los modos la resuelven por `mapId`. Mientras no exista
  un sistema de pagos, `premium` solo cambia la presentacion: la beta cerrada
  juega todos los mapas visibles. `ZombieArena` mantiene geometria,
  colliders, spawns, barreras, puertas, ambiente, musica y final fuera de la
  logica de la run; lo exclusivo de un mapa (almas, faroles, ritual y sala
  secreta de la mansion) es una capacidad opcional consultada con type guard.
  El cooperativo usa un unico mapa (`COOP_ZOMBIE_MAP_ID`) sin negociarlo en el
  protocolo. El campo de tiro/Classic se retira por decision del usuario.
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
- **Muertes procedurales por estilo, no ragdoll.** Cada estilo es un perfil de
  curvas en espacio corporal horneado a clip por rig (IK de brazos y piernas,
  enderezado del encorvamiento y restriccion de suelo sobre la malla). Sin
  fisica en el loop ni assets nuevos, y el estilo viaja como dato en red.
- **Navegacion recuperable.** Steering es el camino barato; A* por planta,
  ajuste local y recolocacion validada son fallback, no un navmesh continuo.
- **PWA fuera del gameplay.** Workbox precachea shell y cachea assets pesados
  bajo demanda; navegador actualiza al entrar y standalone espera a selector o
  pausa.
- **Burned Mansion fisico.** La escalera es una pendiente continua; colliders de
  puertas y paredes permanecen hasta que la animacion termina.
- **Sala secreta desacoplada.** `ZombiesMode` envia muertes; el estado puro
  gobierna progreso y el sistema del mapa posee vistas, pool, pared y reset.
- **Cooperativo con autoridad unica del anfitrion.** `CoopHostMode` simula todo
  el estado compartido; `CoopGuestMode` replica e interpola. El relay solo
  empareja y reenvia (nunca mensajes reservados del propio relay). La pausa
  multijugador es local (`sharedSimulation`). `ZombiesMode` sigue local y no
  necesita red.
- **Idioma solo desde el menu principal.** Espanol, ingles y catalan viven en
  `src/i18n/`; `en.ts` define las claves y los demas diccionarios deben
  cubrirlas. El HTML declara textos con `data-i18n`, el codigo usa `t()` al
  renderizar y los datos del mapa guardan claves, no frases. La eleccion se
  recuerda en `localStorage`; sin ella se usa el idioma del navegador.
- **Calidad grafica por niveles y resolucion dinamica.** El jugador elige
  Baja/Media/Alta en Ajustes, solo cuando lo abre desde el menu principal
  (desde pausa esa fila se oculta); sin eleccion manda la deteccion del
  dispositivo. La resolucion se adapta sola al tiempo de frame dentro del
  limite de la calidad, sin tocar el numero de luces durante la partida para
  no recompilar shaders.
- **Ajustes del jugador en vivo.** `PlayerSettings` es la unica fuente de
  volumenes, sensibilidad, eje Y y campo de vision; se guarda en
  `localStorage` y se puede cambiar en mitad de la partida. La calidad grafica
  y el idioma siguen siendo solo del menu principal: el idioma, en un
  desplegable con banderas en la esquina del panel.

## Deudas de contrato

Identificar energia por arma/tipo y no por color; registrar propiedad de
colliders dinamicos; reutilizar cache de `AssetManager` y alinear
`cameraShare`, `acceptsDecals` y `reserveAmmoFor` con el codigo real.
