import { describe, expect, it } from 'vitest';
import {
  CAPTAIN_USSR,
  CaptainUssrBrain,
  type CaptainUssrEvent,
  type CaptainUssrField,
  type CaptainUssrTuning,
} from '../src/zombies/guardians/CaptainUssrBrain';

/** A 30 x 30 yard with one crate in its north-east corner; the boss lands in the middle. */
const FIELD: CaptainUssrField = {
  bounds: { minX: 0, maxX: 30, minZ: 0, maxZ: 30 },
  obstacles: [{ minX: 24, maxX: 28, minZ: 2, maxZ: 6 }],
  landing: { x: 15, z: 15 },
};
/** Frames that sum exactly in binary. */
const DT = 0.0625;
const ROUND = 10;

interface Player { x: number; z: number; reachable: boolean }

function brainWith(random: () => number = () => 0, tuning: CaptainUssrTuning = CAPTAIN_USSR): CaptainUssrBrain {
  return new CaptainUssrBrain(tuning, FIELD, random);
}

/** Lands it and lets the arrival finish, facing the player. */
function fighting(player: Player, random?: () => number, tuning?: CaptainUssrTuning): CaptainUssrBrain {
  const brain = brainWith(random, tuning);
  brain.awaken(ROUND, player.x, player.z);
  run(brain, player, CAPTAIN_USSR.arrivalSeconds + DT);
  brain.clearEvents();
  return brain;
}

/** Steps `seconds`; `move` may walk the player around between frames. */
function run(brain: CaptainUssrBrain, player: Player, seconds: number, move?: (time: number) => void): CaptainUssrEvent[] {
  const events: CaptainUssrEvent[] = [];
  const frames = Math.round(seconds / DT);
  for (let frame = 0; frame < frames; frame++) {
    move?.(frame * DT);
    brain.update(DT, player);
    events.push(...brain.pendingEvents);
    brain.clearEvents();
  }
  return events;
}

const types = (events: readonly CaptainUssrEvent[]): string[] => events.map((event) => event.type);
const hits = (events: readonly CaptainUssrEvent[]): CaptainUssrEvent[] => events.filter((event) => event.type === 'playerHit');

/** Steps until the brain reaches `state` (or fails after `limit` seconds). */
function until(brain: CaptainUssrBrain, player: Player, state: CaptainUssrBrain['state'], limit = 20): CaptainUssrEvent[] {
  const events: CaptainUssrEvent[] = [];
  for (let time = 0; time < limit && brain.state !== state; time += DT) {
    brain.update(DT, player);
    events.push(...brain.pendingEvents);
    brain.clearEvents();
  }
  expect(brain.state).toBe(state);
  return events;
}

describe('Captain USSR brain', () => {
  it('sleeps until awakened, then lands invulnerable before it fights', () => {
    const brain = brainWith();
    const player = { x: 15, z: 25, reachable: true };
    expect(brain.state).toBe('dormant');
    expect(brain.takeHit(100, 'torso', 15, 25)).toBe('ignored');
    run(brain, player, 1);
    expect(brain.state).toBe('dormant');
    expect(brain.pendingEvents).toEqual([]);

    expect(brain.awaken(ROUND, player.x, player.z)).toBe(true);
    expect(brain.awaken(ROUND, player.x, player.z)).toBe(false);
    expect(brain.state).toBe('arriving');
    expect(brain.position).toEqual({ x: FIELD.landing.x, z: FIELD.landing.z });
    expect(brain.takeHit(100, 'torso', 15, 25)).toBe('ignored');
    expect(brain.health).toBe(brain.maxHealth);
    const events = run(brain, player, CAPTAIN_USSR.arrivalSeconds + DT);
    expect(types(events)).toEqual(['arrived']);
    expect(brain.state).toBe('stalking');
    expect(brain.phase).toBe(1);
  });

  it('grows tougher with the round it arrives in', () => {
    const early = brainWith();
    early.awaken(1, 15, 25);
    const late = brainWith();
    late.awaken(11, 15, 25);
    expect(early.maxHealth).toBe(CAPTAIN_USSR.health.base);
    expect(late.maxHealth).toBe(CAPTAIN_USSR.health.base + 10 * CAPTAIN_USSR.health.perRound);
  });

  it('turns its shield on frontal fire and bleeds from the flanks, the back and the head', () => {
    const player = { x: 15, z: 25, reachable: true };
    const brain = fighting(player);
    // It faces the player (south, +z) once landed.
    expect(brain.blocking).toBe(true);
    expect(brain.takeHit(100, 'torso', 15, 25)).toBe('blocked');
    expect(brain.takeHit(100, 'head', 16, 24)).toBe('blocked');
    expect(brain.takeHit(100, 'shield', 15, 5)).toBe('blocked');
    expect(brain.health).toBe(brain.maxHealth);
    expect(brain.takeHit(100, 'torso', 15, 5)).toBe('hurt');
    expect(brain.takeHit(100, 'torso', 25, 15)).toBe('hurt');
    expect(brain.takeHit(100, 'head', 15, 5)).toBe('hurt');
    expect(brain.health).toBe(brain.maxHealth - 200 - 100 * CAPTAIN_USSR.headMultiplier);
  });

  it('bashes a player who stays in front of it, and misses one who steps back in time', () => {
    const close = { x: 15, z: 16.8, reachable: true };
    const brain = fighting(close);
    const events = until(brain, close, 'bashWindup', 1);
    expect(types(events)).toContain('bashWindup');
    const landed = run(brain, close, CAPTAIN_USSR.bash.windup + DT);
    expect(hits(landed)).toEqual([{ type: 'playerHit', attack: 'bash', damage: CAPTAIN_USSR.bash.damage }]);

    const dodger = { x: 15, z: 16.8, reachable: true };
    const other = fighting(dodger);
    until(other, dodger, 'bashWindup', 1);
    dodger.z = 22;
    expect(hits(run(other, dodger, CAPTAIN_USSR.bash.windup + DT))).toEqual([]);
  });

  it('throws its shield at range, open to frontal fire until it catches it back', () => {
    const player = { x: 15, z: 25, reachable: true };
    const brain = fighting(player);
    until(brain, player, 'throwWindup');
    // Winding up, the shield arm is cocked back: the front is open.
    expect(brain.blocking).toBe(false);
    expect(brain.takeHit(50, 'torso', player.x, player.z)).toBe('hurt');
    const thrown = until(brain, player, 'shieldFlight', 2);
    expect(types(thrown)).toContain('shieldThrown');
    expect(brain.shieldHeld).toBe(false);
    expect(brain.takeHit(50, 'torso', player.x, player.z)).toBe('hurt');

    const flight = until(brain, player, 'recovering', 5);
    expect(hits(flight)).toEqual([{ type: 'playerHit', attack: 'shield', damage: CAPTAIN_USSR.shieldThrow.damage }]);
    expect(types(flight)).toContain('shieldCaught');
    expect(brain.shieldHeld).toBe(true);
    expect(brain.shield).toEqual(brain.position);
  });

  it('misses with the shield when the player sidesteps after the release', () => {
    const player = { x: 15, z: 25, reachable: true };
    const brain = fighting(player);
    until(brain, player, 'shieldFlight');
    player.x = 22;
    const flight = until(brain, player, 'recovering', 5);
    expect(hits(flight)).toEqual([]);
  });

  it('enters each phase once as its health falls past the thresholds', () => {
    const player = { x: 15, z: 25, reachable: true };
    const brain = fighting(player);
    const behind = (damage: number): void => { brain.takeHit(damage, 'torso', 15, 5); };
    behind(brain.maxHealth * 0.39);
    expect(brain.phase).toBe(1);
    behind(brain.maxHealth * 0.02);
    expect(brain.phase).toBe(2);
    behind(brain.maxHealth * 0.3);
    expect(brain.phase).toBe(3);
    behind(1);
    expect(types(brain.pendingEvents)).toEqual(['phase', 'phase']);
    expect(brain.pendingEvents.map((event) => (event.type === 'phase' ? event.phase : 0))).toEqual([2, 3]);
  });

  it('charges from phase two, crashes into the fence and stays stunned and exposed', () => {
    // Random 0 always picks the charge once it is allowed.
    const player = { x: 15, z: 27, reachable: true };
    const brain = fighting(player);
    brain.takeHit(brain.maxHealth * 0.45, 'torso', 15, 5);
    const windup = until(brain, player, 'chargeWindup');
    expect(types(windup)).toContain('chargeWindup');
    const charge = until(brain, player, 'charging', 2);
    expect(types(charge)).toContain('charge');
    // The player leaves the lane; the boss runs on into the south fence.
    player.x = 4;
    const crash = until(brain, player, 'stunned', 4);
    expect(crash.find((event) => event.type === 'chargeEnded')).toEqual({ type: 'chargeEnded', crashed: true });
    expect(hits(crash)).toEqual([]);
    expect(brain.position.z).toBeLessThanOrEqual(FIELD.bounds.maxZ - CAPTAIN_USSR.radius + 1e-9);
    expect(brain.blocking).toBe(false);
    const before = brain.health;
    expect(brain.takeHit(100, 'torso', player.x, player.z)).toBe('hurt');
    expect(before - brain.health).toBeCloseTo(100 * CAPTAIN_USSR.stunMultiplier);
    const stunned = run(brain, player, CAPTAIN_USSR.charge.wallStunSeconds - 2 * DT);
    expect(brain.state).toBe('stunned');
    run(brain, player, 3 * DT);
    expect(stunned.length).toBe(0);
    expect(brain.state).toBe('stalking');
  });

  it('runs over a player who stays in the lane of its charge', () => {
    const player = { x: 15, z: 26, reachable: true };
    const brain = fighting(player);
    brain.takeHit(brain.maxHealth * 0.45, 'torso', 15, 5);
    until(brain, player, 'charging');
    const charge = until(brain, player, 'stunned', 4);
    expect(hits(charge)).toEqual([{ type: 'playerHit', attack: 'charge', damage: CAPTAIN_USSR.charge.damage }]);
  });

  it('never leaves its yard nor walks through its solids', () => {
    const player = { x: 29, z: 1, reachable: true };
    // Random 1 never charges and waits the longest between attacks.
    const brain = fighting(player, () => 0.999);
    run(brain, player, 20, (time) => {
      player.x = 29 - (time % 6);
      player.z = 1 + (time % 4);
      const { x, z } = brain.position;
      const [crate] = FIELD.obstacles;
      const inside = x > crate.minX - CAPTAIN_USSR.radius + 1e-6 && x < crate.maxX + CAPTAIN_USSR.radius - 1e-6
        && z > crate.minZ - CAPTAIN_USSR.radius + 1e-6 && z < crate.maxZ + CAPTAIN_USSR.radius - 1e-6;
      expect(inside).toBe(false);
      expect(x).toBeGreaterThanOrEqual(FIELD.bounds.minX + CAPTAIN_USSR.radius - 1e-9);
      expect(z).toBeGreaterThanOrEqual(FIELD.bounds.minZ + CAPTAIN_USSR.radius - 1e-9);
    });
  });

  it('holds its attacks while the player is out of its reach', () => {
    const player = { x: 15, z: 25, reachable: false };
    const brain = fighting(player);
    const events = run(brain, player, 10);
    expect(events).toEqual([]);
    expect(brain.state).toBe('stalking');
  });

  it('falls once, then ignores every hit until a reset puts it back to sleep', () => {
    const player = { x: 15, z: 25, reachable: true };
    const brain = fighting(player);
    expect(brain.takeHit(brain.maxHealth * 2, 'torso', 15, 5)).toBe('killed');
    expect(brain.state).toBe('defeated');
    expect(brain.health).toBe(0);
    expect(types(brain.pendingEvents)).toEqual(['phase', 'phase', 'defeated']);
    expect(brain.takeHit(100, 'torso', 15, 5)).toBe('ignored');
    brain.clearEvents();
    expect(run(brain, player, 2)).toEqual([]);

    brain.reset();
    expect(brain.state).toBe('dormant');
    expect(brain.phase).toBe(1);
    expect(brain.shieldHeld).toBe(true);
    expect(brain.awaken(ROUND, 15, 25)).toBe(true);
    expect(brain.health).toBe(brain.maxHealth);
  });

  it('replays exactly the same fight from the same random sequence', () => {
    const fight = (): string[] => {
      let seed = 7;
      const random = (): number => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      const player = { x: 15, z: 26, reachable: true };
      const brain = fighting(player, random);
      brain.takeHit(brain.maxHealth * 0.5, 'torso', 15, 5);
      const events = run(brain, player, 30, (time) => {
        player.x = 15 + Math.round(Math.sin(time) * 8);
        player.z = 22 + Math.round(Math.cos(time * 0.7) * 6);
      });
      return events.map((event) => JSON.stringify(event)).concat(`${brain.position.x.toFixed(6)},${brain.position.z.toFixed(6)}`);
    };
    const first = fight();
    expect(first.length).toBeGreaterThan(3);
    expect(fight()).toEqual(first);
  });
});
