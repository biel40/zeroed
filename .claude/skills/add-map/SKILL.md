---
name: add-map
description: Anadir un mapa nuevo de Zombies a Zeroed (registro, arena que cumple ZombieArena, config de datos, builders por zona, tarjeta del menu, i18n, musica, intro opcional, tests y docs). Usar cuando el usuario pida un mapa nuevo o empezar uno, p. ej. "quiero un mapa en un hospital".
---

# Anadir un mapa a Zeroed

Station 33 es el mapa base: un mapa nuevo se monta con sus sistemas, no los
reimplementa (ver "Station 33 es el mapa base" en `docs/DECISIONS.md`).
Referencia completa: Station 33 (`src/zombies/maps/Station33Config.ts`,
`Station33Arena.ts`, `station33/`, `tests/station33.test.ts`,
`docs/STATION_33.md`). Sigue AGENTS.md: los modos no dependen de un mapa
concreto, el modo individual es la prioridad y el campo de tiro/Classic no
vuelve.

## 0. Antes de empezar

- `npm run codemap` y busca con grep en `CODEMAP.md`: `ZombieArena`, `Station33`, `zombieMaps`.
- Lee `docs/STATION_33.md` y la seccion "Mapas e interacciones" de
  `docs/GAME_SYSTEMS.md`.
- Pregunta al usuario lo que no se deduce y cambia el diseno:
  - id en kebab-case;
  - individual o cooperativo (hoy el cooperativo solo usa `COOP_ZOMBIE_MAP_ID`);
  - premium o incluido;
  - tematica y direccion de arte;
  - que contiene la primera fase.
- Un mapa grande se construye por fases (como Station 33): la fase 1 es una
  sala jugable con un bucle de rondas completo. No intentes el mapa entero de
  una vez.

## 1. Arquitectura (una responsabilidad por archivo)

| Archivo | Responsabilidad |
|---|---|
| `src/zombies/maps/<Mapa>Config.ts` | Solo datos: medidas de salas, barreras/entradas, spawns, puertas, wall buys, Mystery Box, maquinas de anillos, luces, `PLAYER_SPAWN`, bounds. Sin Three.js salvo tipos. |
| `src/zombies/maps/<Mapa>Arena.ts` | `implements ZombieArena`: orquesta builders, colliders, zonas que despiertan con puertas, `reset`, `activateDoor`, `refreshSpawnPoints/Colliders`. No contiene geometria de detalle. |
| `src/zombies/maps/<mapa>/` | Un builder por zona/sistema: `<Zona>Shell` (muros, suelo, techo), `<Zona>Furniture` (solidos), `<Zona>Dressing` (decals, atrezo no solido), `<Mapa>Lighting`, `<Mapa>Atmosphere`, `<Mapa>BuildContext` (lo que reciben los builders). |
| `src/zombies/maps/<Mapa>Materials.ts` | Materiales y texturas procedurales compartidos del mapa. |

Reutiliza lo compartido antes de crear algo: `WindowBarrier`, `PointDoor` /
`PointDoorView` / `BuyableDoorVisual`, `WallBuy` / `WallBuyView`,
`MysteryBoxPlacement` y `src/zombies/maps/shared/`:
- `ArenaStructure` (muros y huecos);
- `StaticMeshBatch` (atrezo en una sola malla) y `BoxUVs`;
- `PointLightBudget`, `AmbientEventScheduler` y `ArenaAmbience`;
- `BloodDecalTexture` y `ProceduralNoise`;
- `MapBuildKit`, que el `<Mapa>BuildContext` extiende (grupo, estructura, lote y material de colision);
- `addSolidProxy` (colisionador de atrezo), `Cobwebs`, y `LockerBank` / `WallFrame` (bancos de taquillas);
- `RingLocker` (maquina de anillos), `MapPower` y `PowerLever` (electricidad e interruptor, para `ringMachines` y `powerSwitch`).

Cada pieza pide sus materiales por nombre (`greySteel`, `paintedSteel`...):
el `<Mapa>Materials` los define con esos nombres y el mapa solo da su look y
su colocacion (en Station 33, `station33/Station33Machines.ts`). Si algo que
necesitas solo existe dentro de `station33/`, muevelo a `shared/` y haz que
Station 33 lo use desde alli.

Tambien la navegacion de `src/zombies/navigation/` (`NavigationGrid`,
`ZombieNavigationService`). Para los pasajes ocultos de los spawns, toma como
modelo `station33/ServicePassageBuilder.ts`; si lo necesitan dos mapas,
muevelo a `shared/` en lugar de copiarlo. Busca con grep en `CODEMAP.md` lo
que ofrece cada uno.

## 2. Contrato `ZombieArena` (`src/zombies/maps/ZombieArena.ts`)

Obligatorio: `id` (igual a la clave del registro), `group`, `colliders`,
`spawnPoints`, `barriers`, `doors`, `wallBuys`, `playerSpawn`,
`useWallCollision`, `playerBounds`, `navigationBounds`, `ambience`,
`onTopologyChanged`, `init`, `update`, `reset`, `activateDoor`,
`refreshSpawnPoints` y `refreshColliders`.

Opcional, solo si el mapa lo tiene:
- `wallColliders`, `floorTransitions`, `mysteryBoxPlacement`, `ringMachines`;
- `weaponPickups`, `ammoRefills`, `completionInteraction` con su `ArenaEnding`;
- `intro` con `startIntro`/`finishIntro`, y `onAmbientCue`;
- la capacidad `SoulRitualArena`.

## 3. Registro y menu (todos obligatorios)

| Archivo | Que anadir |
|---|---|
| `src/config/zombieMaps.ts` | Entrada en `ZOMBIE_MAPS`: `id`, `visible`, `nameKey`, `coop`, `premium`, `createArena`. |
| `index.html` | Tarjeta `<button class="map-card" data-map="<id>">` copiando la estructura de las existentes: arte SVG animado propio, `data-map-access`, `data-map-players`, nombre y lema con `data-i18n`. |
| `src/style.css` | Estilos y animaciones del arte de la tarjeta, si los necesita. |
| `src/i18n/en.ts`, `es.ts`, `ca.ts` | `map.<clave>` y `map.<clave>.tagline` en los tres idiomas (`tests/i18n.test.ts` exige las mismas claves). |
| `src/audio/MusicManager.ts` | Si tiene musica propia: `MusicTrackName`, `ZOMBIES_MUSIC_PATHS`, `MUSIC_TRACKS`; el arena la elige en `ambience.musicTrack`. El MP3 va a `public/assets/audio/` y su licencia a `ASSETS.md`. |
| `AGENTS.md` | La linea que lista los mapas jugables y sus modos. |

Intro opcional:
- `ArenaIntro` en el config;
- un `IntroPresentationId` en `src/ui/HUD.ts`;
- su variante `data-presentation` en `#intro-screen` de `index.html` y en `style.css`;
- las claves `intro.<clave>.*` en los tres idiomas.

Un final opcional sigue el mismo patron con `EndingPresentationId`.

## 4. Reglas de diseno del espacio

- Coordenadas en metros. Los pies estan a altura 0 y los muros tienen 0,3 m
  de grosor, centrados medio grosor fuera de la cara interior.
- Cada entrada de zombis tiene su barrera y su pasaje oculto; los spawns
  quedan fuera de las salas y libres de colliders.
- Una zona tras una puerta de pago no existe hasta comprarla: sus spawns
  duermen y `reset` vuelve a cerrarla.
- Las luces son caras (cada punto de luz se evalua en cada fragmento): usa
  pocas, materiales emisivos y circuitos de parpadeo compartidos.
- Wall buys a 2 cm de la cara del muro; precios de la skill `add-weapon`.

## 5. Tests y validacion

- `tests/zombieArenaContract.test.ts` y `tests/mapSelection.test.ts`
  recorren `ZOMBIE_MAPS` solos. Anade a `mapSelection` la expectativa de
  `visible`/`coop`/`premium` del mapa nuevo.
- Crea `tests/<mapa>.test.ts` siguiendo `tests/station33.test.ts`:
  - `ZombiesMode` arranca y reinicia en el mapa;
  - la zona inicial esta sola y la puerta cerrada;
  - el jugador aparece libre de solidos;
  - los spawns quedan fuera de las salas;
  - la horda llega al jugador (`chaseUntilHit`);
  - los wall buys estan a 2 cm de un muro y al alcance;
  - las puertas despiertan sus zonas, y `reset` las cierra de nuevo.
- Si tiene intro: anade su caso a `tests/mapIntro.test.ts`.
- `npx tsc --noEmit` y `npx vitest run`.

## 6. Documentacion

- `docs/<MAPA>.md`: direccion de arte, paleta, fases y directrices, como
  `docs/STATION_33.md`.
- `docs/GAME_SYSTEMS.md` ("Mapas e interacciones") y `docs/PROJECT_STATE.md`:
  que existe del mapa.
