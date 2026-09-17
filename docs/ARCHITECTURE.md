# Arquitectura

Zeroed es un FPS web en TypeScript estricto, Three.js, Vite y Vitest. No usa
framework de UI, servidor ni motor de fisicas.

## Flujo

```text
main.ts -> PWA + DeviceProfile + AssetManager + selector de mapa
        -> Game (loop, renderer, pausa, servicios compartidos)
        -> Player/Input + WeaponInventory/Weapon + Ballistics/EnergyProjectiles
        -> ZombiesMode(GameMode) -> ZombieArena + run Zombies
        -> vistas, audio, HUD, efectos y render
```

`Game.tick()` procesa input, jugador, arma, impactos, arena, modo, vistas,
efectos, HUD y render. El `dt` se limita a 50 ms. En pausa consume el reloj,
pero congela la simulacion y conserva el frame visible.

## Responsabilidades

| Area | Responsabilidad |
| --- | --- |
| `src/core/Game.ts` | Composition root, loop, pausa y servicios comunes |
| `src/modes/GameMode.ts` | Contrato del modo y `ModeContext` |
| `src/modes/ZombiesMode.ts` | Run, rondas, economia, salud, armas y progresion |
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
- `ZombieArena` permite una unica `ZombiesMode` con `ClassicArena` y
  `BurnedMansionArena`. `HitTarget` desacopla balistica de blancos.
- Pools y temporales reutilizables limitan allocations por frame. Los tipos
  zombie (`normal`, `shiny`, `brute`) pueden compartir modelo sin duplicar IA.
- Las armas de energia usan `EnergyProjectiles`; identificar impactos por color
  no es extensible y debe sustituirse antes de una tercera arma.
- No existe `dispose()` completo para cambiar modo o mapa sin recargar.

## Extension

Nueva arma: `WeaponId` + `WeaponDefinition` + preload/orden. Nuevo modo:
`GameMode` y selector. Nuevo mapa: `ZombieArena`. Nuevo blanco: `HitTarget` y
registro en colliders. Nuevo tipo zombie: registro de estadisticas/modelo,
orden de spawn y asset si procede.
