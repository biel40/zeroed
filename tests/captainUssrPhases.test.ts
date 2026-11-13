import { describe, expect, it } from 'vitest';
import {
  CAPTAIN_USSR,
  CaptainUssrBrain,
  type CaptainUssrEvent,
  type CaptainUssrField,
  type CaptainUssrTarget,
} from '../src/zombies/guardians/CaptainUssrBrain';

/** A 30 x 30 yard with one crate in its north-east corner; the boss lands in the middle. */
const FIELD: CaptainUssrField = {
  bounds: { minX: 0, maxX: 30, minZ: 0, maxZ: 30 },
  obstacles: [{ minX: 24, maxX: 28, minZ: 2, maxZ: 6 }],
  landing: { x: 15, z: 15 },
};
const DT = 0.0625;
const ROUND = 10;

type Player = { -readonly [K in keyof CaptainUssrTarget]: CaptainUssrTarget[K] };

function fighting(player: Player, random: () => number = () => 0): CaptainUssrBrain {
  const brain = new CaptainUssrBrain(CAPTAIN_USSR, FIELD, random);
  brain.awaken(ROUND, player.x, player.z);
  run(brain, player, CAPTAIN_USSR.arrivalSeconds + DT);
  brain.clearEvents();
  return brain;
}

function run(brain: CaptainUssrBrain, player: Player, seconds: number): CaptainUssrEvent[] {
  const events: CaptainUssrEvent[] = [];
  for (let frame = 0; frame < Math.round(seconds / DT); frame++) {
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

/** Wounds it from behind down to `ratio` of its health, then lets the fit of rage play out. */
function woundTo(brain: CaptainUssrBrain, player: Player, ratio: number): void {
  brain.takeHit(brain.health - brain.maxHealth * ratio, 'torso', brain.position.x, brain.position.z - 10);
  until(brain, player, 'enraged', 1);
  until(brain, player, 'stalking', CAPTAIN_USSR.rage.seconds + 1);
}

const types = (events: readonly CaptainUssrEvent[]): string[] => events.map((event) => event.type);
const hits = (events: readonly CaptainUssrEvent[]): CaptainUssrEvent[] => events.filter((event) => event.type === 'playerHit');

describe('Captain USSR phases', () => {
  it('keeps phase one to its bash, throw and walk: no slam, no shockwave', () => {
    const player = { x: 15, z: 18.5, reachable: true };
    const brain = fighting(player);
    const events = run(brain, player, 12);
    expect(types(events)).toContain('bashWindup');
    expect(types(events)).not.toContain('slamWindup');
    expect(types(events)).not.toContain('shockwaveWindup');
  });

  it('pursues harder from phase two when its prey keeps its distance', () => {
    const far = { x: 15, z: 29, reachable: false };
    const calm = new CaptainUssrBrain(CAPTAIN_USSR, { ...FIELD, landing: { x: 15, z: 2 } }, () => 0);
    calm.awaken(ROUND, far.x, far.z);
    run(calm, far, CAPTAIN_USSR.arrivalSeconds + 0.5);
    const phaseOneSpeed = calm.speed;
    const angry = new CaptainUssrBrain(CAPTAIN_USSR, { ...FIELD, landing: { x: 15, z: 2 } }, () => 0);
    angry.awaken(ROUND, far.x, far.z);
    run(angry, far, CAPTAIN_USSR.arrivalSeconds + DT);
    woundTo(angry, far, 0.6);
    run(angry, far, 0.5);
    expect(phaseOneSpeed).toBeCloseTo(CAPTAIN_USSR.walkSpeed[0]);
    expect(angry.speed).toBeGreaterThan(phaseOneSpeed * 1.4);
  });

  it('slams the ground in front of it from phase two: a player in the cone is hurt and thrown back', () => {
    const player = { x: 15, z: 18.5, reachable: true };
    const brain = fighting(player);
    woundTo(brain, player, 0.6);
    const windup = until(brain, player, 'slamWindup');
    expect(types(windup)).toContain('slamWindup');
    const impact = until(brain, player, 'recovering', 2);
    expect(types(impact)).toContain('slam');
    const [hit] = hits(impact);
    expect(hit).toMatchObject({ type: 'playerHit', attack: 'slam', damage: CAPTAIN_USSR.slam.damage });
    if (hit.type !== 'playerHit' || !hit.push) throw new Error('the slam throws the player back');
    // Thrown away from the boss, along +z here.
    expect(hit.push.z).toBeGreaterThan(CAPTAIN_USSR.slam.knockback * 0.9);
    expect(Math.abs(hit.push.x)).toBeLessThan(1);
  });

  it('locks its aim late in the slam windup: a sidestep out of the cone is spared', () => {
    const player = { x: 15, z: 18.5, reachable: true };
    const brain = fighting(player);
    woundTo(brain, player, 0.6);
    until(brain, player, 'slamWindup');
    run(brain, player, CAPTAIN_USSR.slam.windup * (CAPTAIN_USSR.slam.aimLock + 0.05));
    const heading = brain.heading;
    player.x = 19.5;
    player.z = 15.5;
    const impact = until(brain, player, 'recovering', 2);
    expect(brain.heading).toBeCloseTo(heading);
    expect(types(impact)).toContain('slam');
    expect(hits(impact)).toEqual([]);
  });

  it('sends out a shockwave in LAST ORDER that hurts once whoever it sweeps over', () => {
    const player = { x: 15, z: 20, reachable: true };
    const brain = fighting(player);
    woundTo(brain, player, 0.3);
    expect(brain.phase).toBe(3);
    expect(types(until(brain, player, 'shockwaveWindup'))).toContain('shockwaveWindup');
    expect(brain.shockwave.radius).toBeLessThan(0);
    const events = until(brain, player, 'recovering', 3);
    expect(types(events)).toContain('shockwave');
    const wave = run(brain, player, CAPTAIN_USSR.shockwave.radius / CAPTAIN_USSR.shockwave.speed + 0.5);
    const landed = hits([...events, ...wave]);
    expect(landed).toHaveLength(1);
    expect(landed[0]).toMatchObject({ attack: 'shockwave', damage: CAPTAIN_USSR.shockwave.damage });
    expect(brain.shockwave.radius).toBeLessThan(0);
  });

  it('cannot reach a player beyond its radius, nor one jumping as it passes', () => {
    for (const dodge of ['distance', 'jump'] as const) {
      const player: Player = { x: 15, z: 20, reachable: true, airborne: false };
      const brain = fighting(player);
      woundTo(brain, player, 0.3);
      until(brain, player, 'shockwaveWindup');
      if (dodge === 'distance') player.z = brain.position.z + CAPTAIN_USSR.shockwave.radius + 1;
      else player.airborne = true;
      const events = run(brain, player, CAPTAIN_USSR.shockwave.windup + CAPTAIN_USSR.shockwave.radius / CAPTAIN_USSR.shockwave.speed + 0.3);
      expect(types(events), dodge).toContain('shockwave');
      expect(hits(events).filter((event) => event.type === 'playerHit' && event.attack === 'shockwave'), dodge).toEqual([]);
    }
  });

  it('never sends two shockwaves in a row', () => {
    const player = { x: 15, z: 18.5, reachable: true };
    const brain = fighting(player);
    woundTo(brain, player, 0.3);
    until(brain, player, 'shockwaveWindup');
    until(brain, player, 'recovering', 3);
    until(brain, player, 'stalking', 3);
    const next = until(brain, player, 'slamWindup', 6);
    expect(types(next)).not.toContain('shockwaveWindup');
  });

  it('lets each shockwave die out before its next attack can begin', () => {
    const { shockwave, cooldown } = CAPTAIN_USSR;
    expect(shockwave.radius / shockwave.speed).toBeLessThan(shockwave.recovery + cooldown.min[2]);
  });

  it('charges twice in LAST ORDER, with a short readable gather between the charges', () => {
    // Diagonal across the yard: the first charge runs out in the open, short of the fence.
    const player = { x: 27, z: 24, reachable: true };
    const brain = fighting(player);
    woundTo(brain, player, 0.3);
    until(brain, player, 'charging');
    player.x = 4;
    player.z = 4;
    const first = until(brain, player, 'chargeWindup', 3);
    expect(first.find((event) => event.type === 'chargeEnded')).toEqual({ type: 'chargeEnded', crashed: false });
    expect(types(first)).toContain('chargeWindup');
    const gather = run(brain, player, CAPTAIN_USSR.charge.repeatWindup - DT);
    expect(brain.state).toBe('chargeWindup');
    expect(types(gather)).toEqual([]);
    expect(types(until(brain, player, 'charging', 1))).toContain('charge');
    until(brain, player, 'stunned', 4);
  });

  it('charges once in Containment Protocol, ending winded', () => {
    const player = { x: 27, z: 24, reachable: true };
    const brain = fighting(player);
    woundTo(brain, player, 0.6);
    until(brain, player, 'charging');
    player.x = 4;
    player.z = 4;
    const charge = until(brain, player, 'stunned', 3);
    expect(charge.find((event) => event.type === 'chargeEnded')).toEqual({ type: 'chargeEnded', crashed: false });
  });

  it('is stopped by a crash: no second charge after it hits a solid', () => {
    const player = { x: 15, z: 27, reachable: true };
    const brain = fighting(player);
    woundTo(brain, player, 0.3);
    // Far enough for no shockwave or slam: it charges straight into the north fence.
    until(brain, player, 'charging');
    player.x = 4;
    const crash = until(brain, player, 'stunned', 4);
    expect(crash.find((event) => event.type === 'chargeEnded')).toEqual({ type: 'chargeEnded', crashed: true });
    expect(types(crash)).not.toContain('chargeWindup');
  });
});
