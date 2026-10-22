import { describe, expect, it } from 'vitest';
import { roundConfig } from '../src/zombies/ZombieConfig';
import { ZombieManager } from '../src/zombies/ZombieManager';
import type { Zombie } from '../src/zombies/Zombie';

const DT = 1 / 60;
const OPEN_BOUNDS = [{ floor: 0, minX: -20, maxX: 20, minZ: -20, maxZ: 20, baseY: 0 }] as const;

function setup(): { manager: ZombieManager; zombie: Zombie; hits: () => number } {
  const manager = new ZombieManager(() => 0, {}, false, [[0, -20]]);
  manager.registerColliders([]);
  manager.setNavigationBounds(OPEN_BOUNDS);
  expect(manager.spawnZombie(roundConfig(6), 0, 10)).toBe(true);
  const zombie = [...manager.actives][0];
  zombie.state = 'walk';
  zombie.position.set(0, 0, -6);
  let landed = 0;
  manager.onPlayerAttack = () => { landed++; };
  return { manager, zombie, hits: () => landed };
}

function run(manager: ZombieManager, seconds: number): void {
  for (let frame = 0; frame < seconds / DT; frame++) manager.update(DT, 0, 0, 0);
}

describe('ZombieManager.ignoreHost', () => {
  it('stops the horde chasing the player while ignored, then the hunt resumes', () => {
    const { manager, zombie } = setup();
    manager.ignoreHost(2);
    run(manager, 1.8);
    expect(zombie.position.z).toBeCloseTo(-6, 1);
    run(manager, 1.5);
    expect(zombie.position.z).toBeGreaterThan(-5);
  });

  it('makes a strike already swinging at the player miss', () => {
    const { manager, zombie, hits } = setup();
    zombie.position.set(0, 0, -0.9);
    for (let frame = 0; frame < 120 && zombie.state !== 'attack'; frame++) manager.update(DT, 0, 0, 0);
    expect(zombie.state).toBe('attack');
    manager.ignoreHost(2);
    run(manager, 1.5);
    expect(hits()).toBe(0);
  });

  it('forgets the window on reset', () => {
    const { manager } = setup();
    manager.ignoreHost(5);
    expect(manager.isHostIgnored).toBe(true);
    manager.reset();
    expect(manager.isHostIgnored).toBe(false);
  });
});
