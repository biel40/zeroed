# Sistemas de economía, munición y pausa

**Qué**: cuatro sistemas conectados — (1) munición limitada en Zombies, (2)
Points estilo CoD Zombies, (3) Mystery Box a 950 puntos, (4) menú de pausa
real que detiene la simulación.

**Por qué**: petición de progresión y control de gameplay. Diseño guiado por
tres decisiones del usuario: munición finita **solo en Zombies** (el range
queda infinito), reserva **generosa**, y **ESC abre el menú de pausa**.

## 1. Munición limitada

**Dónde**: `src/zombies/ZombieConfig.ts` (`ZOMBIES_RESERVE_AMMO`),
`src/modes/GameMode.ts` (`reserveAmmoFor?`), `src/modes/ZombiesMode.ts`
(implementación), `src/weapons/Weapon.ts` (`reserveOverride`), `src/core/Game.ts`.

**Cómo**: la `WeaponDefinition` es compartida entre modos, así que el **modo**
decide la reserva, no la definición. `GameMode.reserveAmmoFor(id)` devuelve la
reserva del modo; `Weapon` la recibe como `reserveOverride` opcional que gana
sobre `definition.reserveAmmo`. Zombies mapea desde `ZOMBIES_RESERVE_AMMO`
(M4A1/AK47 300, M60 500, L96 60, Ray Gun 160); M1911 (32) y Tesla (18) ya
tenían reserva en su definición y la conservan. El range no define
`reserveAmmoFor` → bottomless. La box ya entregaba con `resetAmmo()` (munición
inicial), sin cambios. El HUD lee `reserveAmmo` (null → ∞).

**Aprendido**: `arguments.length >= 3` en el constructor de `Weapon` distingue
"sin override" (usa la definición) de "override explícito `undefined`" (fuerza
infinito). Sutil pero necesario para que el range pueda anular una reserva.

## 2. Points (centralizado)

**Dónde**: `src/game/PlayerEconomy.ts` (nuevo, puro), `src/modes/ZombiesMode.ts`,
`src/ui/HUD.ts` + `index.html` (`#z-points`), `src/style.css`.

**Cómo**: una sola wallet `PlayerEconomy`. Recompensas: `awardHit()` (+10 no
letal), `awardKill(headshot)` (+50 normal / +100 headshot, **mutuamente
exclusivos** por construcción — una sola rama). Todos los kills (bala, splash
Ray Gun, cadena Tesla) pasan por `onZombieKilled`, así que el kill reward vive
en un solo sitio. El `+10` por hit solo se otorga cuando `damageZombie`
devuelve `false` (no letal) — por eso `damageZombie` ahora devuelve `boolean`.
HUD muestra `X PTS` en el panel de zombies.

## 3. Mystery Box a 950

**Dónde**: `src/zombies/MysteryBox.ts` (`cost: 950`), `src/modes/ZombiesMode.ts`
(`onInteract`).

**Cómo**: en `onInteract`, si la box está `closed`, se cobra con
`economy.spend(950)` ANTES de `tryActivate()`. Anti-doble-cobro por dos vías
redundantes: `spend()` es atómico (falla sin tocar el balance si no alcanza) Y
`tryActivate()` solo funciona desde `closed`, así que pulsaciones repetidas
durante la animación no re-cobran (la box ya no está cerrada). Si no alcanza:
`flashNotEnoughPoints()` (flash rojo en el contador) + banner. El prompt ya
mostraba el coste. Animación, sonido y entrega intactos.

## 4. Menú de pausa real

**Dónde**: `src/core/Game.ts` (campo `paused`, `pause`/`resume`/`restartRun`,
guard en `tick`), `src/modes/GameMode.ts` (`onRestartRequested?`),
`src/modes/ZombiesMode.ts` (implementación), `src/player/Input.ts`
(`onPauseRequest` + acción `pause`), `src/ui/HUD.ts`, `index.html`
(`#pause-menu`, botón `#btn-pause`), `src/style.css`.

**Cómo**: `paused` es un flag de **simulación**, no de UI. El `tick()` consume
el delta del clock (para no acumular un dt gigante al reanudar) pero, si
`paused`, solo renderiza el frame congelado y sale: no avanzan player, weapon,
ballistics, mode, effects ni timers. **Desktop**: ESC libera el pointer lock
(nivel navegador) → `onLockChange(false)` → `pause()` abre el menú. ESC con el
menú abierto (pointer liberado) → `resume()`. **Móvil**: botón `| |` en
touch-controls → `onPauseRequest` → toggle. RESUME re-bloquea el pointer y
continúa exactamente desde el estado anterior. RESTART → `mode.onRestartRequested()`
(el modo resetea su run). MAIN MENU → `location.reload()` (vuelve al selector
de modos). El game over sigue suprimiendo la pausa (`onPointerUnlock`).

**Aprendido**: la pausa por ESC en desktop NO se puede interceptar antes del
unlock — el navegador libera el pointer primero. El patrón correcto es abrir el
menú EN el handler de unlock, no intentar prevenirlo. Y el `clock.getDelta()`
debe consumirse siempre, incluso pausado, o el primer frame tras reanudar tendría
un dt enorme.

## Verificación

`npm run typecheck` limpio, `npm run test` 241/241 verdes, `npm run build` OK.
Tests nuevos: `tests/playerEconomy.test.ts`, `tests/mysteryBoxPoints.test.ts`.
Actualizado el contrato viejo "box free" en `tests/zombiesProgression.test.ts`.
