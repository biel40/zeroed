import { describe, expect, it } from 'vitest';
import {
  MYSTERY_BOX_POOL,
  MYSTERY_BOX_TUNING,
  MysteryBoxMachine,
  pickWeighted,
  type MysteryBoxEventType,
} from '../src/zombies/MysteryBox';
import type { WeaponId } from '../src/weapons/WeaponTypes';

const DT = 1 / 60;

/** Steps the machine, collecting every emitted event. */
function step(machine: MysteryBoxMachine, seconds: number): MysteryBoxEventType[] {
  const events: MysteryBoxEventType[] = [];
  const frames = Math.round(seconds / DT);
  for (let i = 0; i < frames; i++) {
    machine.update(DT);
    for (const event of machine.pendingEvents) events.push(event.type);
    machine.clearEvents();
  }
  return events;
}

/** Full opening + rolling sequence; ends in awaitingPickup with a result. */
function roll(machine: MysteryBoxMachine): WeaponId {
  expect(machine.tryActivate()).toBe(true);
  step(machine, MYSTERY_BOX_TUNING.openTime + 0.1);
  step(machine, MYSTERY_BOX_TUNING.rollTimeMax + 0.2);
  expect(machine.state).toBe('awaitingPickup');
  const result = machine.result;
  expect(result).not.toBeNull();
  return result as WeaponId;
}

describe('Mystery Box pool', () => {
  it('contains exactly M4A1, AK-47, M60, L96 and the Ray Gun', () => {
    expect(MYSTERY_BOX_POOL.map((entry) => entry.weaponId).sort()).toEqual(
      ['ak47', 'l96', 'm4a1', 'm60', 'raygun'].sort(),
    );
  });

  it('never includes the M1911 (starting weapon)', () => {
    expect(MYSTERY_BOX_POOL.some((entry) => entry.weaponId === 'm1911')).toBe(false);
  });

  it('makes the Ray Gun clearly the rarest pull', () => {
    const raygun = MYSTERY_BOX_POOL.find((entry) => entry.weaponId === 'raygun');
    const others = MYSTERY_BOX_POOL.filter((entry) => entry.weaponId !== 'raygun');
    expect(raygun).toBeDefined();
    for (const entry of others) expect(raygun!.weight).toBeLessThan(entry.weight);
  });
});

describe('pickWeighted (deterministic, injected rng)', () => {
  const pool = MYSTERY_BOX_POOL;

  it('maps the roll onto cumulative weights', () => {
    // Total weight 100: [0..25) m4a1, [25..50) ak47, [50..70) m60, [70..90) l96, [90..100) raygun.
    expect(pickWeighted(pool, () => 0)).toBe('m4a1');
    expect(pickWeighted(pool, () => 0.2499)).toBe('m4a1');
    expect(pickWeighted(pool, () => 0.25)).toBe('ak47');
    expect(pickWeighted(pool, () => 0.55)).toBe('m60');
    expect(pickWeighted(pool, () => 0.75)).toBe('l96');
    expect(pickWeighted(pool, () => 0.9999)).toBe('raygun');
  });

  it('dampens the previous result without making it impossible', () => {
    // With lastId=ak47 and factor 0.5: weights become 25 / 12.5 / 20 / 20 / 10 → total 87.5.
    // The AK window shrinks from [0.25..0.50) to [25/87.5≈0.2857 .. 37.5/87.5≈0.4286).
    expect(pickWeighted(pool, () => 0.3, 'ak47', 0.5)).toBe('ak47'); // still possible
    expect(pickWeighted(pool, () => 0.45, 'ak47', 0.5)).toBe('m60'); // old AK territory, now M60
    expect(pickWeighted(pool, () => 0.27, 'ak47', 0.5)).toBe('m4a1'); // below the shrunk window
  });

  it('with factor 0 the previous weapon cannot repeat at all', () => {
    // factor 0 removes ak47 from the wheel (total 75): [0..25) m4a1, [25..45) m60, …
    // A roll of 0.5 × 75 = 37.5 lands where the AK used to be and skips to m60.
    expect(pickWeighted(pool, () => 0.5, 'ak47', 0)).toBe('m60');
  });

  it('falls back to the last entry when the roll lands on the exact total', () => {
    expect(pickWeighted(pool, () => 1)).toBe('raygun');
  });
});

describe('MysteryBoxMachine state flow', () => {
  it('starts closed and usable', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    expect(machine.state).toBe('closed');
    expect(machine.canUse).toBe(true);
    expect(machine.result).toBeNull();
  });

  it('walks closed → opening → rolling → awaitingPickup with a pool result', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    expect(machine.tryActivate()).toBe(true);
    expect(machine.state).toBe('opening');
    expect(machine.canUse).toBe(false);

    let events = step(machine, MYSTERY_BOX_TUNING.openTime + 0.1);
    expect(events).toContain('opened');
    expect(machine.state).toBe('rolling');

    events = step(machine, MYSTERY_BOX_TUNING.rollTimeMax + 0.2);
    expect(events).toContain('rollTick');
    expect(events).toContain('result');
    expect(machine.state).toBe('awaitingPickup');
    expect(MYSTERY_BOX_POOL.some((e) => e.weaponId === machine.result)).toBe(true);
  });

  it('ignores activation spam while busy', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    expect(machine.tryActivate()).toBe(true);
    expect(machine.tryActivate()).toBe(false); // opening
    step(machine, MYSTERY_BOX_TUNING.openTime + 0.1);
    expect(machine.tryActivate()).toBe(false); // rolling
    step(machine, MYSTERY_BOX_TUNING.rollTimeMax + 0.2);
    expect(machine.tryActivate()).toBe(false); // awaitingPickup
    expect(machine.state).toBe('awaitingPickup');
  });

  it('lets the player pick the result up, then closes and re-opens', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    const result = roll(machine);

    let events: MysteryBoxEventType[] = [];
    const picked = machine.tryPickup();
    events = step(machine, MYSTERY_BOX_TUNING.closeTime + 0.1);
    expect(picked).toBe(result);
    expect(machine.result).toBeNull();
    expect(events).toContain('closed');
    expect(machine.state).toBe('closed');
    expect(machine.tryActivate()).toBe(true); // usable again
  });

  it('refuses pickup while rolling or closed', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    expect(machine.tryPickup()).toBeNull();
    machine.tryActivate();
    expect(machine.tryPickup()).toBeNull();
    step(machine, MYSTERY_BOX_TUNING.openTime + 0.1);
    expect(machine.tryPickup()).toBeNull();
    expect(machine.state).toBe('rolling');
  });

  it('expires an unclaimed result after the pickup window and closes', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    roll(machine);
    const events = step(machine, MYSTERY_BOX_TUNING.pickupTime + MYSTERY_BOX_TUNING.closeTime + 0.3);
    expect(events).toContain('expired');
    expect(events).toContain('closed');
    expect(machine.state).toBe('closed');
    expect(machine.result).toBeNull();
    expect(machine.tryActivate()).toBe(true);
  });

  it('rolls for a randomized duration inside the configured window', () => {
    // rng = 0 → minimum roll time.
    const fast = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0);
    fast.tryActivate();
    step(fast, MYSTERY_BOX_TUNING.openTime + 0.1);
    step(fast, MYSTERY_BOX_TUNING.rollTimeMin + 0.05);
    expect(fast.state).toBe('awaitingPickup');

    // rng → 0.999… → maximum roll time: still rolling just before rollTimeMax.
    const slow = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.9999);
    slow.tryActivate();
    step(slow, MYSTERY_BOX_TUNING.openTime + 0.1);
    step(slow, MYSTERY_BOX_TUNING.rollTimeMax - 0.3);
    expect(slow.state).toBe('rolling');
  });

  it('reset returns to a clean closed state (zombies restart)', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    roll(machine);
    machine.reset();
    expect(machine.state).toBe('closed');
    expect(machine.result).toBeNull();
    expect(machine.canUse).toBe(true);
    expect(machine.pendingEvents).toHaveLength(0);
    // And a fresh roll works afterwards.
    expect(machine.tryActivate()).toBe(true);
  });
});
