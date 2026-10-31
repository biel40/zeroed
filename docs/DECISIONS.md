# Decisiones arquitectonicas vigentes

- **Shell comun y modos aislados.** `Game` posee servicios compartidos; cada
  `GameMode` recibe un `ModeContext`. Individual y cooperativo comparten loop
  sin compartir estado de run.
- **Mapas por registro.** La run y los modos no dependen de un mapa concreto: el registro y `ZombieArena` separan seleccion, capacidades y geometria. Classic se retiro por decision del usuario. El cooperativo usa un mapa fijo sin negociacion; el acceso premium es presentacion mientras no haya pagos. Contratos en [arquitectura](ARCHITECTURE.md#contratos) y estado en [mapas](GAME_SYSTEMS.md#mapas-e-interacciones).
- **Logica separada de vistas.** Armas, economia, rondas, salud, Mystery Box,
  barreras, puertas, anillos, trayectorias y cadena Tesla son testeables sin
  Three.js.
- **Anillos como perks.** Las perks de Zeroed son anillos: uno por dedo, cada
  anillo con su dedo fijo para que su sitio en la mano sea predecible, y la
  mano en primera persona como senal principal (el HUD solo apoya). Su efecto
  es dato en la definicion mas un gancho en el modo; no hay un framework de
  modificadores. Las maquinas son una capacidad opcional del mapa.
- **Station 33 es el mapa base.** Las piezas y capacidades reutilizables se comparten entre mapas para evitar copias y dependencia de una arena. Las fronteras estan en [arquitectura](ARCHITECTURE.md#contratos); la intencion visual, en [Station 33](STATION_33.md).
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
  el bunker conserva su collider hasta terminar la apertura; las puertas normales abren la topologia al comprarse.
- **Sala secreta desacoplada.** `ZombiesMode` envia muertes; el estado puro
  gobierna progreso y el sistema del mapa posee vistas, pool, pared y reset.
- **Evacuacion como run, no como mapa.** Coste, temporizadores, horda y
  desenlace de una evacuacion (`ArenaEvacuation`) son estado de la run:
  los decide el modo con un estado puro, de modo que una autoridad futura
  pueda replicarlo; el mapa solo aporta datos y presentacion. El Protocolo 33
  es solo individual porque Station 33 lo es.
- **Cooperativo con autoridad unica del anfitrion.** `CoopHostMode` simula todo
  el estado compartido; `CoopGuestMode` replica e interpola. El relay solo
  empareja y reenvia mensajes. La pausa del anfitrion detiene la simulacion compartida; la del invitado es local. `ZombiesMode` no necesita red. Ver [cooperativo](MULTIPLAYER.md#alcance-y-límites).
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

- **Mando nativo antes de la frontera de gameplay.** Gamepad API estandar,
  estado separado por adaptador y acciones compartidas; sin dependencias ni
  mensajes de red nuevos. Se rechazan layouts desconocidos para evitar
  acciones accidentales. Recarga e interaccion tienen botones distintos:
  los prompts pueden describir requisitos pendientes y reparar usa una accion
  mantenida; no sirven para decidir si debe recargarse un arma. Contratos en
  [arquitectura](ARCHITECTURE.md#contratos) y motivos de la asignacion en
  [la nota de cambio](changes/native-gamepad.md).

- **Armas exclusivas de mapa como dato del registro.** Un mapa declara en
  `ZombieMapDefinition.exclusiveWeapons` las armas que solo el reparte (la
  ФАКЕЛ-33 en Station 33); `ZombiesMode` las precarga solo en ese mapa y las
  vende su `ArenaWeaponStation`. Nunca entran en la Mystery Box, en
  `ZOMBIES_WEAPON_PRELOAD` ni en el cooperativo, y el modo no conoce el mapa.
- **Variantes de arma por mapa como reskin, no como arma nueva.** Un mapa
  puede cambiar el nombre y el modelo de un arma compartida
  (`ZombieMapDefinition.weapons`, construido con `reskinWeapons`; el PTRS-41
  sustituye al Barrett en Station 33) conservando su `WeaponId`. Asi
  inventario, Mystery Box, baules, red y efectos ligados al id siguen
  intactos y el equilibrio no se duplica.

## Deudas de contrato

Identificar energia por arma/tipo y no por color; registrar propiedad de
colliders dinamicos; reutilizar cache de `AssetManager` y alinear
`cameraShare`, `acceptsDecals` y `reserveAmmoFor` con el codigo real.
