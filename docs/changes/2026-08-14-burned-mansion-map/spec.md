# Specs: Burned Mansion Zombies Map

## Domain: Map Selection

### Requirement: Map Picker

The system SHALL allow the player to choose a Zombies map after selecting Zombies mode.

#### Scenario: Choose classic map

- GIVEN the player selected Zombies mode
- WHEN the player chooses the classic map
- THEN `ZombiesMode` initializes the classic outdoor arena
- AND the existing Zombies experience remains unchanged

#### Scenario: Choose burned mansion

- GIVEN the player selected Zombies mode
- WHEN the player chooses the burned mansion map
- THEN `ZombiesMode` initializes the burned-mansion arena
- AND all global systems (rounds, economy, weapons, box) are reused

## Domain: ZombieArena Contract

### Requirement: Arena Encapsulation

The system SHALL expose a `ZombieArena` interface that provides geometry, colliders, spawn points, barriers, doors, Mystery Box placement and per-frame updates.

#### Scenario: Classic arena adapter

- GIVEN the classic arena implementation
- WHEN `ZombiesMode` queries its colliders and spawn points
- THEN it returns the existing `ShootingRange` colliders and the classic `SPAWN_POINTS`

#### Scenario: Mansion arena

- GIVEN the burned-mansion arena implementation
- WHEN `ZombiesMode` queries its colliders and spawn points
- THEN it returns mansion geometry, barriers, doors and at least six window spawn points

## Domain: Window Barriers

### Requirement: Barrier States

The system SHALL represent a window barrier as a set of boards with states `intact`, `damaged`, `destroyed` and `repairing`.

#### Scenario: Zombie attacks board

- GIVEN a window with intact boards
- WHEN a zombie deals damage to a board
- THEN the board loses HP
- AND when its HP reaches zero the board becomes destroyed
- AND when all boards are destroyed the window becomes open

#### Scenario: Player repairs board

- GIVEN a window with destroyed boards
- WHEN the player holds the interact input within range and facing the window
- THEN a board is rebuilt every repair interval
- AND the player receives +10 points per board
- AND repair stops if the player releases interact, moves away, shoots or swaps weapon

### Requirement: Repair Round Cap

The system SHALL limit repair points awarded per window per round to prevent infinite farming.

#### Scenario: Cap reached

- GIVEN a window whose repair cap for the current round is exhausted
- WHEN the player repairs additional boards
- THEN boards are rebuilt but no points are awarded

## Domain: Point Doors

### Requirement: Door Unlock

The system SHALL allow the player to unlock a door by spending points while in range and facing it.

#### Scenario: Successful unlock

- GIVEN a locked door and a player with enough points
- WHEN the player presses interact in range and facing the door
- THEN the points are deducted
- AND the door opens
- AND new spawn points and/or barriers become active

#### Scenario: Insufficient points

- GIVEN a locked door and a player without enough points
- WHEN the player tries to unlock
- THEN the HUD flashes "not enough points"
- AND the door stays locked

## Domain: Zombie AI

### Requirement: Barrier Breaching

The system SHALL make zombies spawned outside the mansion approach a valid barrier, attack its boards, and only chase the player after breaching it.

#### Scenario: Outside zombie

- GIVEN a zombie spawned outside
- WHEN it has a barrier target
- THEN it walks to the barrier
- AND attacks its boards
- AND once open it walks to the player

#### Scenario: Inside zombie

- GIVEN a zombie already inside the mansion
- WHEN it has no barrier target
- THEN it walks directly to the player

## Domain: Player Movement

### Requirement: Wall Collision

The system SHALL prevent the player from walking through mansion walls when the current arena enables collision.

#### Scenario: Walk into wall

- GIVEN the player is moving toward a wall
- WHEN the next position would intersect the wall
- THEN the player slides along the wall

### Requirement: Floor Transition

The system SHALL allow the player to move between floors via a stair trigger.

#### Scenario: Climb stairs

- GIVEN the player is on the ground floor near a stair trigger
- WHEN the player moves into the trigger
- THEN the player's floor changes to the upper floor
- AND movement bounds update accordingly
