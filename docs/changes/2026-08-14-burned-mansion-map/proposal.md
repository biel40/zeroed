# Proposal: Burned Mansion Zombies Map

## Intent

Add a second Zombies map — a compact two-floor burned mansion with boardable windows and point-unlock doors — while reusing all existing round/economy/health/Mystery Box/Wonder Weapon systems. The current outdoor Zombies map must keep working exactly as before.

## Scope

### In Scope
1. `mapId` parameter for `ZombiesMode` (`'classic'` default, `'burned-mansion'`).
2. `ZombieArena` contract that encapsulates geometry, colliders, spawn points, barriers, doors, Mystery Box placement and ambience.
3. `ClassicArena` adapter that wraps the existing `ShootingRange` + `NightEnvironment`.
4. `BurnedMansionArena` with a new interior environment, 6-8 window barriers, 2-3 point-doors, Mystery Box and positional ambience.
5. Reusable `WindowBarrier` (logic + view) with board health, zombie attack and player repair.
6. Reusable `PointDoor` (logic + view) with point cost and atomic unlock.
7. Zombie AI extension to approach, attack and breach barriers before chasing the player.
8. Player repair interaction (hold E / mobile interact) awarding +10 points per board with a per-round cap.
9. Inject spawn points per arena and add new spawns when doors unlock.
10. Basic player wall collision and a simple floor-transition system for the two-floor mansion.
11. Tests for all new pure logic (barriers, doors, repair economy cap).

### Out of Scope
- A third Zombies map.
- Full rigid-body physics or destructible geometry beyond boards.
- New weapons or Wonder Weapons.
- Multiplayer.
- Procedural mansion generation.

## Approach

Parametrize `ZombiesMode` with a `ZombieArena`. The mode keeps owning rounds, economy, health, box, Wonder Weapons and HUD; the arena owns geometry, spawn points, barriers, doors and ambience. The classic arena reuses today's `ShootingRange` unchanged. The new mansion arena hides the range group and adds its own optimized geometry.

The biggest architectural gap is player movement: `PlayerController` currently clamps to a fixed rectangle and has no wall collision or verticality. We add optional AABB wall collision and a simple floor-transition trigger for the mansion stairs, keeping the classic map untouched.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/modes/ZombiesMode.ts` | Modify | Accept `mapId`, delegate geometry/spawns/barriers/doors to arena |
| `src/main.ts` | Modify | Mode/map selection flow |
| `src/ui/HUD.ts` | Modify | Show map picker after mode selection |
| `src/player/PlayerController.ts` | Modify | Optional wall collision + floor transitions |
| `src/zombies/ZombieManager.ts` | Modify | Injected spawn points + barrier targets |
| `src/zombies/ZombieSpawner.ts` | Modify | Accept spawn points in constructor |
| `src/game/PlayerEconomy.ts` | Modify | Add `awardRepair()` with round cap |
| `src/zombies/maps/*` | Create | `ZombieArena`, `ClassicArena`, `BurnedMansionArena` |
| `src/zombies/barriers/*` | Create | `WindowBarrier`, `WindowBarrierView` |
| `src/zombies/doors/*` | Create | `PointDoor`, `PointDoorView` |
| `src/audio/AudioSystem.ts` | Modify | Wood/ambience SFX |
| `tests/` | Create | Barrier, door, repair economy tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Regressions in zombie steering (already iterated 3x) | Medium | Keep classic path unchanged; only enable barrier steering for mansion map; add tests |
| Player collision/verticality breaks classic feel | Low | Collision is opt-in per arena; classic uses old bounds |
| Per-frame allocations / draw-call budget | Medium | Reuse geometries/materials, use `InstancedMesh` for boards, respect `DeviceProfile` |
| Mobile repair interaction feels bad | Medium | Reuse existing touch interact button and hold logic |

## Rollback Plan

Revert to the previous `ZombiesMode` constructor signature and remove the new map files. The classic map code remains isolated in `ClassicArena` and the original paths.

## Dependencies

None outside the existing Three.js + Vitest stack.

## Success Criteria

- [ ] `npm run typecheck` passes.
- [ ] `npm run test` passes.
- [ ] Classic Zombies map plays without regressions.
- [ ] Burned Mansion map is selectable and playable.
- [ ] Zombies break boards, player repairs, points are awarded, doors unlock with points, new spawns activate.
