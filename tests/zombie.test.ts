import { describe, expect, it } from 'vitest';
import { Zombie } from '../src/zombies/Zombie';

const DT = 1 / 60;

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

  it('transitions from spawn to walk after the spawn animation', () => {
    const zombie = makeZombie();
    step(zombie, 0.5);
    expect(zombie.state).toBe('walk');
  });

  it('non-lethal damage interrupts to the hit state', () => {
    const zombie = makeZombie(100);
    step(zombie, 0.5); // reach walk
    expect(zombie.applyDamage(30)).toBe(false);
    expect(zombie.hp).toBe(70);
    expect(zombie.state).toBe('hit');
    expect(zombie.isAlive).toBe(true);
    step(zombie, 0.3);
    expect(zombie.state).toBe('walk');
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

  it('finishes the death animation hidden and notifies the pool', () => {
    const zombie = makeZombie(50);
    let finished = false;
    zombie.onDeathFinished = () => {
      finished = true;
    };
    zombie.applyDamage(50);
    step(zombie, 1.3);
    expect(finished).toBe(true);
    expect(zombie.group.visible).toBe(false);
  });
});

describe('Zombie attacks', () => {
  it('attack lands at the hit moment and then walks again', () => {
    const zombie = makeZombie();
    step(zombie, 0.5); // walk
    let hits = 0;
    zombie.onAttackLanded = () => hits++;
    expect(zombie.tryAttack()).toBe(true);
    expect(zombie.state).toBe('attack');
    step(zombie, 0.2);
    expect(hits).toBe(0); // wind-up not finished yet
    step(zombie, 0.2);
    expect(hits).toBe(1); // hit moment (~0.32 s)
    step(zombie, 0.3);
    expect(zombie.state).toBe('walk');
  });

  it('respects the attack cooldown', () => {
    const zombie = makeZombie();
    step(zombie, 0.5);
    expect(zombie.tryAttack()).toBe(true);
    step(zombie, 0.7); // finish the lunge; cooldown still running
    expect(zombie.state).toBe('walk');
    expect(zombie.tryAttack()).toBe(false);
    step(zombie, 0.5);
    expect(zombie.tryAttack()).toBe(true);
  });

  it('cannot attack while dead', () => {
    const zombie = makeZombie(10);
    zombie.applyDamage(10);
    expect(zombie.tryAttack()).toBe(false);
  });
});
