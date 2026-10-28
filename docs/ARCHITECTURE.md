# Arquitectura

Zeroed es un FPS web en TypeScript estricto, Three.js, Vite y Vitest. No usa
framework de UI ni motor de fisicas. El modo individual no necesita servidor;
el primer cooperativo usa un relay WebSocket Node.js local o un Worker con
Durable Objects por sala en Cloudflare.

## Flujo

```text
main.ts -> PWA + DeviceProfile + AssetManager + selector de mapa
        -> Game (loop, renderer, pausa, servicios compartidos)
        -> Player/Input + WeaponInventory/Weapon + Ballistics/EnergyProjectiles
        -> ZombiesMode(GameMode) -> arena del registro de mapas + run Zombies
        -> CoopHostMode / CoopGuestMode(GameMode) -> CoopWorld + autoridad del anfitrion
        -> vistas, audio, HUD, efectos y render
```

El loop y la pausa pertenecen a `Game`; la pausa compartida depende de la autoridad del modo. Consulta el [comportamiento cooperativo](MULTIPLAYER.md#alcance-y-límites). `Game.dispose()` libera los servicios y vuelve al menu sin recargar.
El loop no arranca en el constructor: `Game.prepare()` compila todos los
materiales (incluidos pools ocultos), sube sus texturas y dibuja un frame
mientras `#map-loading` cubre la pantalla, para que la entrada al mapa no
sufra tirones de compilacion de shaders.

## Responsabilidades

| Area | Responsabilidad |
| --- | --- |
| `src/core/Game.ts` | Composition root, loop, pausa y servicios comunes |
| `src/modes/GameMode.ts` | Contrato del modo y `ModeContext` |
| `src/modes/ZombiesMode.ts` | Run, rondas, economia, salud, armas y progresion |
| `src/modes/coop/` | Cooperativo: `CoopWorld` (mapa compartido), `CoopHostMode` (autoridad), `CoopGuestMode` (replica) |
| `src/network/` + `server/` + `cloudflare/` | Protocolo validado, interpolacion, validacion de disparos y relays |
| `src/rendering/RemotePlayer*` | Compañero como entidad de mundo: interpolacion y cuerpo animado |
| `src/config/zombieMaps.ts` | Registro de mapas: visibilidad, nombre, cooperativo y factoria de arena |
| `src/zombies/maps/*` | Geometria, colliders, spawns e interacciones de cada mapa; `shared/` reune utilidades sin mapa |
| `src/weapons/` + `src/config/` | Logica pura, definiciones y viewmodels |
| `src/shooting/` | Trayectoria, pool balistico, raycast y `HitTarget` |
| `src/zombies/` | IA, pool, combate, barreras, puertas y wonder weapons |
| `src/game/` | Inventario, salud, economia, anillos y estadisticas puras |
| `src/pwa.ts` | Service Worker, instalacion y actualizaciones |
| `src/i18n/` | Diccionarios es/en/ca, `t()` e idioma activo |
| `public/beta/` | Pantalla y filtro temporal de acceso; conectado al arranque desde `src/main.ts` |

## Contratos

- Las armas son datos (`WeaponDefinition`), no subclases. `Weapon` no importa
  Three.js; `WeaponView` adapta sus eventos mediante `pendingEvents`.
- El Knife es un melee propio de `ZombiesMode`, fuera de las dos ranuras del
  inventario. Sirve como fallback sin municion y como ataque rapido dedicado;
  `GameMode.usesFallbackAttack()` permite que el shell ceda fire/ADS durante
  la cuchillada sin convertirlo en un arma de proyectiles ficticia, y
  `getMeleeArm()` entrega el `Knife` como `MeleeArmDriver`: cuanto apartar el
  arma y cuanto de la mano derecha toma el tajo.
- `ViewArms` es un servicio compartido de primera persona; `WeaponHands` adapta los agarres declarados por cada arma. Para sus restricciones visuales y motivos, consulta [agarres naturales](changes/natural-grips.md).
- Logica determinista y vistas Three.js permanecen separadas para poder probar
  en Node. Points solo se mutan mediante `PlayerEconomy` y la reserva de
  municion la decide el modo.
- `ZombieArena` separa la run de la geometria del mapa. La arena declara spawn y
  limites del jugador, ambiente (fondo, niebla, luz hemisferica, musica y, si
  quiere, la intensidad de la luz de entorno), sonidos ambientales opcionales
  (`onAmbientCue`, que el modo reproduce), su
  intro opcional (planos de camara y presentacion), su
  final (cinematica, audio y duracion) y avisa con `onTopologyChanged` cuando
  puertas o muros cambian la topologia. Las capacidades propias de un mapa
  (`SoulRitualArena`) se consultan con type guard, nunca con `instanceof`;
  las que cualquier mapa puede ofrecer son campos opcionales (`weaponPickups`,
  `ammoRefills`, `mysteryBoxPlacement`, `ringMachines`).
  Los pickups con `codeLock` separan la validacion del codigo de la aplicacion
  de una apertura autorizada; cooperativo replica las aperturas y recogidas
  bajo autoridad del anfitrion, sin introducir dependencias de un mapa.
- Los anillos llevados se ven en la mano derecha de `ViewArms`
  (`HandRings`), que el modo recibe en `ModeContext.handRings`.
  `HitTarget` desacopla balistica de blancos.
- Pools y temporales reutilizables limitan allocations por frame. Los tipos
  zombie (`normal`, `shiny`, `brute`) pueden compartir modelo sin duplicar IA.
- `ZombieManager` y `ZombieReplica` poseen cada uno el pool de sangre de su run
  (`ZombieBlood`), separado de los cuerpos reciclables. `ZombieBleeding` resuelve
  la intensidad de las heridas; `BloodDropMotion` comparte simulacion y manchas
  con los restos del Barrett sin depender de objetos de escena.
- La identificacion de impactos de energia por color es una [deuda de contrato](DECISIONS.md#deudas-de-contrato).

## Extension

Nueva arma: `WeaponId` + `WeaponDefinition` + preload/orden. Nuevo anillo:
`RingId` + `RingDefinition` (dedo libre, efecto como dato), su gancho en
`ZombiesRings`, claves `ring.*` y una maquina en las `ringMachines` de un
mapa. Nuevo modo:
`GameMode` y selector. Nuevo mapa: clase que implemente `ZombieArena` (sus
datos en un config propio, utilidades comunes de `maps/shared/`), entrada en
`ZOMBIE_MAPS`, tarjeta `data-map` en `#map-select` (arte SVG propio) y claves
`map.<nombre>` y `map.<nombre>.tagline` en los tres diccionarios; el test de contrato lo recorre solo. Un final nuevo anade su id
de presentacion en `HUD` y de audio en `MusicManager`. Una intro nueva anade su
id en `IntroPresentationId` y su overlay en `#intro-screen`. Nuevo blanco: `HitTarget` y
registro en colliders. Nuevo tipo zombie: registro de estadisticas/modelo,
orden de spawn y asset si procede.
