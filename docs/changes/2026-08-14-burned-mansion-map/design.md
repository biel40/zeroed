# Design: Burned Mansion Zombies Map

## Technical Approach

Parametrize `ZombiesMode` with a `ZombieArena`. The mode keeps global state (rounds, economy, health, weapons, box, Wonder Weapons, HUD). The arena owns everything physical/positional for a map. This makes the change additive: the classic arena adapter wraps today's `ShootingRange` with zero behavior change.

## Architecture Decisions

### Decision: Single `ZombiesMode` with arena strategy

**Choice**: `new ZombiesMode(mapId)` selects an arena instance internally.
**Alternatives considered**: Two full mode classes (duplicates logic); shared base class (overkill for two maps).
**Rationale**: Minimizes duplication, keeps existing classic path intact.

### Decision: Opt-in player wall collision

**Choice**: `PlayerController` accepts an optional `wallColliders` array and a `floor` index. Classic arena passes nothing and keeps fixed `PLAYER_BOUNDS`.
**Alternatives considered**: Full rigid-body physics; leaving player as ghost.
**Rationale**: Mansion needs walls, but classic does not. Swept AABB collision in XZ is enough for an arcade shooter.

### Decision: Floor transition via trigger zones

**Choice**: Stairs are invisible trigger AABBs. Entering one smoothly interpolates the rig Y and swaps the active wall collider set / bounds.
**Alternatives considered**: Real ramp physics; teleport.
**Rationale**: Avoids introducing gravity/ground detection while still giving a two-floor feel.

### Decision: Pure logic for barriers/doors

**Choice**: `WindowBarrier` and `PointDoor` are pure TS machines with separate `*View` classes for Three.js.
**Alternatives considered**: Single mixed class.
**Rationale**: Matches `MysteryBoxMachine`/`MysteryBoxView` pattern; pure logic is testable without WebGL.

## Data Flow

```
main.ts / HUD
    └── ZombiesMode(mapId)
        ├── ClassicArena  ( ShootingRange + NightEnvironment )
        └── BurnedMansionArena
            ├── geometry group
            ├── colliders (walls, floors)
            ├── spawn points per unlocked zone
            ├── WindowBarrier[]  <── ZombieManager
            ├── PointDoor[]      <── ZombiesMode.onInteract
            └── MysteryBox placement

ZombieManager
    └── zombies with optional barrierTarget
        └── seek barrier → attack boards → clear target → seek player

PlayerController
    └── optional wallColliders + floorTransition
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/zombies/maps/ZombieArena.ts` | Create | Arena interface |
| `src/zombies/maps/ClassicArena.ts` | Create | Adapter for existing range |
| `src/zombies/maps/BurnedMansionArena.ts` | Create | Mansion geometry, spawns, ambience |
| `src/zombies/maps/BurnedMansionConfig.ts` | Create | Pure constants (costs, board HP, repair speed, cap) |
| `src/zombies/barriers/WindowBarrier.ts` | Create | Pure barrier logic |
| `src/zombies/barriers/WindowBarrierView.ts` | Create | Three.js view for boards |
| `src/zombies/doors/PointDoor.ts` | Create | Pure door logic |
| `src/zombies/doors/PointDoorView.ts` | Create | Three.js view for doors |
| `src/modes/ZombiesMode.ts` | Modify | Use arena, wire barriers/doors/repair |
| `src/main.ts` | Modify | Pass mapId to ZombiesMode |
| `src/ui/HUD.ts` | Modify | Add map selection after mode selection |
| `src/player/PlayerController.ts` | Modify | Optional wall collision + floor transition |
| `src/zombies/ZombieManager.ts` | Modify | Injected spawn points + barrier targets |
| `src/zombies/ZombieSpawner.ts` | Modify | Constructor accepts spawn points |
| `src/game/PlayerEconomy.ts` | Modify | Add `awardRepair()` with round cap |
| `src/audio/AudioSystem.ts` | Modify | Add wood hammer/repair and ambience sounds |
| `tests/barrier.test.ts` | Create | Barrier damage/repair logic |
| `tests/pointDoor.test.ts` | Create | Door unlock logic |
| `tests/playerEconomyRepair.test.ts` | Create | Repair reward cap |

## Interfaces

```ts
export interface ZombieArena {
  readonly id: string;
  readonly group: THREE.Group;
  readonly colliders: readonly THREE.Object3D[];
  readonly spawnPoints: ReadonlyArray<readonly [number, number]>;
  readonly barriers: readonly WindowBarrier[];
  readonly doors: readonly PointDoor[];
  readonly mysteryBoxPlacement: MysteryBoxPlacement;
  readonly playerBounds?: PlayerBounds;
  readonly useWallCollision: boolean;
  update(dt: number): void;
  onPlayerFloorChange?(floor: number): void;
}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | `WindowBarrier`, `PointDoor`, `PlayerEconomy.awardRepair` | Pure TS tests with injected rng |
| Integration | `ZombieManager` barrier targeting | Mock arena/barriers |
| Manual | Classic map regression | Play through rounds |

## Open Questions

- Should the stair transition be automatic or require interact? Decision: automatic on contact to keep movement fluid.
