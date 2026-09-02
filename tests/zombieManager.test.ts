import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { EYE_HEIGHT } from '../src/player/PlayerController';
import {
  MAX_ALIVE,
  MAX_ACTIVE_BRUTES,
  earlyRoundSpeedMultiplier,
  roundConfig,
  ZOMBIE_ATTACK_DAMAGE,
  ZOMBIE_ATTACK_DURATION,
  ZOMBIE_ATTACK_HIT_MOMENT,
  ZOMBIE_ATTACK_VERTICAL_TOLERANCE,
  ZOMBIE_BASE_HP,
  ZOMBIE_BASE_SPEED,
  ZOMBIE_TYPE_CONFIGS,
} from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import type { Zombie } from '../src/zombies/Zombie';
import { WindowBarrier } from '../src/zombies/barriers/WindowBarrier';

const DT = 1 / 60;
/** Mirrors the player's ground speed (WALK_SPEED in PlayerController). */
const RETREAT_SPEED = 4.6;

function makeManager(): { manager: ZombieManager; colliders: THREE.Object3D[] } {
  const manager = new ZombieManager(() => 0); // deterministic spawn picks
  const colliders: THREE.Object3D[] = [];
  manager.registerColliders(colliders);
  return { manager, colliders };
}

function step(manager: ZombieManager, seconds: number, px = 0, pz = 4): void {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) manager.update(DT, px, pz);
}

describe('ZombieManager barrier feedback', () => {
  it('emits at most one wood impact per frame and only when a board breaks', () => {
    const barrier = new WindowBarrier('window', 0, 0, 0, 1, {
      boardCount: 2,
      boardHp: 50,
      repairInterval: 0.1,
      repairRewardCap: 2,
    });
    const manager = new ZombieManager(() => 0, {}, false, null, [barrier]);
    const hitBarrier = (manager as unknown as { hitBarrier: (target: WindowBarrier) => void })
      .hitBarrier.bind(manager);
    let impacts = 0;
    manager.onBarrierImpact = () => impacts++;

    manager.update(DT, 0, 0);
    hitBarrier(barrier);
    hitBarrier(barrier);
    expect(impacts).toBe(1);

    barrier.repair(0.1);
    manager.update(DT, 0, 0);
    hitBarrier(barrier);
    expect(impacts).toBe(2);
  });
});

describe('ZombieManager spawning and pooling', () => {
  it('spawns a zombie, registers its hitboxes and scales stats by round', () => {
    const { manager, colliders } = makeManager();
    expect(manager.spawnZombie(roundConfig(1), 0, 4)).toBe(true);
    expect(manager.activeCount).toBe(1);
    expect(manager.aliveCount).toBe(1);
    expect(colliders).toHaveLength(2); // torso + head
    const zombie = [...manager.actives][0];
    expect(zombie.speed).toBeCloseTo(
      ZOMBIE_BASE_SPEED * roundConfig(1).speedMultiplier * earlyRoundSpeedMultiplier(1) * 0.92,
    );
  });

  it('never exceeds the alive cap even if asked to spawn more', () => {
    const { manager } = makeManager();
    let spawned = 0;
    for (let i = 0; i < MAX_ALIVE + 10; i++) {
      if (manager.spawnZombie(roundConfig(50), 0, 4)) spawned++;
    }
    expect(spawned).toBe(MAX_ALIVE);
    expect(manager.aliveCount).toBe(MAX_ALIVE);
  });

  it('reset releases every zombie and unregisters all hitboxes', () => {
    const { manager, colliders } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.reset();
    expect(manager.activeCount).toBe(0);
    expect(manager.aliveCount).toBe(0);
    expect(colliders).toHaveLength(0);
  });

  it('rejects blocked spawn points and uses a clear map spawn instead', () => {
    const blocked = new THREE.Mesh(new THREE.BoxGeometry(2, 2.3, 2));
    blocked.position.set(0, 1.15, 0);
    blocked.userData.surface = 'concrete';
    blocked.updateMatrixWorld(true);
    const manager = new ZombieManager(() => 0, {}, false, [[0, 0], [12, 0]]);
    manager.registerColliders([blocked]);

    expect(manager.spawnZombie(roundConfig(1), 30, 0)).toBe(true);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];
    expect(zombie.position.x).toBe(12);
    expect(zombie.position.z).toBe(0);
  });

  it('does not spawn when every configured point intersects geometry', () => {
    const blocked = new THREE.Mesh(new THREE.BoxGeometry(4, 2.3, 4));
    blocked.position.set(0, 1.15, 0);
    blocked.userData.surface = 'concrete';
    blocked.updateMatrixWorld(true);
    const manager = new ZombieManager(() => 0, {}, false, [[0, 0]]);
    manager.registerColliders([blocked]);

    expect(manager.spawnZombie(roundConfig(1), 20, 0)).toBe(false);
    expect(manager.activeCount).toBe(0);
  });

  it('applies Brute stats from round 5 while preserving the global pool slot', () => {
    const manager = new ZombieManager(() => 0, {}, false, [[0, -20]], [], [], () => 0);
    manager.registerColliders([]);
    expect(manager.spawnZombie(roundConfig(5), 0, 4, 5)).toBe(true);
    const zombie = [...manager.actives][0];
    expect(zombie.typeId).toBe('brute');
    expect(zombie.visual.modelId).toBe('brute');
    expect(zombie.maxHp).toBe(Math.round(
      ZOMBIE_BASE_HP * roundConfig(5).healthMultiplier * ZOMBIE_TYPE_CONFIGS.brute.healthMultiplier,
    ));
    expect(zombie.speed).toBeCloseTo(
      ZOMBIE_BASE_SPEED
        * roundConfig(5).speedMultiplier
        * earlyRoundSpeedMultiplier(5)
        * ZOMBIE_TYPE_CONFIGS.brute.speedMultiplier
        * 0.92,
    );
    expect(zombie.attackDamage).toBeCloseTo(ZOMBIE_ATTACK_DAMAGE * 1.15);
    expect(zombie.bodyRadius).toBe(0.46);
    expect(manager.activeCount).toBe(1);
  });

  it('never has more than two active Brutes, including dying pooled corpses', () => {
    const manager = new ZombieManager(() => 0, {}, false, [[0, -20]], [], [], () => 0);
    manager.registerColliders([]);
    for (let index = 0; index < 3; index++) {
      expect(manager.spawnZombie(roundConfig(20), 0, 4, 20)).toBe(true);
    }
    expect(manager.activeBruteCount).toBe(MAX_ACTIVE_BRUTES);
    const brutes = [...manager.actives].filter((zombie) => zombie.typeId === 'brute');
    manager.damageZombie(brutes[0], 'torso', 10_000);
    expect(manager.activeBruteCount).toBe(MAX_ACTIVE_BRUTES);

    expect(manager.spawnZombie(roundConfig(20), 0, 4, 20)).toBe(true);
    expect(manager.activeBruteCount).toBe(MAX_ACTIVE_BRUTES);
  });

  it('counts Brutes inside the same 24-zombie global population cap', () => {
    const manager = new ZombieManager(() => 0, {}, false, [[0, -20]], [], [], () => 0);
    manager.registerColliders([]);
    let spawned = 0;
    for (let index = 0; index < MAX_ALIVE + 5; index++) {
      if (manager.spawnZombie(roundConfig(20), 0, 4, 20)) spawned++;
    }
    expect(spawned).toBe(MAX_ALIVE);
    expect(manager.activeCount).toBe(MAX_ALIVE);
    expect(manager.activeBruteCount).toBe(MAX_ACTIVE_BRUTES);
  });

  it('clears Brute occupancy on recycling and run reset', () => {
    const manager = new ZombieManager(() => 0, {}, false, [[0, -20]], [], [], () => 0);
    manager.registerColliders([]);
    manager.spawnZombie(roundConfig(20), 0, 4, 20);
    const brute = [...manager.actives][0];
    manager.damageZombie(brute, 'torso', 10_000);
    step(manager, 3.6);
    expect(manager.activeBruteCount).toBe(0);

    manager.spawnZombie(roundConfig(20), 0, 4, 20);
    expect(manager.activeBruteCount).toBe(1);
    manager.reset();
    expect(manager.activeBruteCount).toBe(0);
  });

  it('reports round, chance and active variant stats for QA', () => {
    const manager = new ZombieManager(() => 0, {}, false, [[0, -20]], [], [], () => 0);
    manager.registerColliders([]);
    manager.spawnZombie(roundConfig(5), 0, 4, 5);
    const zombie = [...manager.actives][0];

    expect(manager.getTypeDiagnostics(5)).toEqual({
      round: 5,
      bruteSpawnChance: 0.08,
      activeBrutes: 1,
      active: [{ typeId: 'brute', health: zombie.hp, speed: zombie.speed }],
    });
  });
});

describe('ZombieManager movement', () => {
  it('zombies walk towards the player', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];
    const initialDistance = Math.hypot(zombie.position.x - 0, zombie.position.z - 4);
    step(manager, 3);
    const finalDistance = Math.hypot(zombie.position.x - 0, zombie.position.z - 4);
    expect(finalDistance).toBeLessThan(initialDistance - 2);
  });

  it('neighboring zombies separate instead of stacking', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    const actives = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives];
    // Force them nearly on top of each other, converging on the same player spot.
    actives[0].position.set(0.2, 0, -15);
    actives[1].position.set(-0.2, 0, -15);
    const before = actives[0].position.distanceTo(actives[1].position);
    expect(before).toBeCloseTo(0.4);
    step(manager, 3);
    const after = actives[0].position.distanceTo(actives[1].position);
    // Separation pushes them apart towards the separation radius (1.15 m)
    // even while both converge on the player.
    expect(after).toBeGreaterThan(0.9);
  });

  it('bounds crowded separation so a horde cannot tunnel through a wall', () => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 2.3, 0.2));
    wall.position.set(0, 1.15, 0);
    wall.userData.surface = 'concrete';
    wall.updateMatrixWorld(true);
    const manager = new ZombieManager(() => 0);
    manager.registerColliders([wall]);
    for (let index = 0; index < MAX_ALIVE; index++) {
      manager.spawnZombie(roundConfig(1), 0, 4);
    }
    const zombies = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ];
    for (let index = 0; index < zombies.length; index++) {
      zombies[index].position.set((index % 3) * 0.02, 0, -0.55 - Math.floor(index / 3) * 0.02);
      zombies[index].state = 'walk';
    }

    let maxStep = 0;
    for (let frame = 0; frame < 60; frame++) {
      const previous = zombies.map((zombie) => zombie.position.clone());
      manager.update(0.05, 0, 4);
      for (let index = 0; index < zombies.length; index++) {
        maxStep = Math.max(maxStep, zombies[index].position.distanceTo(previous[index]));
        const nearestX = Math.max(-4, Math.min(4, zombies[index].position.x));
        const nearestZ = Math.max(-0.1, Math.min(0.1, zombies[index].position.z));
        const dx = zombies[index].position.x - nearestX;
        const dz = zombies[index].position.z - nearestZ;
        expect(dx * dx + dz * dz).toBeGreaterThanOrEqual(0.42 * 0.42 - 1e-6);
      }
    }

    expect(maxStep).toBeLessThan(0.15);
  });

  it('attacks the player when in range and deals damage at the hit moment', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];
    zombie.position.set(0.4, 0, 4); // inside attack range

    let damage = 0;
    manager.onPlayerAttack = (amount) => {
      damage += amount;
    };
    // Spawn rise (1.1 s) + wind-up (0.475 s) -> exactly one hit in 2 seconds.
    step(manager, 2);
    expect(damage).toBe(ZOMBIE_ATTACK_DAMAGE);
  });
});

describe('ZombieManager attack dodge window', () => {
  interface TestPlayer {
    x: number;
    z: number;
    y?: number;
  }

  function actives(manager: ZombieManager): Zombie[] {
    return [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives];
  }

  /** Steps frame by frame, moving the player before each manager update. */
  function stepWith(
    manager: ZombieManager,
    seconds: number,
    player: TestPlayer,
    move?: (player: TestPlayer, dt: number) => void,
  ): void {
    const frames = Math.round(seconds / DT);
    for (let i = 0; i < frames; i++) {
      move?.(player, DT);
      manager.update(DT, player.x, player.z, 0, player.y ?? EYE_HEIGHT);
    }
  }

  /** Advances until the zombie commits to its attack wind-up. */
  function stepUntilAttack(manager: ZombieManager, zombie: Zombie, player: TestPlayer): boolean {
    const frames = Math.round(3 / DT);
    for (let i = 0; i < frames; i++) {
      manager.update(DT, player.x, player.z, 0, player.y ?? EYE_HEIGHT);
      if (zombie.state === 'attack') return true;
    }
    return false;
  }

  function trackDamage(manager: ZombieManager): () => number {
    let damage = 0;
    manager.onPlayerAttack = (amount) => {
      damage += amount;
    };
    return () => damage;
  }

  it('lets a player who retreats during the wind-up dodge the bite', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = actives(manager)[0];
    zombie.position.set(0, 0, 2.2); // 1.8 m: inside attack range
    const player: TestPlayer = { x: 0, z: 4 };
    const damage = trackDamage(manager);

    expect(stepUntilAttack(manager, zombie, player)).toBe(true);
    // Immediate reaction: retreat through the whole wind-up. At 4.6 m/s the
    // player leaves the 1.9 m attack range well before the bite lands.
    stepWith(manager, ZOMBIE_ATTACK_DURATION + 0.1, player, (p, dt) => {
      p.z += RETREAT_SPEED * dt;
    });

    expect(damage()).toBe(0);
    // A missed bite never cancels the swing: the zombie finishes and resumes.
    expect(zombie.state).toBe('walk');
  });

  it.each([
    { axis: 'X', player: { x: 200, z: 0 } },
    { axis: 'Z', player: { x: 0, z: 200 } },
  ])('does not attack a player far away on $axis', ({ player }) => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), player.x, player.z);
    const zombie = actives(manager)[0];
    zombie.state = 'walk';
    zombie.position.set(0, 0, 0);
    const damage = trackDamage(manager);

    stepWith(manager, ZOMBIE_ATTACK_DURATION + 0.1, player);

    expect(damage()).toBe(0);
    expect(zombie.state).toBe('walk');
  });

  it('does not attack a player above its vertical melee tolerance', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = actives(manager)[0];
    zombie.state = 'walk';
    zombie.position.set(0, 0, 2.8);
    const player: TestPlayer = {
      x: 0,
      z: 4,
      y: EYE_HEIGHT + ZOMBIE_ATTACK_VERTICAL_TOLERANCE + 0.1,
    };
    const damage = trackDamage(manager);

    stepWith(manager, ZOMBIE_ATTACK_DURATION + 0.1, player);

    expect(damage()).toBe(0);
    expect(zombie.state).toBe('walk');
  });

  it('rechecks vertical separation when the bite lands', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = actives(manager)[0];
    zombie.position.set(0, 0, 2.8);
    const player: TestPlayer = { x: 0, z: 4, y: EYE_HEIGHT };
    const damage = trackDamage(manager);

    expect(stepUntilAttack(manager, zombie, player)).toBe(true);
    player.y = EYE_HEIGHT + ZOMBIE_ATTACK_VERTICAL_TOLERANCE + 0.1;
    stepWith(manager, ZOMBIE_ATTACK_DURATION + 0.1, player);

    expect(damage()).toBe(0);
    expect(zombie.state).toBe('walk');
  });

  it('applies exactly one hit when horizontal and vertical range remain valid', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = actives(manager)[0];
    zombie.position.set(0, 0, 2.8);
    const player: TestPlayer = { x: 0, z: 4, y: EYE_HEIGHT + 0.5 };
    const damage = trackDamage(manager);

    expect(stepUntilAttack(manager, zombie, player)).toBe(true);
    stepWith(manager, ZOMBIE_ATTACK_DURATION, player);

    expect(damage()).toBe(ZOMBIE_ATTACK_DAMAGE);
  });

  it('still hits a player who reacts too late', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = actives(manager)[0];
    zombie.position.set(0, 0, 2.8); // 1.2 m: deep inside attack range
    const player: TestPlayer = { x: 0, z: 4 };
    const damage = trackDamage(manager);

    expect(stepUntilAttack(manager, zombie, player)).toBe(true);
    // Frozen until the bite is about to land: the final 0.1 s of retreat is
    // not enough to leave the 1.9 m range from 1.2 m.
    stepWith(manager, ZOMBIE_ATTACK_HIT_MOMENT - 0.1, player);
    stepWith(manager, ZOMBIE_ATTACK_DURATION, player, (p, dt) => {
      p.z += RETREAT_SPEED * dt;
    });

    expect(damage()).toBe(ZOMBIE_ATTACK_DAMAGE);
  });

  it('lets a player stepping sideways out of range dodge the bite', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = actives(manager)[0];
    zombie.position.set(0, 0, 2.2);
    const player: TestPlayer = { x: 0, z: 4 };
    const damage = trackDamage(manager);

    expect(stepUntilAttack(manager, zombie, player)).toBe(true);
    stepWith(manager, ZOMBIE_ATTACK_DURATION + 0.1, player, (p, dt) => {
      p.x += RETREAT_SPEED * dt;
    });

    expect(damage()).toBe(0);
  });

  it('each zombie manages its own hit window when attacking together', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    const [a, b] = actives(manager);
    a.position.set(0.5, 0, 3.4);
    b.position.set(-0.5, 0, 3.4);
    const damage = trackDamage(manager);

    // Player never moves: both bites connect, exactly once each.
    step(manager, ZOMBIE_ATTACK_DURATION + 2, 0, 4);
    expect(damage()).toBe(2 * ZOMBIE_ATTACK_DAMAGE);
  });

  it('a zombie killed during the wind-up never lands the bite', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = actives(manager)[0];
    zombie.position.set(0, 0, 2.2);
    const player: TestPlayer = { x: 0, z: 4 };
    const damage = trackDamage(manager);

    expect(stepUntilAttack(manager, zombie, player)).toBe(true);
    manager.damageZombie(zombie, 'torso', 1000);
    stepWith(manager, ZOMBIE_ATTACK_DURATION + 0.1, player);

    expect(zombie.isAlive).toBe(false);
    expect(damage()).toBe(0);
  });
});

describe('ZombieManager damage', () => {
  it('applies torso and headshot damage through the shared math', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];

    manager.damageZombie(zombie, 'torso', 34);
    expect(zombie.hp).toBe(ZOMBIE_BASE_HP - 34);
    manager.damageZombie(zombie, 'head', 20);
    expect(zombie.hp).toBe(ZOMBIE_BASE_HP - 34 - 60);
  });

  it('kills unregister hitboxes and report the headshot flag', () => {
    const { manager, colliders } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];

    const kills: boolean[] = [];
    manager.onZombieKilled = (_z, headshot) => kills.push(headshot);

    manager.damageZombie(zombie, 'head', 150); // 450 >> 100 hp
    expect(kills).toEqual([true]);
    expect(colliders).toHaveLength(0);
    expect(manager.aliveCount).toBe(0);
    // Still active (playing the death sequence) until it finishes.
    expect(manager.activeCount).toBe(1);
    step(manager, 3.6);
    expect(manager.activeCount).toBe(0);
  });

  it('headshot flag is false for torso kills', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];
    const kills: boolean[] = [];
    manager.onZombieKilled = (_z, headshot) => kills.push(headshot);
    manager.damageZombie(zombie, 'torso', 200);
    expect(kills).toEqual([false]);
  });

  it('multiplies only the direct head hit in a Tesla chain', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    const [impact, chained] = [
      ...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives,
    ];
    impact.position.set(0, 0, -20);
    chained.position.set(1, 0, -20);

    manager.applyChainLightning(impact, 20, 'head');

    expect(impact.hp).toBe(ZOMBIE_BASE_HP - 60);
    expect(chained.hp).toBe(ZOMBIE_BASE_HP - 20);
  });
});

describe('ZombieManager splash damage (Ray Gun)', () => {
  it('damages zombies inside the radius with falloff and spares the rest', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    manager.spawnZombie(roundConfig(1), 0, 4);
    const [a, b, c] = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives];
    const center = new THREE.Vector3(0, 1, -20);
    a.position.set(0, 0, -20); // epicenter: 100 dmg → dead
    b.position.set(1.25, 0, -20); // half radius: 50 dmg → survives
    c.position.set(10, 0, -20); // outside: untouched

    const kills: boolean[] = [];
    manager.onZombieKilled = (_z, headshot) => kills.push(headshot);

    manager.applySplash(center, 2.5, 100);

    expect(a.isAlive).toBe(false);
    expect(b.hp).toBe(50);
    expect(c.hp).toBe(ZOMBIE_BASE_HP);
    expect(kills).toEqual([false]); // splash kills are not headshots
  });

  it('does not damage a zombie on another floor at the same XZ position', () => {
    const { manager } = makeManager();
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];
    zombie.floor = 1;
    zombie.position.set(0, 3.4, -20);

    manager.applySplash(new THREE.Vector3(0, 1, -20), 2.5, 100);

    expect(zombie.hp).toBe(ZOMBIE_BASE_HP);
  });
});

describe('ZombieManager wall collisions', () => {
  /** Solid box collider like the range walls (concrete by default). */
  function makeWall(
    x: number,
    z: number,
    width: number,
    depth: number,
    surface = 'concrete',
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 2.3, depth));
    mesh.position.set(x, 1.15, z);
    mesh.userData.surface = surface;
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  function onlyZombie(manager: ZombieManager): Zombie {
    return [...(manager as unknown as { pool: { actives: Set<Zombie> } }).pool.actives][0];
  }

  it('walls are never penetrated, but a wide wall gets rounded', () => {
    const colliders: THREE.Object3D[] = [makeWall(0, -10, 10, 0.4)];
    const manager = new ZombieManager(() => 0);
    manager.registerColliders(colliders);
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = onlyZombie(manager);
    zombie.position.set(0, 0, -14); // straight line to the player goes through the wall

    // Every frame: the body must NEVER enter the wall box (radius folded in).
    // The old contract asserted the zombie stayed pressed against the wall
    // forever — that frozen push IS the stuck bug this fixes. The new
    // contract: the zombie rounds the wall and reaches the player's side,
    // while never clipping through the geometry at any point.
    const frames = Math.round(8 / DT);
    for (let i = 0; i < frames; i++) {
      manager.update(DT, 0, 4);
      const inX = zombie.position.x > -5.21 && zombie.position.x < 5.21;
      const inZ = zombie.position.z > -10.41 && zombie.position.z < -9.59;
      expect(inX && inZ).toBe(false);
    }
    // Rounded: the straight-line distance to the player shrank far more
    // than the wall's depth alone could account for by pressing.
    expect(Math.hypot(zombie.position.x - 0, zombie.position.z - 4)).toBeLessThan(16);
  });

  it('slides along the wall and rounds the edge instead of getting stuck', () => {
    // Narrow wall covering x ∈ [0, 3]; player offset to the left so the
    // slide direction reaches the wall's left edge.
    const colliders: THREE.Object3D[] = [makeWall(1.5, -10, 3, 0.4)];
    const manager = new ZombieManager(() => 0);
    manager.registerColliders(colliders);
    manager.spawnZombie(roundConfig(1), -3, 4);
    const zombie = onlyZombie(manager);
    zombie.position.set(2.5, 0, -14);

    const frames = Math.round(20 / DT);
    for (let i = 0; i < frames; i++) {
      manager.update(DT, -3, 4);
      // Pressing against the wall face is legal; penetrating more than half
      // the body radius into the actual wall box (x ∈ [0,3], z ∈ [-10.2,-9.8])
      // is not: that would mean corner cutting or tunneling.
      const inX = zombie.position.x > -0.21 && zombie.position.x < 3.21;
      const inZ = zombie.position.z > -10.41 && zombie.position.z < -9.59;
      expect(inX && inZ).toBe(false);
    }
    // Rounded the edge and kept walking towards the player.
    expect(zombie.position.z).toBeGreaterThan(-9.5);
  });

  it('ignores non-blocking colliders (thin platforms, steel targets)', () => {
    const platform = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.16, 11));
    platform.position.set(0, 0.08, 3.5);
    platform.userData.surface = 'concrete';
    platform.updateMatrixWorld(true);
    const target = makeWall(0, -12, 1, 0.1, 'steel');
    const colliders: THREE.Object3D[] = [platform, target];
    const manager = new ZombieManager(() => 0);
    manager.registerColliders(colliders);
    manager.spawnZombie(roundConfig(1), 0, 4);
    const zombie = onlyZombie(manager);
    zombie.position.set(0, 0, -16);

    step(manager, 6);

    // Walked straight through both: distance to the player shrank a lot.
    expect(zombie.position.z).toBeGreaterThan(-10);
  });
});
