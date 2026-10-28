# Instrucciones para agentes

- Lee la documentacion relevante e inspecciona el codigo relacionado antes de implementar. Revisa las notas pertinentes de `docs/changes/`.
- Busca y reutiliza sistemas, contratos y utilidades existentes siempre que sea razonable; no dupliques logica.
- Diseña el cambio minimo necesario. Evita soluciones temporales, overengineering y refactors masivos no relacionados.
- Mantén responsabilidades claras entre logica, presentacion y orquestacion, con el menor acoplamiento posible. Separa la logica determinista de las vistas Three.js.
- Preserva las funcionalidades existentes salvo que la tarea exija cambiarlas. El individual es prioritario: los cambios cooperativos no deben degradarlo.
- Registra cada mapa en `src/config/zombieMaps.ts` y respeta el contrato `ZombieArena`; los modos no deben depender de un mapa concreto. No reintroduzcas el campo de tiro/Classic como modo, mapa ni dependencia de gameplay.
- Usa los contratos existentes para armas, economia, municion y pausa; consulta la arquitectura antes de modificarlos. Reutiliza pools y temporales en el bucle, evitando allocations por frame, y comparte la logica entre movil y escritorio.
- Para logica nueva, escribe primero tests deterministas e inyecta las fuentes de aleatoriedad cuando corresponda.
- Declara explicitamente la visibilidad de los miembros de las clases y el tipo de retorno. Mantén el estado interno privado y la API publica minima; usa `static` solo cuando no dependa de la instancia.
- Todo script o codigo fuente generado debe ser escalable, legible y mantenible: nombres claros, responsabilidades acotadas, modulos pequeños y cohesionados, contratos explicitos y sin logica oculta ni dependencias implicitas.
- Elimina codigo muerto o duplicado derivado de tus cambios. Ejecuta `npm run typecheck` y `npm run test`, ademas de las validaciones pertinentes al area, y revisa regresiones antes de finalizar.
- La documentacion describe el codigo; no debe sustituirlo ni repetir detalles faciles de obtener al leerlo. Actualiza las fuentes afectadas segun el apartado de documentacion; no inventes estado ni declares resuelta una limitacion sin evidencia.
- Durante la beta cerrada, para probar produccion (https://zeroed.es) accede con `bielet40@gmail.com`.
- Trabaja directamente en el checkout principal. No crees ni uses worktrees salvo peticion explicita del usuario.

## Rutas de lectura

Identifica el area, consulta sus rutas, busca simbolos y lee solo las secciones y archivos necesarios; amplia la lectura si aparecen dependencias relevantes. Consulta las notas pertinentes de [cambios](docs/changes/).

| Area | Documento y contrato o entrada | Skill y validacion |
| --- | --- | --- |
| Armas y primera persona | [Shell](docs/GAME_SYSTEMS.md#shell-compartido), [armas](src/config/weapons.ts) | [add-weapon](.claude/skills/add-weapon/SKILL.md), [tests](tests/firstPersonArms.test.ts), [visores](tools/viewers/README.md) |
| Anillos | [Anillos](docs/GAME_SYSTEMS.md#anillos), [catalogo](src/game/rings/RingCatalog.ts) | [add-ring](.claude/skills/add-ring/SKILL.md), [tests](tests/playerRings.test.ts) |
| Mapas y decoracion | [Mapas](docs/GAME_SYSTEMS.md#mapas-e-interacciones), [arena](src/zombies/maps/ZombieArena.ts), [Station 33](docs/STATION_33.md) | [add-map](.claude/skills/add-map/SKILL.md), [tests](tests/zombieArenaContract.test.ts), [visores](tools/viewers/README.md) |
| Zombis, combate y navegacion | [Zombies](docs/GAME_SYSTEMS.md#zombies), [manager](src/zombies/ZombieManager.ts) | [tests](tests/zombieNavigation.test.ts), [visores](tools/viewers/README.md) |
| Cooperativo y red | [Cooperativo](docs/MULTIPLAYER.md#alcance-y-límites), [modos](src/modes/GameMode.ts) | [tests](tests/coopMatch.test.ts); `npm run multiplayer:test-server` y `npm run multiplayer:cloudflare:test` |
| UI e idiomas | [HUD](docs/GAME_SYSTEMS.md#hud-y-estadisticas-de-partida), [idiomas](src/i18n/) | [tests](tests/i18n.test.ts), [visores](tools/viewers/README.md) |
| PWA y Android | [PWA](docs/PWA.md#prueba-y-depuracion), [Android](docs/ANDROID_DOCS.md#build-e-instalacion), [entrada PWA](src/pwa.ts) | [comandos](package.json) |

Consulta [arquitectura](docs/ARCHITECTURE.md#contratos), [decisiones](docs/DECISIONS.md), [estado](docs/PROJECT_STATE.md), [beta](public/beta/README.md) y el catalogo de skills de la sesion cuando corresponda.

`npm run codemap` genera CODEMAP.md, ignorado por Git; consultalo mediante busquedas selectivas, sin cargarlo entero por defecto. `npm run codemap -- --area <ruta>` filtra por archivo o directorio y `npm run codemap -- --query <texto>` busca rutas y simbolos literalmente sin distinguir mayusculas. Se pueden combinar; los filtros imprimen por stdout sin sobrescribir el mapa.

## Actualizacion de documentacion

Tras un cambio, comprueba que informacion relevante queda desactualizada y actualiza solo los documentos afectados; enlaza la fuente responsable en vez de duplicarla. Si no cambia informacion relevante, no edites documentacion.

- [Estado](docs/PROJECT_STATE.md): capacidades actuales, limitaciones confirmadas y enlaces; no detallar mecanicas ni valores.
- [Arquitectura](docs/ARCHITECTURE.md): fronteras, contratos y puntos de extension; actualizar al cambiar responsabilidades o interfaces.
- [Sistemas](docs/GAME_SYSTEMS.md): comportamiento del juego por tema; actualizar cuando cambie una mecanica o experiencia observable.
- [Decisiones](docs/DECISIONS.md): decisiones vigentes y motivos; actualizar cuando cambie una decision o sus razones.
- [Guias de mapas](docs/STATION_33.md): intencion artistica y restricciones propias; actualizar cuando cambien esas directrices.
- [Cooperativo](docs/MULTIPLAYER.md), [PWA](docs/PWA.md), [Android](docs/ANDROID_DOCS.md) y [beta](public/beta/README.md): procedimientos y limites propios de cada area. Actualiza la guia correspondiente cuando cambien.
- [Historial](docs/changes/) e informes historicos: conservan el contexto de su fecha; no los reescribas como estado actual. Anade una nota de cambio solo cuando aporte contexto o una decision util.
