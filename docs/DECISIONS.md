# Decisiones arquitectonicas

## [2026-09-12] Mantener el ritual de almas dentro de Burned Mansion

- Contexto: tres lamparas repartidas por el mapa deben activarse con USE antes de reaccionar a bajas, mostrar almas en vuelo y abrir una sala fisica del bunker sin persistencia entre partidas.
- Decision: `ZombiesMode` reenvia una instantanea de posicion/planta desde el callback autoritativo de muerte; `SecretRoomState` gobierna progreso y reservas en vuelo, mientras `SecretRoomSystem`, propiedad de `BurnedMansionArena`, posee vistas, pool, pared animada y reset. El collider permanece hasta acabar la apertura y reutiliza la resincronizacion topologica existente.
- Motivo: mantener la run general desacoplada de un easter egg especifico del mapa, impedir dobles cargas con muertes simultaneas y conservar coherencia entre visual, colision de jugador, balistica y navegacion zombie.

## [2026-09-12] Rediseñar Brutus como amenaza humanoide letal

- Contexto: la silueta ancha con vientre, joroba, placa dorsal, puños gigantes y piernas cortas no se relacionaba visualmente con los zombies normales ni producia el terror buscado.
- Decision: sustituir integramente el GLB reproducible por un humanoide demacrado de 2.30 m, con ropa y deterioro emparentados con Walker, extremidades largas, pecho abierto y rostro asimetrico. Mantiene modelo, anchors, clips, pool, IA y radio de navegacion existentes; su golpe confirmado inflige la vida maxima y el inicio del ataque dispara un rugido procedural exclusivo.
- Motivo: comunicar que Brutus pertenece a la misma infeccion mediante anatomia y vestuario, diferenciandolo por escala, deterioro y amenaza mecanica sin crear otra entidad ni duplicar sistemas.

## [2026-09-09] Recuperar Walker original y reservar el brillo para Shiny

- Contexto: el usuario descarta el rediseño humanoide y elige el modelo original de su captura; pide normales del mismo color y Shiny claramente reconocible.
- Decision: restaurar el GLB de Quaternius existente y su atribucion, retirar el generador Walker descartado y conservar Brute. Un tinte base por modelo; Shiny dorado con diez estrellas en un unico `Points` y textura compartida.
- Motivo: respetar la referencia visual, evitar que una regeneracion vuelva al diseño rechazado y distinguir Shiny sin luces por enemigo ni cambios de IA, spawn o balance.

## [2026-09-03] Reemplazar deformaciones por assets zombie reproducibles (Walker sustituido)

- Contexto: escalar huesos del walker externo y ensanchar unas pocas primitivas de Brutus no cambiaba suficientemente anatomia, rostro ni silueta.
- Decision: Walker y Brutus usan GLB originales generados por scripts, conservando los contratos existentes de clips, anchors y pooling. Walker fusiona sus piezas en un skinned mesh de diez grupos materiales; Brutus prioriza detalle porque solo admite dos instancias.
- Motivo: lograr un rediseño geométrico inequívoco sin tocar gameplay y mantener acotadas las llamadas de dibujo en hordas de hasta 24 walkers.

## [2026-09-02] Separar soporte de mapa de visibilidad publica

- Contexto: Zombies es la experiencia principal y Shooting Range debe desaparecer del menu sin eliminar Classic ni impedir un desbloqueo futuro.
- Decision: centralizar los mapas soportados y su propiedad `visible` en `src/config/zombieMaps.ts`; el menu muestra Burned Mansion como `PLAY ZOMBIES`, mientras `classic` permanece valido para el modo y para `?map=classic`.
- Motivo: la disponibilidad publica cambia sin acoplar progresion futura al HTML ni alterar la construccion, carga o funcionalidad interna de los mapas.

## [2026-08-24] Separar tipos zombie de modelos y reservas visuales

- Contexto: escalar el walker no daba al Brute identidad suficiente y un pool con un único modelo impedía introducir siluetas realmente distintas sin crear objetos durante la ronda.
- Decision: `ZombieTypeId` referencia un `ZombieModelId`; el catálogo de modelos define altura, clips y tintes, mientras `ZombiePool` precarga capacidades por modelo y aplica un único máximo de 24 activos. El Brute usa un GLB original reproducible y dos instancias reservadas.
- Motivo: añadir estadísticas o tratamientos sobre un modelo existente no requiere assets, y añadir una criatura nueva solo amplía registros y reservas sin duplicar IA, combate, navegación ni orquestación.

## [2026-08-23] Variantes zombie como perfiles sobre el walker (sustituida)

- Contexto: Shiny y Brute necesitan estadísticas, silueta y probabilidades propias sin duplicar IA, assets ni ampliar el pool global de 24.
- Decision histórica: seleccionar la variante al adquirir un slot y aplicar un perfil central al walker. Sustituida el 2026-08-24 por modelos independientes y reservas visuales por asset.
- Motivo: conservar una única fuente de verdad para navegación, combate y reciclaje, evitar contadores desincronizados y mantener estable el coste por frame.

## [2026-08-25] Encadenar auto-recarga desde la maquina de arma

- Contexto: reequipar un arma con cargador vacio dejaba el arma en cero aunque tuviera reserva.
- Decision: `Weapon.equip()` registra la necesidad y, al terminar `equipping`, solicita el mismo `reload()` usado por input manual y por la ultima bala.
- Motivo: conservar Empty Reload, eventos, audio, animacion, transferencia autoritativa y cancelacion sin timers ni logica de municion duplicados.

## [2026-08-20] Mantener PWA y actualizaciones fuera del gameplay

- Contexto: Zeroed debe instalarse y reutilizar assets offline sin precachear todo el peso de mapas/audio ni perder una run cuando aparece una version nueva.
- Decision: usar `vite-plugin-pwa`/Workbox con shell en precache, assets pesados en caches runtime y activacion manual del worker pendiente solo desde selector o pausa.
- Motivo: conservar Vite, Vercel, Three.js y los ciclos de Pointer Lock/fullscreen/audio, dejando una frontera web reutilizable por una futura envoltura Capacitor.

## [2026-08-23] Actualizar automaticamente solo el canal web

- Contexto: una build nueva permanecia esperando tambien al entrar desde navegador, aunque el riesgo de interrumpir una run solo exige el flujo manual en la PWA instalada.
- Decision: conservar un unico registro `prompt`; comprobar y aplicar inmediatamente el worker en navegador, reclamar sus clientes y recargar una vez, manteniendo `UPDATE ZEROED` y la activacion manual en standalone.
- Motivo: entregar la ultima build al visitar `zeroed.es` sin perder el control explicito de actualizaciones durante una partida instalada ni degradar cache u offline.

## [2026-08-18] Sincronizar acceso fisico y final del bunker

- Contexto: la escalera teletransportaba entre plantas, la compuerta retiraba su collider antes de acabar la vista y no existia un cierre explicito de la run.
- Decision: representar la escalera mediante una pendiente continua compartida, mantener el collider de la compuerta hasta `OPEN` y gobernar el objetivo de 30000 puntos con `PLAYING -> ENDING -> CREDITS -> FINISHED`.
- Motivo: eliminar estados fisicos/visuales contradictorios y garantizar que el final detenga todos los productores de gameplay una sola vez.

## [2026-08-18] Exponer unicamente mapas Zombies

- Contexto: el producto ya no ofrece el modo de practica normal y debe arrancar con los dos mapas Zombies desarrollados.
- Decision: `main.ts` abre directamente el selector `classic` / `burned-mansion`; se elimina `ShootingRangeMode`, pero se conserva `ShootingRange` como geometria reutilizada por `ClassicArena`.
- Motivo: eliminar una ruta de producto sin duplicar ni romper la infraestructura fisica del mapa Classic Zombies.

## [2026-08-16] Mantener un shell comun con modos aislados

- Contexto: campo de tiro y Zombies comparten render, jugador, armas, balistica, audio y HUD, pero no su estado de juego.
- Decision: `Game` compone los servicios comunes y cada modo implementa `GameMode`, recibiendo un `ModeContext`.
- Motivo: reutilizar infraestructura sin introducir dependencias de Zombies en el campo de tiro ni duplicar el loop.

## [2026-08-16] Definir armas mediante datos y una maquina de estados comun

- Contexto: las armas varian en cadencia, recoil, ADS, municion, proyectil y presentacion.
- Decision: centralizar su personalidad en `WeaponDefinition`; usar `Weapon` para logica y `WeaponView` para representacion.
- Motivo: ampliar el arsenal sin subclases por arma y mantener la logica testeable sin Three.js.

## [2026-08-16] Separar logica determinista de vistas Three.js

- Contexto: armas, Mystery Box, barreras, puertas, salud, economia y rondas necesitan pruebas sin WebGL.
- Decision: conservar maquinas de estado puras y adaptar sus eventos/estado en clases de vista u orquestadores.
- Motivo: reducir acoplamiento, permitir tests Node deterministas y evitar que el render sea fuente de verdad del gameplay.

## [2026-08-16] Representar mapas Zombies mediante `ZombieArena`

- Contexto: Classic reutiliza el range y Burned Mansion necesita geometria, colision, spawns e interacciones propias.
- Decision: una sola instancia de `ZombiesMode` mantiene la run; la estrategia `ZombieArena` posee el entorno y sus datos posicionales.
- Motivo: evitar duplicar rondas, economia, salud, inventario y progresion entre mapas.

## [2026-08-16] Centralizar economia y reservas dependientes del modo

- Contexto: Points solo existen en Zombies y las definiciones de arma se comparten entre modos.
- Decision: todas las recompensas/gastos pasan por `PlayerEconomy`; `GameMode.reserveAmmoFor` decide reservas especificas del modo.
- Motivo: evitar balances duplicados y mutaciones de configuracion compartida.

## [2026-08-16] Usar pools y temporales reutilizables en sistemas frecuentes

- Contexto: balas, zombies, casquillos y efectos se crean con alta frecuencia en el loop.
- Decision: usar pools de tamano fijo y reutilizar vectores temporales en actualizaciones criticas.
- Motivo: limitar crecimiento de escena, garbage collection y coste por frame.

## [2026-08-16] Recuperar navegacion por escalones, no con pathfinding continuo

- Contexto: el steering local es barato para 24 zombies, pero un objetivo inaccesible podia dejar una ronda bloqueada indefinidamente.
- Decision: medir progreso hacia un objetivo unico en intervalos escalonados; ante bloqueo, conservar el steering normal, calcular una ruta de rejilla acotada, probar un ajuste local y finalmente recolocar en un punto validado fuera de vision cuando sea posible.
- Motivo: garantizar recuperacion sin coste de rutas completas por frame, sin matar zombies ni sustituir la arquitectura actual por un navmesh.
