# Línea base de rendimiento de ZEROED

Hito 0 · 10 de noviembre de 2026. Referencia histórica en la [auditoría de mapas grandes](AUDIT_LARGE_MAPS.md), realizada sobre `4d1fc96`. Las mediciones de esta página corresponden al checkout de ese mismo commit con cambios de juego locales ya presentes. Los resultados de Node y del build son medidos. Las cifras de memoria de cuadrículas son cálculos a partir del código. Los presupuestos de dispositivo son provisionales.

## Repetir las pruebas sin navegador

```powershell
$env:ZEROED_PERF = '1'
npm run test -- tests/zombieArenaContract.test.ts tests/navigationPerformance.test.ts --maxWorkers=1 --no-file-parallelism --testNamePattern 'scene budget|Navigation scaling'
Remove-Item Env:ZEROED_PERF
npm run build
```

Ejecutar la sonda sin otros builds o pruebas en paralelo y repetir en el mismo equipo al comparar hitos. Cada escenario imprime una fila JSON. `npm run test` ejecuta las comprobaciones estructurales y de rutas con independencia de la variable de entorno. Los tiempos son diagnósticos.

### Escena y construcción

La sonda de arenas usa los mapas del registro, los cuatro perfiles de calidad reales, una semilla fija por escenario y el observador en el spawn. Toma una muestra al inicio y otra con las puertas comprables desbloqueadas y sus animaciones avanzadas, antes de la evacuación y los finales. `buildMs` mide una construcción y `init`. `updateMs` promedia 120 llamadas al `update` de la arena tras 30 de calentamiento. `refreshMs` promedia 30 pares de `refreshColliders` y `refreshSpawnPoints`. Los dos promedios usan el estado desbloqueado. [Sonda de arenas](../tests/zombieArenaContract.test.ts)

El recuento abarca el grupo del mapa. «Elegible» exige visibilidad propia, de ancestros y de algún material, además de capa 0, antes del frustum. Los triángulos nominales de malla incluyen instancias y usan los índices o vértices completos. Los MiB de geometría suman atributos e índices por geometría única. Las llamadas y triángulos de `renderer.info` se recogen en la prueba manual. [Recuento](../tests/arenaMetrics.ts)

Windows x64, Core Ultra 7 155H, Node 24.16.0, Vitest 3.2.7. Los intervalos de la tabla son mínimos y máximos entre Baja, Media y Alta.

| Métrica | Burned Mansion | Station 33 |
| --- | ---: | ---: |
| Objetos dibujables totales | 619–639 | 905–923 |
| Objetos elegibles al inicio / desbloqueado | 378–383 / 340–351 | 695–698 / 635–638 |
| Triángulos nominales totales | 81.374 | 170.865–178.257 |
| Triángulos elegibles al inicio / desbloqueado | 53.237 / 48.237 | 158.889–166.281 / 156.809–164.201 |
| Geometrías únicas / materiales únicos | 494 / 172–192 | 758 / 208–226 |
| MiB de geometría / instancias | 5,40–5,41 / 675 | 14,38–15,08 / 0 |
| Colliders balísticos / cajas de movimiento, inicio | 90 / 76 | 272 / 191 |
| Colliders balísticos / cajas de movimiento, desbloqueado | 86 / 72 | 267 / 186 |
| Construcción por perfil Baja / Media / Alta | 721 / 153 / 118 ms | 639 / 208 / 193 ms |
| Media de `arena.update`, desbloqueado | 0,014–0,028 ms | 0,012–0,018 ms |
| Media de refresh de colliders y spawns | 0,24–0,37 ms | 0,16–0,21 ms |

La primera construcción de cada mapa incluye el primer horneado de sus texturas en el proceso. Los perfiles siguientes se benefician de caché y JIT. Estos tiempos excluyen canvas real, subida de texturas, compilación de shaders y el arranque del modo. Las cifras de objetos totales y tamaños de escena son del mismo orden que en la auditoría. Su recuento al spawn tenía otro filtro de visibilidad, por lo que la diferencia de objetos elegibles carece de valor como mejora medida.

### Navegación

Los límites declarados de Burned Mansion tienen 11.868 + 1.767 celdas y los de Station 33 tienen 39.960 + 7.004. Cada cuadrícula asigna `81 × celdas + 8` bytes en arrays tipados. El gestor crea una por planta **y por radio distinto** (0,42 y 0,46 m). Eso supone unos **2,11 MiB** en Burned Mansion y **7,26 MiB** en Station 33, excluyendo objetos, rutas y transitorios de reconstrucción. La auditoría reportaba el coste de un juego de cuadrículas. [Cuadrícula](../src/zombies/navigation/NavigationGrid.ts) · [Gestor](../src/zombies/ZombieManager.ts)

El escenario sintético usa una planta, celdas de 0,35 m, radio de 0,42 m, pilares cada 6 m y un único paso de 2,8 m en un divisor. Busca entre esquinas opuestas con el paso abierto y sellado. Verifica llegada, continuidad de despeje, ausencia de ruta con el cierre y recuperación al reabrir. La reconstrucción usa 20 muestras y cada búsqueda 30 tras cinco consultas de calentamiento. Los pares son mediana / p95 en ms. La memoria es por cuadrícula. [Escenario sintético](../tests/navigationPerformance.test.ts)

| Planta | Celdas | Arrays (MiB) | Reconstrucción | Ruta abierta | Ruta sin salida |
| --- | ---: | ---: | ---: | ---: | ---: |
| 40 × 40 m | 13.225 | 1,02 | 0,40 / 0,47 | 0,94 / 1,41 | 2,02 / 2,40 |
| 80 × 60 m | 39.388 | 3,04 | 0,37 / 0,53 | 2,84 / 3,23 | 6,39 / 7,83 |
| 120 × 90 m | 88.494 | 6,84 | 0,68 / 1,08 | 6,80 / 7,23 | 14,73 / 15,93 |
| 200 × 150 m | 245.388 | 18,96 | 2,01 / 2,74 | 14,40 / 16,13 | 41,58 / 43,89 |

El divisor hace el caso más exigente que el de pilares de la auditoría. El resultado de 41,58 ms corresponde a una consulta síncrona sin ruta, suficiente para superar un frame de 33,3 ms por sí sola en esa máquina. El contador de dos rutas por actualización limita solicitudes de persecución. Cada consulta aún puede agotar su región accesible y la comprobación de reubicación también llama a `findPath`. Una medición de reconstrucción de una sola cuadrícula excluye las demás plantas, el segundo radio y la recolección de colliders del gestor. [Servicio de navegación](../src/zombies/navigation/ZombieNavigationService.ts) · [Gestor](../src/zombies/ZombieManager.ts)

### Build y carga

Vite 7.3.6 generó una entrada JS de **2.010,26 kB minificados / 602,42 kB gzip**. Workbox registró **13 entradas / 2.142,79 KiB** de precache. La auditoría dio 1.989,9 kB / 595,3 kB gzip. La diferencia de unos 20,4 kB minificados se observa sobre el checkout de trabajo y no se atribuye a un cambio concreto. El registro importa ambas arenas de forma estática, `startGame` construye el modo tras pintar el overlay y el precache recoge todos los JS generados. Extraer módulos por sí solo podría mantener la descarga anticipada del mapa premium vía Workbox. La transferencia de red y los tiempos de carga percibidos quedan pendientes de traza. [Registro](../src/config/zombieMaps.ts) · [Arranque](../src/main.ts) · [Vite y PWA](../vite.config.ts)

El arranque precarga modelos y texturas del manifiesto global. La precarga de música se dispara al reanudar el audio de partida y recorre los temas sin `lazy`, incluido el de Station 33 aunque se esté entrando en Burned Mansion. Para el hito de carga diferida conviene medir por separado el selector y el primer arranque de partida. [Arranque](../src/main.ts) · [Audio](../src/audio/AudioSystem.ts) · [Música](../src/audio/MusicManager.ts)

## Protocolo manual de escritorio y Android

`?debug` activa el HUD de diagnóstico desde el inicio. `MOTDRULES` también lo activa durante la partida individual. Actualiza cada 250 ms de simulación e informa de FPS suavizados, escala de resolución, llamadas y triángulos del último render, geometrías y texturas registradas. Como la simulación limita `dt` a 50 ms, usar la traza de frames y de tareas para percentiles y pausas largas. Registrar el tiempo GPU o los bytes GPU si la plataforma los expone. [Game](../src/core/Game.ts)

La descripción anterior corresponde al HUD de esta línea base. El [panel actual](GAME_SYSTEMS.md#hud-de-rendimiento) mide intervalos reales e incluye P95 y peor frame de su historial reciente; las trazas del protocolo siguen siendo necesarias para ventanas largas y tiempos CPU/GPU.

1. Preparar el build de producción y servirlo con `npm run preview` en escritorio. Usar `/?debug` y abrir cada mapa desde el selector, o `/?debug&map=burned-mansion` y `/?debug&map=station-33` con el acceso correspondiente. En Android instalar el APK debug del mismo código y abrir el WebView desde `chrome://inspect` con depuración USB. Para pedir el HUD desde el selector, ejecutar `location.search = '?debug'` en su consola y esperar a que vuelva a cargar. Registrar commit y cambios locales, versión del build, equipo o modelo, SO, versión de navegador o WebView, resolución, tasa de refresco, perfil de calidad y si la captura usa Wi-Fi, caché, PWA o Capacitor. [Android](ANDROID_DOCS.md#build-e-instalacion) · [PWA](PWA.md#prueba-y-depuracion)
2. Usar Alta en escritorio, Media en un Android de gama media y Baja en uno de gama baja. Medir también Baja en el dispositivo medio para aislar el efecto del perfil. Fijar orientación y resolución, mantener el mismo modo energético y dejar enfriar entre trazas. En un panel rápido, registrar los Hz efectivos y usar 60 Hz cuando el dispositivo permita fijarlo.
3. Por mapa y perfil, repetir tres veces con 10 s de estabilización y ventanas de 60 s. Capturar (a) spawn con la vista inicial quieta en la primera ronda, registrando cuántos zombis aparecen, (b) ronda 10 o superior intentando sostener una horda de 24 y anotando ronda y pico real, y (c) fuego sostenido con el mismo arma de área y densidad de horda entre comparaciones. Anotar cualquier preparación con consola y el recorrido usado. Para visibilidad, añadir un recorrido con puertas cerradas y abiertas, escaleras y sótano de Burned Mansion, y vestíbulo, túneles, patio y final de Station 33. En cooperativo repetir el recorrido de Burned Mansion desde anfitrión e invitado.
4. Registrar por captura mediana, p95 y p99 de duración de frames, número de frames por encima de 16,7 y 33,3 ms, CPU de hilo principal y tareas largas. Anotar llamadas, triángulos y rango de escala del HUD en cada vista estable. Si se usa «1 % bajo», aplicar siempre `1000 / p99 del tiempo de frame en ms` y declarar la fórmula. La ralentización de CPU del navegador puede reproducir un cuello de CPU, pero el resultado sigue siendo de escritorio.
5. En carga, capturar Network y Performance desde un contexto frío y repetir con cachés activas. Separar bytes al llegar al selector, bytes al elegir cada mapa, tiempo desde selección a primera interacción, la tarea síncrona más larga y la descarga en segundo plano del service worker. Para memoria, capturar el selector tras inicializar, una partida cargada y el selector tras cinco ciclos partida → menú alternando mapas. Comparar heap y ArrayBuffers tras GC con el mismo procedimiento. Mantener separados los bytes de GPU observables. Repetir el protocolo en ambos Android con depuración remota y anotar si el entorno solo ofrece una parte de esas métricas.

Quedan pendientes todas las trazas de navegador y Android, los FPS y percentiles reales, el coste GPU, la memoria residente de dispositivo y la carga fría y caliente de red. También queda pendiente medir tiempos del gestor de zombis y de balística en una partida.

## Presupuestos provisionales

Los techos automatizados usan ambos estados de puertas y los cuatro perfiles. Parten de los máximos medidos en cada arena y dejan margen de aproximadamente un 10–13 % para el contenido existente. El test es la fuente de esos valores. Si un mapa añade contenido a propósito, revisar el delta y el perfil manual antes de elevar su techo. [Presupuestos de regresión](../tests/zombieArenaContract.test.ts)

| Presupuesto por partida | Escritorio / Android medio | Android bajo |
| --- | ---: | ---: |
| Cadencia objetivo y p95 de frame | 60 FPS · 16,7 ms | 30 FPS · 33,3 ms |
| p99 de frame | ≤ 20,8 ms | ≤ 41,7 ms |
| CPU del hilo principal por frame, p95 | ≤ 8 ms | ≤ 16 ms |
| GPU por frame, p95 si está disponible | ≤ 12 ms | ≤ 24 ms |
| Navegación total por actualización, p95 | ≤ 2 ms | ≤ 4 ms |
| Llamadas de render en vista estable con horda | ≤ 450 escritorio / 350 Android | ≤ 250 |
| Triángulos de render en vista estable con horda | ≤ 250.000 escritorio / 180.000 Android | ≤ 120.000 |
| Inicio de partida con caché, selección a interacción, p95 | ≤ 2,5 s escritorio / 4 s Android | ≤ 5 s |
| Bloque continuo de construcción de mapa | ≤ 8 ms escritorio / 12 ms Android | ≤ 16 ms |

Propuestas adicionales para comparar hitos. Mantener la entrada inicial en ≤ 605 kB gzip y el contenido exclusivo premium fuera de la transferencia al selector tras el hito de carga diferida, incluido el precache. Para la futura navegación de mapas grandes, probar un máximo de 2.000 expansiones A* totales por actualización y 12 MiB de arrays de navegación por partida (ambos radios). Calibrar las expansiones y los presupuestos de render con las trazas de dispositivo. Los 30 FPS de gama baja son un objetivo de estabilidad. `DeviceProfile` y `DynamicResolution` todavía no ofrecen un perfil con un límite explícito de 30 FPS.

## Validación del hito

- `npm run typecheck` y `npm run build` completados. Vite avisó del tamaño del chunk principal.
- Suite completa con `npm run test -- --maxWorkers=4 --reporter=dot`. Pasaron 2.059 pruebas en 189 archivos, incluida la integración de anfitrión e invitado. La primera ejecución reportó un timeout de comunicación con un worker de Vitest tras pasar las pruebas. La repetición con cuatro workers terminó correctamente.
- Pasaron las pruebas WebSocket del relay Node y del Durable Object ejecutado en Miniflare local.
- El diff se limita a pruebas y documentación. La comprobación de compatibilidad en dispositivo queda en el protocolo manual.

## Pasos propuestos tras el hito 0

1. **Visibilidad por sectores.** Extraer la política de plantas de Burned Mansion a una función de visibilidad comprobable y un adaptador de capas para los objetos visuales. Definir sectores y relaciones explícitas, con salida conservadora en umbrales, portales abiertos, sectores solapados y cámaras cinemáticas. Conservar frustum y separar batches e instancias por sector. Probar primero paridad en Mansión. Aplicar una distancia opcional alineada con la niebla de cada vista, revisando materiales sin niebla y siluetas lejanas antes de habilitarla. En Station 33 `activeZones` controla spawns y barreras, y la niebla del subsuelo (0,075) difiere de la de la superficie (0,026). Una única distancia agresiva puede cortar el final. [Mansión](../src/zombies/maps/BurnedMansionArena.ts) · [Huida de Station 33](changes/station33-burning-escape.md)
2. **Navegación.** Presupuestar expansiones y búsquedas de recuperación bajo el mismo límite. Reanudar búsquedas repartidas entre actualizaciones, con cancelación por cambio de topología o de objetivo. Conservar la cuadrícula y los dos radios, ensayar rutas restringidas por un grafo de puertas y reconstruir solo la planta o región afectada. Comparar los cuatro tamaños de la sonda, con y sin ruta, y probar pasos entre plantas y barreras. [Navegación](../src/zombies/navigation/ZombieNavigationService.ts)
3. **Carga diferida.** Separar metadatos síncronos de fábricas importadas bajo demanda en `ZOMBIE_MAPS`. Mover audio y assets propios al arranque autorizado del mapa, comprobar el precache e introducir fases que cedan al navegador para arenas grandes. Cubrir fallo de importación y construcción parcial, salida durante carga y entrada de anfitrión e invitado. [Arranque](../src/main.ts) · [Cooperativo](MULTIPLAYER.md)
4. **Índice espacial.** Medir primero candidatos y coste de consultas lineales con la topología actual y con 1.000–2.000 sólidos sintéticos. Evaluar un índice XZ para sólidos estáticos, con actualización al cambiar puertas y barreras. Comparar sus resultados con la búsqueda exhaustiva, incluidos solapes de celda, orden de impactos y la separación entre sólidos estáticos y blancos dinámicos. [Gestor](../src/zombies/ZombieManager.ts) · [Balística](../src/shooting/BallisticsSystem.ts)

El siguiente hito propuesto es visibilidad por sectores, con paridad automatizada y revisión manual de portales, escaleras y finales antes de extenderla a más mapas. Esta línea base añade pruebas y documentación sobre las implementaciones actuales.
