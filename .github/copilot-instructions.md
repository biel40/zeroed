# Copilot / AI Agent Instructions — Zeroed

FPS de navegador en **Three.js + TypeScript estricto**, sin frameworks de UI ni
motor de físicas. Dependencia única de runtime: `three`. Tests con Vitest.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Dev server (Vite) en `http://localhost:5173` |
| `npm run test` | Suite Vitest (lógica pura, sin WebGL) |
| `npm run typecheck` | `tsc --noEmit` estricto |
| `npm run build` | Typecheck + build de producción |

**Antes de dar por hecho un cambio: `npm run typecheck` y `npm run test` deben
estar verdes.** No hay CI que te salve.

## Reglas de oro del código

1. **La lógica NO toca Three.js.** `Weapon`, `RecoilController`, `trajectory`,
   `RoundManager`, `MysteryBoxMachine`, `selectChainTargets`… son TypeScript
   puro y se testean sin navegador. El render/audio se suscribe a colas de
   eventos (`pendingEvents`). Si tu lógica importa `three`, probablemente está
   en el sitio equivocado.
2. **Las armas son data, no clases.** Toda la personalidad vive en
   `WeaponDefinition` ([src/config/weapons.ts](../src/config/weapons.ts)). Para
   añadir un arma: `WeaponId` en
   [WeaponTypes.ts](../src/weapons/WeaponTypes.ts) + definición + (zombies)
   id en `ZOMBIES_WEAPON_PRELOAD`. No hay subclases.
3. **Pools fijos, sin allocations por frame.** Balística (32), casquillos,
   chispas, humo, proyectiles de energía y arcos Tesla son round-robin. Los
   `Vector3` temporales de los loops son campos `private readonly tmp*`
   reutilizados. Nada de `new` dentro de `update()`.
4. **Móvil y desktop son un solo código.** `DeviceProfile` decide calidad
   (`useReducedEffects`, `pixelRatioLimit`, sombras estáticas). No dupliques
   lógica por plataforma.
5. **TDD para lógica nueva.** Escribe el test primero (rojo), implementa
   (verde). Los tests viven en [tests/](../tests/) y son deterministas: inyecta
   `rng` en vez de `Math.random`.
6. **Estado centralizado, sin duplicados.** Points viven SOLO en
   `PlayerEconomy` ([src/game/PlayerEconomy.ts](../src/game/PlayerEconomy.ts)):
   toda recompensa (`awardHit`/`awardKill`) y todo gasto (`spend`) pasa por ahí.
   La reserva de munición la decide el MODO (`GameMode.reserveAmmoFor`), no la
   `WeaponDefinition` compartida. La pausa es un flag de simulación en `Game`
   (`paused`), no una pantalla oculta.
7. **El game loop respeta la pausa.** `Game.tick()` consume el delta del clock
   pero, si `paused`, solo renderiza el frame congelado: no avanza player,
   weapon, ballistics, mode, effects ni timers. No bases pausa en ocultar UI
   o bloquear inputs.
8. **Visibilidad explícita en TypeScript.** Todos los métodos y propiedades de
   clases deben declarar `public`, `private`, `protected` o `static` cuando
   aplique, y el tipo de retorno siempre debe estar tipado. `static` solo se
   usa para lógica que no depende de `this`; no conviertas funciones de
   instancia en `public static` por costumbre.

## Mapa de la arquitectura

```
src/
  core/Game.ts            Raíz: renderer, loop, cableado. Mode-agnóstico.
  modes/GameMode.ts       Contrato de modos + ModeContext (lo que un modo ve).
  modes/ShootingRangeMode.ts  Campo de tiro clásico.
  modes/ZombiesMode.ts    Rondas, salud, Mystery Box, Ray Gun, Tesla.
  weapons/                Weapon (lógica) + WeaponView (visual) + configs.
  shooting/               BallisticsSystem (segmentos) + trajectory (puro).
  zombies/                ZombieManager (pool+steering), Zombie, ZombieVisual,
                          RoundManager, MysteryBox, EnergyProjectiles,
                          ChainLightning, ZombieConfig (tuning + math pura).
  rendering/Effects.ts    Pools de impactos/casquillos/humo.
  audio/AudioSystem.ts    Web Audio procedural (sin assets salvo 1 MP3).
  ui/HUD.ts               HUD DOM; solo escribe cuando el valor cambia.
public/assets/            GLBs y texturas PBR (ver ASSETS.md).
```

## Dos modos, un solo shell

`Game` es agnóstico del modo. Cada modo implementa `GameMode` y recibe un
`ModeContext`. Lo zombie no sabe nada del campo de tiro y viceversa.

- **Shooting Range**: armas con reserva infinita, un slot por arma.
- **Zombies**: empieza solo con la M1911, inventario de 2 slots
  (`WeaponInventory`), reserva finita por arma (`ZOMBIES_RESERVE_AMMO`),
  economía de **Points** (`PlayerEconomy`), Mystery Box (950 PTS), y dos
  Wonder Weapons por hitos de bajas (ver abajo).

### Points (solo Zombies)

Recompensas centralizadas en `PlayerEconomy`: hit no letal `+10`, baja normal
`+50`, headshot letal `+100` (nunca se suman baja + headshot: una sola rama
en `awardKill`). Todos los kills —bala, splash Ray Gun, cadena Tesla— pasan por
`onZombieKilled`, así que el kill reward vive en un único sitio. La Mystery Box
cobra con `economy.spend(950)` atómico antes de activarse; la máquina de
estados de la box (solo activa desde `closed`) evita dobles cobros.

## Wonder Weapons (solo Zombies)

| Arma | Desbloqueo | Mecánica |
| --- | --- | --- |
| **ZEUS-77 Tesla** | `TESLA_UNLOCK_KILLS = 100` | Descarga que **encadena** entre zombies. |

El patrón de desbloqueo es idéntico para ambas: un flag `*Unlocked` en
`ZombiesMode`, comprobado en `onZombieKilled`, que concede el arma vía
`ctx.grantWeapon` + banner + sting, exactamente una vez por run. `restart()`
re-arma los flags. Las energy weapons disparan un bolt visible
(`EnergyProjectiles`) en vez de balística hitscan; `onEnergyImpact` distingue
Tesla de Ray Gun **por el color del bolt** (`config.color`).

## Pausa

Menú real (RESUME / RESTART / MAIN MENU) sobre un flag `paused` en `Game` que
detiene la simulación en el `tick`. Desktop: ESC libera el pointer lock y
`onLockChange(false)` abre el menú (no se puede interceptar ESC antes del
unlock — ábrelo EN el handler). Móvil: botón `| |` → `Input.onPauseRequest`.
RESUME re-bloquea y continúa; RESTART llama a `mode.onRestartRequested()`;
MAIN MENU hace `location.reload()`. El game over suprime la pausa vía
`onPointerUnlock()`.

## Historial de cambios

Cada cambio sustancial tiene una nota concisa en
[docs/changes/](../docs/changes/). Léelas para entender decisiones y gotchas
antes de tocar esos sistemas. Formato: qué, por qué, dónde, y lo aprendido.
