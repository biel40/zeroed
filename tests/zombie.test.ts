import { describe, expect, it } from 'vitest';
import { Zombie } from '../src/zombies/Zombie';
import {
  ZOMBIE_ATTACK_DURATION,
  ZOMBIE_ATTACK_HIT_MOMENT,
  ZOMBIE_ATTACK_RECOVERY,
  ZOMBIE_CORPSE_LINGER,
  ZOMBIE_DEATH_FADE,
  ZOMBIE_DEATH_FALL,
  ZOMBIE_SPAWN_DURATION,
} from '../src/zombies/ZombieConfig';

const DT = 1 / 60;
const DEATH_TOTAL = ZOMBIE_DEATH_FALL + ZOMBIE_CORPSE_LINGER + ZOMBIE_DEATH_FADE;

function makeZombie(hp = 100, speed = 1.9): Zombie {
  const zombie = new Zombie();
  zombie.spawn(0, -20, hp, speed);
  return zombie;
}

function step(zombie: Zombie, seconds: number): void {
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) zombie.update(DT);
}

describe('Zombie lifecycle', () => {
  it('spawns at full health in the spawn state and becomes visible', () => {
    const zombie = makeZombie(150, 2.2);
    expect(zombie.hp).toBe(150);
    expect(zombie.maxHp).toBe(150);
    expect(zombie.speed).toBe(2.2);
    expect(zombie.state).toBe('spawn');
    expect(zombie.group.visible).toBe(true);
    expect(zombie.isAlive).toBe(true);
  });

  it('rises from the ground while spawning, then walks', () => {
    const zombie = makeZombie();
    step(zombie, ZOMBIE_SPAWN_DURATION / 2);
    expect(zombie.state).toBe('spawn');
    expect(zombie.visual.root.position.y).toBeLessThan(0); // still emerging
    step(zombie, ZOMBIE_SPAWN_DURATION / 2 + 0.1);
    expect(zombie.state).toBe('walk');
    expect(zombie.visual.root.position.y).toBeCloseTo(0, 3);
  });

  it('non-lethal damage interrupts to the hit state', () => {
    const zombie = makeZombie(100);
    step(zombie, ZOMBIE_SPAWN_DURATION + 0.1); // reach walk
    expect(zombie.applyDamage(30)).toBe(false);
    expect(zombie.hp).toBe(70);
    expect(zombie.state).toBe('hit');
    expect(zombie.isAlive).toBe(true);
    step(zombie, 0.4);
    expect(zombie.state).toBe('walk');
  });

  it('non-lethal headshots stagger longer than torso hits', () => {
    const torso = makeZombie(100);
    step(torso, ZOMBIE_SPAWN_DURATION + 0.1);
    torso.applyDamage(10, false);
    step(torso, 0.35);
    expect(torso.state).toBe('walk');

    const head = makeZombie(100);
    step(head, ZOMBIE_SPAWN_DURATION + 0.1);
    head.applyDamage(10, true);
    step(head, 0.35);
    expect(head.state).toBe('hit'); // still reeling
    step(head, 0.2);
    expect(head.state).toBe('walk');
  });

  it('lethal damage switches to death and reports the kill', () => {
    const zombie = makeZombie(100);
    expect(zombie.applyDamage(100)).toBe(true);
    expect(zombie.state).toBe('death');
    expect(zombie.isAlive).toBe(false);
  });

  it('ignores damage once dead', () => {
    const zombie = makeZombie(50);
    zombie.applyDamage(50);
    expect(zombie.applyDamage(50)).toBe(false);
  });

  it('keeps the corpse visible for a while before recycling', () => {
    const zombie = makeZombie(50);
    zombie.applyDamage(50);
    step(zombie, ZOMBIE_DEATH_FALL + 0.2);
    expect(zombie.group.visible).toBe(true); // fallen, still on the field
  });

  it('finishes the death sequence hidden and notifies the pool', () => {
    const zombie = makeZombie(50);
    let finished = false;
    zombie.onDeathFinished = () => {
      finished = true;
    };
    zombie.applyDamage(50);
    step(zombie, DEATH_TOTAL + 0.2);
    expect(finished).toBe(true);
    expect(zombie.group.visible).toBe(false);
  });
});

describe('Zombie attacks', () => {
  it('attack lands at the hit moment and then walks again', () => {
    const zombie = makeZombie();
    step(zombie, ZOMBIE_SPAWN_DURATION + 0.1); // walk
    let hits = 0;
    zombie.onAttackLanded = () => hits++;
    expect(zombie.tryAttack()).toBe(true);
    expect(zombie.state).toBe('attack');
    step(zombie, ZOMBIE_ATTACK_HIT_MOMENT - 0.1);
    expect(hits).toBe(0); // wind-up not finished yet
    step(zombie, 0.15);
    expect(hits).toBe(1); // the blow connects
    step(zombie, ZOMBIE_ATTACK_DURATION - ZOMBIE_ATTACK_HIT_MOMENT);
    expect(zombie.state).toBe('walk');
  });

  it('respects the attack cooldown', () => {
    const zombie = makeZombie();
    step(zombie, ZOMBIE_SPAWN_DURATION + 0.1);
    expect(zombie.tryAttack()).toBe(true);
    step(zombie, ZOMBIE_ATTACK_DURATION + 0.1); // finish the lunge
    expect(zombie.state).toBe('walk');
    expect(zombie.tryAttack()).toBe(false); // still recovering
    step(zombie, ZOMBIE_ATTACK_RECOVERY);
    expect(zombie.tryAttack()).toBe(true);
  });

  it('cannot attack while dead', () => {
    const zombie = makeZombie(10);
    zombie.applyDamage(10);
    expect(zombie.tryAttack()).toBe(false);
  });
});
