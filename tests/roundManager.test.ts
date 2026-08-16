import { describe, expect, it } from 'vitest';
import { RoundManager, type RoundEventType } from '../src/zombies/RoundManager';
import { MAX_ALIVE, roundConfig } from '../src/zombies/ZombieConfig';

const DT = 1 / 60;

function drain(manager: RoundManager): RoundEventType[] {
  const types = manager.pendingEvents.map((e) => e.type);
  manager.clearEvents();
  return types;
}

/** Steps the manager until predicate or the frame budget runs out. */
function stepUntil(
  manager: RoundManager,
  alive: () => number,
  predicate: (events: RoundEventType[]) => boolean,
  maxSeconds = 60,
): RoundEventType[] {
  const seen: RoundEventType[] = [];
  const frames = Math.round(maxSeconds / DT);
  for (let i = 0; i < frames; i++) {
    manager.update(DT, alive());
    seen.push(...drain(manager));
    if (predicate(seen)) return seen;
  }
  return seen;
}

describe('RoundManager', () => {
  it('requeues a spawn that could not be placed instead of shortening the round', () => {
    const manager = new RoundManager(4, 0);
    manager.update(0, 0);
    manager.clearEvents();
    manager.update(0, 0);
    const pendingAfterIssue = manager.pendingSpawnCount;

    manager.requeueSpawn();

    expect(manager.pendingSpawnCount).toBe(pendingAfterIssue + 1);
  });

  it('starts round 1 after the initial delay', () => {
    const manager = new RoundManager(4, 2);
    manager.update(1, 0);
    expect(drain(manager)).toEqual([]);
    manager.update(1.1, 0);
    expect(drain(manager)).toEqual(['roundStarted']);
    expect(manager.round).toBe(1);
    expect(manager.pendingSpawnCount).toBe(roundConfig(1).zombieCount);
  });

  it('emits spawn events at the configured interval', () => {
    const manager = new RoundManager(4, 0);
    manager.update(DT, 0); // starts round 1
    drain(manager);

    // First spawn is immediate.
    manager.update(DT, 0);
    expect(drain(manager)).toEqual(['spawnDue']);

    // Round 1 interval is 2.1 s: nothing after 1 s, one more after 2.2 s.
    manager.update(1, 1);
    expect(drain(manager)).toEqual([]);
    manager.update(1.2, 1);
    expect(drain(manager)).toEqual(['spawnDue']);
  });

  it('never emits spawns beyond the alive cap', () => {
    const manager = new RoundManager(4, 0);
    manager.update(DT, 0); // round 1 starts
    drain(manager);

    // Simulate a full field: no spawn events may come out even though the
    // round still has pending spawns.
    for (let i = 0; i < 60; i++) {
      manager.update(0.5, MAX_ALIVE);
      expect(drain(manager)).toEqual([]);
    }
    expect(manager.pendingSpawnCount).toBe(roundConfig(1).zombieCount);

    // When zombies die, spawning resumes.
    manager.update(DT, MAX_ALIVE - 1);
    expect(drain(manager)).toEqual(['spawnDue']);
  });

  it('spawns the whole round exactly once', () => {
    const manager = new RoundManager(4, 0);
    manager.update(DT, 0); // round 1 starts
    drain(manager);

    let totalSpawns = 0;
    let alive = 0;
    let elapsed = 0;
    // Simulate killing one zombie per second so spawns keep flowing.
    while (manager.pendingSpawnCount > 0 && elapsed < 120) {
      manager.update(DT, alive);
      for (const event of manager.pendingEvents) {
        if (event.type === 'spawnDue') {
          alive++;
          totalSpawns++;
        }
      }
      drain(manager);
      alive = Math.min(alive, MAX_ALIVE);
      elapsed += DT;
      if (Math.floor(elapsed) !== Math.floor(elapsed + DT) && alive > 0) alive--; // 1 kill/s
    }
    expect(totalSpawns).toBe(roundConfig(1).zombieCount);
    expect(manager.pendingSpawnCount).toBe(0);
  });

  it('completes the round when all zombies are dead and starts the next one after the break', () => {
    const manager = new RoundManager(2, 0);
    const events = stepUntil(manager, () => 0, (e) => e.includes('roundStarted'));
    expect(events).toContain('roundStarted');

    // Drain every spawn with zero alive, then the round must complete.
    const all = stepUntil(manager, () => 0, (e) => e.includes('roundComplete'), 120);
    expect(all.filter((e) => e === 'spawnDue')).toHaveLength(roundConfig(1).zombieCount);
    expect(manager.isActive).toBe(false);

    // Halfway through the break: nothing yet.
    manager.update(1, 0);
    expect(drain(manager)).toEqual([]);
    expect(manager.round).toBe(1);

    // Break over: round 2 begins.
    manager.update(1.1, 0);
    expect(drain(manager)).toEqual(['roundStarted']);
    expect(manager.round).toBe(2);
  });

  it('does not complete the round while zombies are still alive', () => {
    const manager = new RoundManager(2, 0);
    stepUntil(manager, () => 0, (e) => e.includes('roundStarted'));
    // Exhaust pending spawns with zombies alive.
    stepUntil(manager, () => 5, () => manager.pendingSpawnCount === 0, 120);
    const events = drain(manager);
    manager.update(DT, 5);
    expect([...events, ...drain(manager)]).not.toContain('roundComplete');
  });

  it('resets back to round 1 for the restart flow', () => {
    const manager = new RoundManager(2, 0);
    stepUntil(manager, () => 0, (e) => e.includes('roundStarted'));
    manager.reset(1);
    expect(manager.round).toBe(0);
    expect(manager.pendingSpawnCount).toBe(0);
    manager.update(1.1, 0);
    expect(drain(manager)).toEqual(['roundStarted']);
    expect(manager.round).toBe(1);
  });
});
