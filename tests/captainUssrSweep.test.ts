import { describe, expect, it } from 'vitest';
import {
  CAPTAIN_USSR,
  CaptainUssrBrain,
  type CaptainUssrEvent,
  type CaptainUssrField,
  type CaptainUssrStrip,
  type CaptainUssrTarget,
} from '../src/zombies/guardians/CaptainUssrBrain';

/** A 30 x 30 yard, open; the boss lands in the middle. */
const FIELD: CaptainUssrField = {
  bounds: { minX: 0, maxX: 30, minZ: 0, maxZ: 30 },
  obstacles: [],
  landing: { x: 15, z: 15 },
};
const DT = 1 / 60;
const ROUND = 10;
/** A cautious normal pace: the walk slowed by a heavy weapon, and the moment it takes to react to a mark. */
const DODGE_SPEED = 3.5;
const REACTION = 0.4;
const { sweep } = CAPTAIN_USSR;

type Player = { -readonly [K in keyof CaptainUssrTarget]: CaptainUssrTarget[K] };

/**
 * The injected random, scripted: `queue` is drawn first, then `fallback`.
 * At range the brain rolls the charge, then the sweep: [0.99, 0] fails the
 * charge and picks the sweep.
 */
function scripted(fallback = 0.99): { random: () => number; queue: number[] } {
  const queue: number[] = [];
  return { queue, random: () => queue.shift() ?? fallback };
}
const PICK_SWEEP = [0.99, 0];

function run(brain: CaptainUssrBrain, player: Player, seconds: number, move?: (dt: number) => void): CaptainUssrEvent[] {
  const events: CaptainUssrEvent[] = [];
  for (let frame = 0; frame < Math.round(seconds / DT); frame++) {
    move?.(DT);
    brain.update(DT, player);
    events.push(...brain.pendingEvents);
    brain.clearEvents();
  }
  return events;
}

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

/** Landed, wounded down to `ratio` (phase 2 at 0.6, phase 3 at 0.3), its fit of rage over. */
function wounded(player: Player, ratio: number, random: () => number): CaptainUssrBrain {
  const brain = new CaptainUssrBrain(CAPTAIN_USSR, FIELD, random);
  brain.awaken(ROUND, player.x, player.z);
  run(brain, player, CAPTAIN_USSR.arrivalSeconds + DT);
  brain.takeHit(brain.health - brain.maxHealth * ratio, 'torso', brain.position.x, brain.position.z - 10);
  until(brain, player, 'enraged', 1);
  until(brain, player, 'stalking', CAPTAIN_USSR.rage.seconds + 1);
  brain.clearEvents();
  return brain;
}

/** A copy of the strip marked now. */
function marked(brain: CaptainUssrBrain): CaptainUssrStrip {
  const strip = brain.sweepMark;
  if (!strip) throw new Error('no strip is marked');
  return { ...strip };
}

function direction(strip: CaptainUssrStrip): { x: number; z: number } {
  const length = Math.hypot(strip.toX - strip.fromX, strip.toZ - strip.fromZ);
  return { x: (strip.toX - strip.fromX) / length, z: (strip.toZ - strip.fromZ) / length };
}

/** Distance from (x, z) to the strip's centre line. */
function offLine(strip: CaptainUssrStrip, x: number, z: number): number {
  const dir = direction(strip);
  return Math.abs((x - strip.fromX) * dir.z - (z - strip.fromZ) * dir.x);
}

/** After `REACTION`, walks the player across the strip at `DODGE_SPEED`, towards the yard's middle. */
function dodge(player: Player, strip: CaptainUssrStrip): (dt: number) => void {
  const dir = direction(strip);
  const side = (15 - player.x) * -dir.z + (15 - player.z) * dir.x >= 0 ? 1 : -1;
  let waited = 0;
  return (dt) => {
    waited += dt;
    if (waited < REACTION) return;
    player.x += -dir.z * side * DODGE_SPEED * dt;
    player.z += dir.x * side * DODGE_SPEED * dt;
  };
}

const types = (events: readonly CaptainUssrEvent[]): string[] => events.map((event) => event.type);
const sweepHits = (events: readonly CaptainUssrEvent[]): CaptainUssrEvent[] =>
  events.filter((event) => event.type === 'playerHit' && event.attack === 'sweep');

describe('Captain USSR electrical sweep', () => {
  it('never sweeps in phase one', () => {
    const player = { x: 15, z: 27, reachable: true };
    const brain = new CaptainUssrBrain(CAPTAIN_USSR, FIELD, () => 0);
    brain.awaken(ROUND, player.x, player.z);
    const events = run(brain, player, 20);
    expect(types(events)).not.toContain('sweepWindup');
    expect(brain.sweepMark).toBeNull();
  });

  it('marks a strip through the player in Containment Protocol and strikes it about 1.2 s later', () => {
    const player = { x: 15, z: 27, reachable: true };
    const { random, queue } = scripted();
    const brain = wounded(player, 0.6, random);
    queue.push(...PICK_SWEEP);
    const windup = until(brain, player, 'sweepWindup', 3);
    expect(windup.filter((event) => event.type === 'sweepWindup')).toHaveLength(1);
    const strip = marked(brain);
    expect(offLine(strip, player.x, player.z)).toBeCloseTo(0);
    // Laid along the line from the boss to the player, wall to wall.
    const dir = direction(strip);
    const toPlayer = Math.atan2(player.x - brain.position.x, player.z - brain.position.z);
    expect(Math.abs(Math.sin(Math.atan2(dir.x, dir.z) - toPlayer))).toBeLessThan(1e-6);
    expect(Math.hypot(strip.toX - strip.fromX, strip.toZ - strip.fromZ)).toBeGreaterThan(sweep.length * 0.5);
    expect(sweep.windup).toBeCloseTo(1.2);
    const quiet = run(brain, player, sweep.windup - 2 * DT);
    expect(types(quiet)).toEqual([]);
    expect(brain.state).toBe('sweepWindup');
    const impact = run(brain, player, 3 * DT);
    expect(types(impact)).toContain('sweep');
    expect(sweepHits(impact)).toEqual([{ type: 'playerHit', attack: 'sweep', damage: sweep.damage }]);
  });

  it('strikes exactly the marked area, once', () => {
    for (const [offset, hit] of [[sweep.width / 2 - 0.05, true], [sweep.width / 2 + 0.05, false]] as const) {
      const player = { x: 15, z: 27, reachable: true };
      const { random, queue } = scripted();
      const brain = wounded(player, 0.6, random);
      queue.push(...PICK_SWEEP);
      until(brain, player, 'sweepWindup', 3);
      const dir = direction(marked(brain));
      player.x += -dir.z * offset;
      player.z += dir.x * offset;
      const events = run(brain, player, sweep.windup + sweep.exposedSeconds);
      expect(sweepHits(events), `${offset} m off the line`).toHaveLength(hit ? 1 : 0);
    }
  });

  it('does not follow the player: a sidestep at a normal pace clears the strip', () => {
    const player = { x: 15, z: 27, reachable: true };
    const { random, queue } = scripted();
    const brain = wounded(player, 0.6, random);
    queue.push(...PICK_SWEEP);
    until(brain, player, 'sweepWindup', 3);
    const strip = marked(brain);
    const events = run(brain, player, sweep.windup, dodge(player, strip));
    expect(brain.sweepMark).toBeNull();
    expect(types(events)).toContain('sweep');
    expect(sweepHits(events)).toEqual([]);
    expect(offLine(strip, player.x, player.z)).toBeGreaterThan(sweep.width / 2);
  });

  it('leaves it exposed after the sweep: guard down, hurt from the front, no attack until the window closes', () => {
    const player = { x: 15, z: 27, reachable: true };
    const { random, queue } = scripted();
    const brain = wounded(player, 0.6, random);
    queue.push(...PICK_SWEEP);
    until(brain, player, 'sweepWindup', 3);
    until(brain, player, 'stunned', sweep.windup + 0.1);
    expect(brain.blocking).toBe(false);
    expect(brain.takeHit(10, 'torso', player.x, player.z)).toBe('hurt');
    const window = run(brain, player, sweep.exposedSeconds - 2 * DT);
    expect(brain.state).toBe('stunned');
    expect(types(window)).toEqual([]);
  });

  it('chains two sweeps across different strips in LAST ORDER, each with its own warning, then opens the window', () => {
    const player = { x: 15, z: 27, reachable: true };
    const { random, queue } = scripted();
    const brain = wounded(player, 0.3, random);
    expect(brain.phase).toBe(3);
    queue.push(...PICK_SWEEP);
    until(brain, player, 'sweepWindup', 3);
    const first = marked(brain);
    const firstImpact = run(brain, player, sweep.windup + DT);
    expect(types(firstImpact).filter((type) => type === 'sweep')).toHaveLength(1);
    expect(types(firstImpact).filter((type) => type === 'sweepWindup')).toHaveLength(1);
    expect(brain.state).toBe('sweepWindup');
    const second = marked(brain);
    // Across the first one, through where the player stood when it struck.
    const a = direction(first);
    const b = direction(second);
    expect(Math.abs(a.x * b.x + a.z * b.z)).toBeLessThan(1e-6);
    expect(offLine(second, player.x, player.z)).toBeCloseTo(0);
    const secondImpact = until(brain, player, 'stunned', sweep.windup + 0.1);
    expect(types(secondImpact)).toContain('sweep');
    expect(sweepHits([...firstImpact, ...secondImpact])).toHaveLength(2);
  });

  it('lets a player at a normal pace dodge both sweeps of the chain', () => {
    const player = { x: 15, z: 27, reachable: true };
    const { random, queue } = scripted();
    const brain = wounded(player, 0.3, random);
    queue.push(...PICK_SWEEP);
    until(brain, player, 'sweepWindup', 3);
    const first = run(brain, player, sweep.windup, dodge(player, marked(brain)));
    expect(types(first)).toContain('sweep');
    expect(brain.state).toBe('sweepWindup');
    const second = run(brain, player, sweep.windup, dodge(player, marked(brain)));
    expect(types(second)).toContain('sweep');
    expect(brain.state).toBe('stunned');
    expect(sweepHits([...first, ...second])).toEqual([]);
  });

  it('never sweeps twice in a row', () => {
    const player = { x: 15, z: 27, reachable: true };
    const { random, queue } = scripted();
    const brain = wounded(player, 0.6, random);
    queue.push(...PICK_SWEEP);
    until(brain, player, 'sweepWindup', 3);
    until(brain, player, 'stalking', sweep.windup + sweep.exposedSeconds + 0.1);
    queue.push(...PICK_SWEEP);
    const next = run(brain, player, CAPTAIN_USSR.cooldown.min[1] + CAPTAIN_USSR.cooldown.spread + 0.5);
    expect(types(next)).not.toContain('sweepWindup');
  });

  it('clears a marked sweep when it falls, and strikes nothing afterwards', () => {
    const player = { x: 15, z: 27, reachable: true };
    const { random, queue } = scripted();
    const brain = wounded(player, 0.3, random);
    queue.push(...PICK_SWEEP);
    until(brain, player, 'sweepWindup', 3);
    expect(brain.takeHit(brain.maxHealth, 'torso', 15, 0)).toBe('killed');
    expect(brain.sweepMark).toBeNull();
    brain.clearEvents();
    const after = run(brain, player, 2 * sweep.windup + 1);
    expect(types(after)).toEqual([]);
  });

  it('drops a marked sweep for its fit of rage and on a reset', () => {
    const player = { x: 15, z: 27, reachable: true };
    const { random, queue } = scripted();
    const brain = wounded(player, 0.6, random);
    queue.push(...PICK_SWEEP);
    until(brain, player, 'sweepWindup', 3);
    brain.takeHit(brain.health - brain.maxHealth * 0.3, 'torso', 15, 0);
    const rage = until(brain, player, 'enraged', 1);
    expect(brain.sweepMark).toBeNull();
    const calm = run(brain, player, CAPTAIN_USSR.rage.seconds - DT);
    expect(types([...rage, ...calm])).not.toContain('sweep');
    const fresh = wounded({ ...player }, 0.6, random);
    queue.push(...PICK_SWEEP);
    until(fresh, player, 'sweepWindup', 3);
    run(fresh, player, sweep.windup + DT);
    expect(fresh.sweepStrikes).toBe(1);
    fresh.reset();
    expect(fresh.sweepMark).toBeNull();
    expect(fresh.sweepStrikes).toBe(0);
  });

  it('only starts while no shockwave is rolling, and its chain fits in a readable span', () => {
    const { shockwave } = CAPTAIN_USSR;
    // The shockwave dies out before any next attack, so it never overlaps a strip.
    expect(shockwave.radius / shockwave.speed).toBeLessThan(shockwave.recovery + CAPTAIN_USSR.cooldown.min[2]);
    // A cautious player crosses half a strip with time to spare.
    expect(REACTION + sweep.width / 2 / DODGE_SPEED).toBeLessThan(sweep.windup - 0.3);
  });
});
