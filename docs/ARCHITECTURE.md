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
        -> ZombiesMode(GameMode) -> BurnedMansionArena + run Zombies
        -> CoopHostMode / CoopGuestMode(GameMode) -> CoopWorld + autoridad del anfitrion
        -> vistas, audio, HUD, efectos y render
```

`Game.frame()` procesa input, jugador, arma, impactos, arena, modo, vistas,
efectos, HUD y render. El `dt` se limita a 50 ms. `paused` es el estado del
menu local: en individual congela la simulacion y conserva el frame visible;
un modo con `sharedSimulation` (cooperativo) sigue simulando y el menu solo
retira el input de ese jugador. `Game.dispose()` libera loop, listeners,
contexto WebGL, canvas y AudioContext; volver al menu no recarga la pagina.

## Responsabilidades

| Area | Responsabilidad |
| --- | --- |
| `src/core/Game.ts` | Composition root, loop, pausa y servicios comunes |
| `src/modes/GameMode.ts` | Contrato del modo y `ModeContext` |
| `src/modes/ZombiesMode.ts` | Run, rondas, economia, salud, armas y progresion |
| `src/modes/coop/` | Cooperativo: `CoopWorld` (mapa compartido), `CoopHostMode` (autoridad), `CoopGuestMode` (replica) |
| `src/network/` + `server/` + `cloudflare/` | Protocolo validado, interpolacion, validacion de disparos y relays |
| `src/rendering/RemotePlayer*` | Compañero como entidad de mundo: interpolacion y cuerpo animado |
| `src/zombies/maps/*` | Geometria, colliders, spawns e interacciones del mapa |
| `src/weapons/` + `src/config/` | Logica pura, definiciones y viewmodels |
| `src/shooting/` | Trayectoria, pool balistico, raycast y `HitTarget` |
| `src/zombies/` | IA, pool, combate, barreras, puertas y wonder weapons |
| `src/game/` | Inventario, salud, economia y estadisticas puras |
| `src/pwa.ts` | Service Worker, instalacion y actualizaciones |

## Contratos

- Las armas son datos (`WeaponDefinition`), no subclases. `Weapon` no importa
  Three.js; `WeaponView` adapta sus eventos mediante `pendingEvents`.
- El Knife es un melee propio de `ZombiesMode`, fuera de las dos ranuras del
  inventario. Sirve como fallback sin municion y como ataque rapido dedicado;
  `GameMode.usesFallbackAttack()` permite que el shell ceda fire/ADS durante
  la cuchillada sin convertirlo en un arma de proyectiles ficticia.
- Logica determinista y vistas Three.js permanecen separadas para poder probar
  en Node. Points solo se mutan mediante `PlayerEconomy` y la reserva de
  municion la decide el modo.
- `ZombieArena` separa la run de `ZombiesMode` de la geometria de Burned Mansion.
  `HitTarget` desacopla balistica de blancos.
- Pools y temporales reutilizables limitan allocations por frame. Los tipos
  zombie (`normal`, `shiny`, `brute`) pueden compartir modelo sin duplicar IA.
- Las armas de energia usan `EnergyProjectiles`; identificar impactos por color
  no es extensible y debe sustituirse antes de una tercera arma.

## Extension

Nueva arma: `WeaponId` + `WeaponDefinition` + preload/orden. Nuevo modo:
`GameMode` y selector. Nuevo mapa: `ZombieArena`. Nuevo blanco: `HitTarget` y
registro en colliders. Nuevo tipo zombie: registro de estadisticas/modelo,
orden de spawn y asset si procede.
