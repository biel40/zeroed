# Tasks: Burned Mansion Zombies Map

## Phase 1: Foundation

- [ ] 1.1 Create `src/zombies/maps/ZombieArena.ts` with the arena interface.
- [ ] 1.2 Create `src/zombies/maps/ClassicArena.ts` wrapping `ShootingRange` + `NightEnvironment`.
- [ ] 1.3 Modify `ZombieSpawner` to accept spawn points in its constructor.
- [ ] 1.4 Add `awardRepair()` and round cap to `PlayerEconomy`.
- [ ] 1.5 Add wood/repair SFX placeholders to `AudioSystem`.

## Phase 2: Barriers & Doors (Pure Logic + View)

- [ ] 2.1 Create `WindowBarrier` pure logic with board HP and states.
- [ ] 2.2 Create `WindowBarrierView` with instanced boards.
- [ ] 2.3 Create `PointDoor` pure logic with cost and unlock.
- [ ] 2.4 Create `PointDoorView`.
- [ ] 2.5 Write unit tests for barrier and door logic.

## Phase 3: Zombie AI Extension

- [ ] 3.1 Extend `Zombie` with an optional `barrierTarget`.
- [ ] 3.2 Modify `ZombieManager` to assign barrier targets at spawn and steer zombies toward barriers.
- [ ] 3.3 Make zombies attack barrier boards when in range.
- [ ] 3.4 Clear barrier target once breached and resume player chase.

## Phase 4: Mansion Arena & Player Movement

- [ ] 4.1 Add optional wall colliders and floor transition to `PlayerController`.
- [ ] 4.2 Create `BurnedMansionConfig.ts` with constants.
- [ ] 4.3 Create `BurnedMansionArena` geometry, spawns, barriers, doors and ambience.
- [ ] 4.4 Wire arena into `ZombiesMode` (mapId, init, update, prompts, repair).

## Phase 5: UI & Mode Selection

- [ ] 5.1 Add map picker to `HUD` after Zombies mode selection.
- [ ] 5.2 Pass selected mapId from `main.ts` to `ZombiesMode`.

## Phase 6: Testing & Verification

- [ ] 6.1 Run `npm run typecheck` and fix errors.
- [ ] 6.2 Run `npm run test` and fix failures.
- [ ] 6.3 Smoke-test classic map for regressions.
- [ ] 6.4 Write a brief note in `docs/changes/2026-08-14-burned-mansion-map/README.md`.
