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

`Game.frame()` procesa input, jugador, arma, impactos, arena, modo, vistas,
efectos, HUD y render. El `dt` se limita a 50 ms. `paused` es el estado del
menu local: en individual congela la simulacion y conserva el frame visible;
un modo con `sharedSimulation` (cooperativo) sigue simulando y el menu solo
retira el input de ese jugador. `Game.dispose()` libera loop, listeners,
contexto WebGL, canvas y AudioContext; volver al menu no recarga la pagina.
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
| `src/game/` | Inventario, salud, economia y estadisticas puras |
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
- Los brazos en primera persona (`ViewArms`) son un servicio de `Game` en la
  camara, unico para todas las armas y el cuchillo. Cada arma declara en
  `view.hands` sus puntos de agarre (centro de la pieza, eje del pulgar,
  normal de la palma y pose de dedos, mas la seccion de la pieza sujetada y
  el gatillo) en el espacio de su raiz; `WeaponHands` cierra una vez los
  dedos sobre esa pieza (`fitHandPose`), sin subirlos nunca a menos de 1 cm
  de la linea de mira en los agarres de reposo, y los convierte en objetivos que
  siguen balanceo, retroceso, ADS, equipamiento, recargas y bajada del arma
  sin duplicar esas capas. El antebrazo continua la mano y el hombro es un
  ancla virtual fuera de pantalla, asi que la orientacion de cada agarre
  decide tambien la del brazo. Una corredera o manivela con muelle se suelta al
  final de su recorrido: la mano se abre alli y el muelle la devuelve sola.
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
  (`SoulRitualArena`) se consultan con type guard, nunca con `instanceof`.
  `HitTarget` desacopla balistica de blancos.
- Pools y temporales reutilizables limitan allocations por frame. Los tipos
  zombie (`normal`, `shiny`, `brute`) pueden compartir modelo sin duplicar IA.
- Las armas de energia usan `EnergyProjectiles`; identificar impactos por color
  no es extensible y debe sustituirse antes de una tercera arma.

## Extension

Nueva arma: `WeaponId` + `WeaponDefinition` + preload/orden. Nuevo modo:
`GameMode` y selector. Nuevo mapa: clase que implemente `ZombieArena` (sus
datos en un config propio, utilidades comunes de `maps/shared/`), entrada en
`ZOMBIE_MAPS`, tarjeta `data-map` en `#map-select` (arte SVG propio) y claves
`map.<nombre>` y `map.<nombre>.tagline` en los tres diccionarios; el test de contrato lo recorre solo. Un final nuevo anade su id
de presentacion en `HUD` y de audio en `MusicManager`. Una intro nueva anade su
id en `IntroPresentationId` y su overlay en `#intro-screen`. Nuevo blanco: `HitTarget` y
registro en colliders. Nuevo tipo zombie: registro de estadisticas/modelo,
orden de spawn y asset si procede.
