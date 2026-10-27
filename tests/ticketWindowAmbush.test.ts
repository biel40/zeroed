import * as THREE from 'three';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RoundManager } from '../src/zombies/RoundManager';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import { AmbushTrigger } from '../src/zombies/maps/shared/AmbushTrigger';
import { Station33Arena } from '../src/zombies/maps/Station33Arena';
import {
  STATION33_PLAYER_SPAWN,
  TICKET_OFFICE,
  TICKET_WINDOW_AMBUSH,
  TICKET_WINDOW_AMBUSH_SITES,
  TICKET_WINDOWS,
  VESTIBULE,
} from '../src/zombies/maps/Station33Config';
import { casementSwing } from '../src/zombies/maps/station33/TicketWindowShutters';
import type { ArenaAmbush } from '../src/zombies/maps/ZombieArena';
import { installCanvasDocument, TEST_PROFILE } from './coopHarness';

const DT = 1 / 60;
const SITES = [{ x: 0, z: 0 }, { x: 0, z: 2 }];
const CONFIG = { chance: 0.1, radius: 1.5 };

let restoreDocument: () => void;
beforeAll(() => { restoreDocument = installCanvasDocument(); });
afterAll(() => restoreDocument());
afterEach(() => vi.restoreAllMocks());

describe('AmbushTrigger', () => {
  it('rolls once per approach, however many sites the observer passes', () => {
    const rng = vi.fn(() => 0.5);
    const trigger = new AmbushTrigger(SITES, CONFIG, rng);
    expect(trigger.update(5, 0)).toBeNull();
    expect(trigger.update(0.5, 0)).toBeNull();
    expect(trigger.update(0.5, 2)).toBeNull();
    expect(rng).toHaveBeenCalledTimes(1);
    trigger.update(5, 0);
    trigger.update(0.5, 0);
    expect(rng).toHaveBeenCalledTimes(2);
  });

  it('stays primed at the closest site until sprung, then stays spent until reset', () => {
    const trigger = new AmbushTrigger(SITES, CONFIG, () => 0);
    expect(trigger.update(0.5, 0.2)).toBe(0);
    expect(trigger.update(0.5, 1.8)).toBe(1);
    trigger.spring();
    expect(trigger.spent).toBe(true);
    trigger.update(5, 0);
    expect(trigger.update(0.5, 0)).toBeNull();
    trigger.reset();
    expect(trigger.update(0.5, 0)).toBe(0);
  });

  it('disarms a successful roll when the observer walks away', () => {
    const rolls = [0, 0.9];
    const trigger = new AmbushTrigger(SITES, CONFIG, () => rolls.shift()!);
    expect(trigger.update(0.5, 0)).toBe(0);
    expect(trigger.update(5, 0)).toBeNull();
    expect(trigger.update(0.5, 0)).toBeNull();
  });
});

describe('Round spawns handed to an ambush', () => {
  it('takes one pending spawn of an active round and nothing during a break', () => {
    const rounds = new RoundManager(5, 0);
    expect(rounds.takePendingSpawn()).toBeNull();
    rounds.update(DT, 0);
    const owed = rounds.pendingSpawnCount;
    expect(rounds.takePendingSpawn()).toEqual(roundConfig(1));
    expect(rounds.pendingSpawnCount).toBe(owed - 1);
  });
});

describe('ZombieManager ambush spawn', () => {
  it('places a standing walker facing the player, hunting without a barrier', () => {
    const manager = new ZombieManager(() => 0);
    manager.registerColliders([]);
    expect(manager.spawnAmbushZombie(roundConfig(1), 0, 0, 1, 3, 0)).toBe(true);
    const zombie = [...manager.actives][0];
    expect(zombie.state).toBe('walk');
    expect(zombie.typeId).toBe('normal');
    expect(zombie.barrierTarget).toBeNull();
    expect(Math.sin(zombie.group.rotation.y)).toBeCloseTo(1, 5);
  });

  it('refuses a spot inside a solid', () => {
    const manager = new ZombieManager(() => 0);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1));
    wall.position.set(0, 1, 0);
    wall.userData.surface = 'concrete';
    wall.updateMatrixWorld(true);
    manager.registerColliders([wall]);
    expect(manager.spawnAmbushZombie(roundConfig(1), 0, 0, 1, 3, 0)).toBe(false);
    expect(manager.aliveCount).toBe(0);
  });
});

describe('Station 33 ticket-window ambush', () => {
  function makeArena(): Station33Arena {
    const arena = new Station33Arena(new THREE.Scene(), TEST_PROFILE);
    arena.init();
    return arena;
  }

  function casementAngle(arena: Station33Arena, index: number): number {
    return arena.group.getObjectByName(`ticket-window-${index}-south`)!.rotation.y;
  }

  function settle(arena: Station33Arena, observer: THREE.Vector3, seconds = 1.2): void {
    for (let frame = 0; frame < seconds / DT; frame++) arena.update(DT, observer);
  }

  it('is rare, and out of reach from the player spawn', () => {
    expect(TICKET_WINDOW_AMBUSH.chance).toBeGreaterThan(0);
    expect(TICKET_WINDOW_AMBUSH.chance).toBeLessThanOrEqual(0.1);
    for (const site of TICKET_WINDOW_AMBUSH_SITES) {
      expect(Math.hypot(site.x - STATION33_PLAYER_SPAWN.x, site.z - STATION33_PLAYER_SPAWN.z))
        .toBeGreaterThan(TICKET_WINDOW_AMBUSH.radius);
    }
    for (const window of TICKET_WINDOWS) {
      expect(window.z).toBeGreaterThan(TICKET_OFFICE.minZ);
      expect(window.z).toBeLessThan(TICKET_OFFICE.maxZ);
    }
  });

  it('bursts the approached window open only once the mode spawns the zombie, where a zombie fits', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const arena = makeArena();
    const manager = new ZombieManager(() => 0);
    manager.registerColliders([...arena.colliders]);
    const window = 1;
    const observer = new THREE.Vector3(VESTIBULE.minX + 2, STATION33_PLAYER_SPAWN.y, TICKET_WINDOWS[window].z);

    let accept = false;
    const ambushes: ArenaAmbush[] = [];
    arena.onAmbush = (ambush) => {
      ambushes.push(ambush);
      return accept;
    };
    settle(arena, observer, 0.2);
    expect(ambushes.length).toBeGreaterThan(0);
    expect(casementAngle(arena, window)).toBe(0);

    accept = true;
    settle(arena, observer);
    const ambush = ambushes[ambushes.length - 1];
    expect(ambush.floor).toBe(0);
    expect(ambush.position.z).toBeCloseTo(TICKET_WINDOWS[window].z);
    expect(manager.spawnAmbushZombie(roundConfig(1), ambush.position.x, ambush.position.z, 1, observer.x, observer.z)).toBe(true);
    expect(casementAngle(arena, window)).toBeCloseTo(casementSwing(10));
    expect(arena.group.getObjectByName('ticket-window-1-north')!.rotation.y).toBeCloseTo(-casementSwing(10));
    expect(casementAngle(arena, 0)).toBe(0);

    const calls = ambushes.length;
    settle(arena, new THREE.Vector3(0, STATION33_PLAYER_SPAWN.y, 15));
    settle(arena, observer);
    expect(ambushes.length).toBe(calls);

    arena.reset();
    expect(casementAngle(arena, window)).toBe(0);
  });

  it('keeps the windows shut when the approach roll fails', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const arena = makeArena();
    const onAmbush = vi.fn(() => true);
    arena.onAmbush = onAmbush;
    settle(arena, new THREE.Vector3(VESTIBULE.minX + 1.5, STATION33_PLAYER_SPAWN.y, TICKET_WINDOWS[0].z));
    expect(onAmbush).not.toHaveBeenCalled();
    expect(casementAngle(arena, 0)).toBe(0);
  });

  it('slams the casements past their stop and settles them open', () => {
    expect(casementSwing(0)).toBe(0);
    const peak = Math.max(...Array.from({ length: 60 }, (_, frame) => casementSwing(frame * DT)));
    expect(peak).toBeGreaterThan(casementSwing(10));
    expect(casementSwing(10)).toBeGreaterThan(Math.PI / 2);
  });
});
