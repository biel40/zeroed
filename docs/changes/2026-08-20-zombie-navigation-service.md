# Servicio central de navegacion zombie (pathfinding A* por planta)

**Que**: la persecucion del zombi ya no depende del rodeo reactivo de paredes.
Nuevo `ZombieNavigationService` con un grid de navegabilidad por planta
(`NavigationGrid`, A* octile + suavizado por linea de vision). Cuando la linea
recta al objetivo esta bloqueada, el zombi adopta una ruta de waypoints que
pasa por puertas y pasillos; la persecucion directa solo se usa con trayecto
navegable despejado.

**Por que**: en Burned Mansion los zombis empujaban paredes interiores
indefinidamente (el rodeo tangente es local y puede comprometerse al lado
equivocado de una pared; su condicion de salida exige LOS completa al
jugador, inalcanzable con una habitacion de por medio). El unico pathfinding
real era un BFS local post-fallo. El test `routes from the start room to the
east hall only through the open doors` lo demostro en rojo: el zombi cruzaba
el mapa via teleport del failsafe tras 9 s atascado, no por las puertas.

**Donde**:
- `src/zombies/navigation/NavigationGrid.ts` — grid puro por planta (celdas
  de 0.35 m, obstaculos inflados con el radio del cuerpo, A* con heap y
  buffers reutilizados, sin cortar esquinas en diagonal, suavizado greedy).
  TypeScript puro: cero imports de three, tests sin WebGL.
- `src/zombies/navigation/ZombieNavigationService.ts` — grids por planta +
  `version` que invalida rutas al reconstruir.
- `src/zombies/ZombieManager.ts` — `seek()` pide ruta cuando no hay LOS;
  presupuesto de 2 A*/frame con cola FIFO; recalculo si el objetivo se mueve
  >1.5 m, si cambia la topologia (version) o si la ruta expira; cooldowns
  ante rutas imposibles. El anti-stuck se mantiene y su BFS local se elimina:
  la recuperacion ahora es una consulta forzada al mismo servicio.
- Puertas: su hoja cerrada ya era un collider; al abrirse desaparece de
  colliders y `registerColliders` reconstruye los grids. Sin coordenadas de
  puerta en la IA.
- Barreras: las tablas nunca fueron colliders fisicos (son estado de juego),
  asi que las ventanas cerradas se inyectan como volumenes de navegacion
  mientras la barrera no este abierta; una firma de bits por frame detecta
  apertura/reparacion y reconstruye. Sin esto, las rutas atravesaban
  ventanas atrincheradas.
- `ZombieNavigationBounds` gana `baseY?` para el grid multiplanta (bunker a
  -3.4). Mapas futuros solo declaran bounds + colliders + puertas/barreras.

**Como se valida**: `tests/zombieNavigation.test.ts` (9 tests puros del
servicio: hueco unico, puerta cerrada → null → apertura → ruta, snap de
extremos, aislamiento por planta y banda vertical, sin corte de esquinas) y
tres tests de integracion en `tests/burnedMansion.test.ts` (ruta por ambas
puertas con aserciones de cruce por el vano, puerta cerrada = jamas cruza,
peticion proactiva de ruta al primer frame con LOS bloqueada).

**Aprendido**:
- El failsafe de recolocacion puede ENMASCARAR la ausencia de pathfinding:
  un zombi "que llega" por teleport es indistinguible de uno que navega salvo
  que el test asegure POR DONDE cruzo (aserciones de vano de puerta).
- Las barreras de ventana son gameplay-only por diseño (el zombi para y
  ataca por `barrierTarget`); cualquier capa nueva de navegacion debe
  modelarlas como obstaculos o las rutas las atravesaran como quesitos.
- El grid se deriva del mismo snapshot de obstaculos que usa el integrador de
  movimiento (`rebuildObstacles`): imposible que la ruta y la fisica
  discrepen.
- Coste medido: rebuild del grid de la mansion (~9.5k celdas) solo ocurre en
  eventos de puerta/barrera; A* por consulta es despreciable y el presupuesto
  de 2/frame mantiene el frame budget con 24 zombis.
