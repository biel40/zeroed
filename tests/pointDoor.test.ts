import { describe, expect, it } from 'vitest';
import { PointDoor } from '../src/zombies/doors/PointDoor';

describe('PointDoor pure logic', () => {
  it('starts locked', () => {
    const door = new PointDoor('d1', 0, 0, 0, 1, { cost: 750 });
    expect(door.state).toBe('locked');
    expect(door.isLocked).toBe(true);
    expect(door.cost).toBe(750);
  });

  it('unlocks when the player can afford it', () => {
    const door = new PointDoor('d1', 0, 0, 0, 1, { cost: 750 });
    let balance = 1000;
    const result = door.tryUnlock((cost) => {
      if (balance < cost) return false;
      balance -= cost;
      return true;
    });
    expect(result.success).toBe(true);
    expect(result.cost).toBe(750);
    expect(door.isLocked).toBe(false);
    expect(balance).toBe(250);
  });

  it('refuses to unlock when the player is short on points', () => {
    const door = new PointDoor('d1', 0, 0, 0, 1, { cost: 750 });
    let balance = 500;
    const result = door.tryUnlock((cost) => {
      if (balance < cost) return false;
      balance -= cost;
      return true;
    });
    expect(result.success).toBe(false);
    expect(door.isLocked).toBe(true);
    expect(balance).toBe(500);
  });

  it('can only be unlocked once', () => {
    const door = new PointDoor('d1', 0, 0, 0, 1, { cost: 750 });
    let balance = 1000;
    const spend = (cost: number): boolean => {
      if (balance < cost) return false;
      balance -= cost;
      return true;
    };
    door.tryUnlock(spend);
    const second = door.tryUnlock(spend);
    expect(second.success).toBe(true);
    expect(second.cost).toBe(0);
    expect(balance).toBe(250);
  });
});
