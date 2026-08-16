# Arquitectura

FPS de navegador en TypeScript estricto, Three.js, Vite y Vitest. No usa framework de UI, servidor ni motor de fisicas.

## Estructura

```text
index.html / src/main.ts
  -> DeviceProfile + AssetManager + HUD
  -> selector de GameMode/mapa
  -> core/Game.ts                    shell y composition root
       -> player/                    input y controlador FPS
       -> weapons/ + config/         logica, datos y vista de armas
       -> shooting/                  balistica compartida
       -> range/                     escenario y HitTargets
       -> rendering/ + audio/ + ui/ efectos laterales
       -> modes/GameMode.ts          frontera del modo
            -> ShootingRangeMode
            -> ZombiesMode
                 -> zombies/         run, enemigos e interacciones
                 -> zombies/maps/    entorno fisico por ZombieArena
```

## Flujo de ejecucion

```text
main.ts
  -> detecta WebGL y perfil
  -> precarga manifest
  -> selecciona modo/mapa
  -> new Game(..., mode)
  -> mode.init(ModeContext)
  -> renderer.setAnimationLoop(Game.tick)

Game.tick
  -> entrada e interaccion
  -> PlayerController.update
  -> Weapon.update -> pendingEvents
  -> disparo: BallisticsSystem o GameMode.onWeaponFired
  -> balistica -> HitTarget -> GameMode.onTargetHit
  -> range.update -> mode.update
  -> vistas, efectos, HUD y render
```

La pausa corta el `tick` tras renderizar el frame congelado. El `dt` esta limitado a 50 ms.

## Responsabilidades y dependencias

| Area | Responsabilidad | Dependencias relevantes |
| --- | --- | --- |
| `src/core/Game.ts` | Crea y conecta todos los servicios compartidos; posee loop, pausa y arsenal | Depende del contrato `GameMode`, no de clases zombie concretas |
| `src/modes/GameMode.ts` | Capacidades y hooks de un modo; `ModeContext` limita lo que recibe | Expone escena y `hitColliders` mutables |
| `src/modes/ZombiesMode.ts` | Estado de la run y coordinacion de subsistemas Zombies | Depende de `ZombieArena`, managers, economia y HUD |
| `src/weapons/Weapon.ts` | Maquina de estados de arma y eventos | TypeScript puro; consume `WeaponDefinition` |
| `src/weapons/WeaponView.ts` | Modelos, ADS, sway, bob, recoil y recarga visual | Three.js y assets |
| `src/shooting/BallisticsSystem.ts` | Pool de proyectiles y resolucion de impactos | Array compartido de colliders y `HitTarget` |
| `src/zombies/ZombieManager.ts` | Pool, movimiento, combate y hitboxes zombie | Spawns, barreras, transiciones y colliders del mapa |
| `src/zombies/maps/ZombieArena.ts` | Contrato de geometria, spawns e interacciones de mapa | Implementado por `ClassicArena` y `BurnedMansionArena` |
| `src/game/` | Inventario, salud, economia y estadisticas | Logica pura reutilizada por modos |

## Fronteras existentes

- La configuracion define armas; no hay subclases por arma (`src/config/weapons.ts`).
- Logica determinista y vistas Three.js estan separadas en armas, Mystery Box, barreras y puertas.
- La comunicacion de `Weapon` hacia el shell usa `pendingEvents`.
- `HitTarget` desacopla la balistica de blancos y zombies.
- Points solo se modifican mediante `PlayerEconomy`; las reservas de Zombies las decide el modo.
- Pools fijos limitan proyectiles, zombies y efectos. Los loops reutilizan temporales donde es posible.

## Puntos de extension

- Arma convencional: `WeaponId`, `WeaponDefinition` y lista de preload/orden aplicable.
- Modo: implementar `GameMode` y registrarlo en selector/HUD.
- Mapa Zombies: implementar `ZombieArena`; hoy la seleccion y la progresion de puertas aun requieren ramas explicitas.
- Objeto disparable: implementar `HitTarget` y registrar su `Object3D` en `hitColliders`.
- Interaccion Zombies: reutilizar `PointDoor`, `WindowBarrier`, `WallBuy` o `ArenaWeaponPickup`; la prioridad esta centralizada en `ZombiesMode`.
- Nueva arma de energia: requiere ampliar el contrato de impacto; el color actual no es una identidad extensible.
