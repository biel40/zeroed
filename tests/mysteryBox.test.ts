import { describe, expect, it } from 'vitest';
import {
  MYSTERY_BOX_POOL,
  MYSTERY_BOX_TUNING,
  MysteryBoxMachine,
  pickWeighted,
  type MysteryBoxEventType,
} from '../src/zombies/MysteryBox';
import type { WeaponId } from '../src/weapons/WeaponTypes';
import {
  getMysteryBoxResultColor,
  LEGENDARY_MYSTERY_BOX_COLOR,
  MYSTERY_BOX_VISUAL_SIZE,
} from '../src/zombies/MysteryBoxView';

const DT = 1 / 60;

it('keeps the Mystery Box as a low, elongated chest', () => {
  expect(MYSTERY_BOX_VISUAL_SIZE.width).toBeGreaterThanOrEqual(1.8);
  expect(MYSTERY_BOX_VISUAL_SIZE.bodyHeight).toBeLessThanOrEqual(0.62);
  expect(MYSTERY_BOX_VISUAL_SIZE.width / MYSTERY_BOX_VISUAL_SIZE.bodyHeight).toBeGreaterThan(2.8);
  expect(MYSTERY_BOX_VISUAL_SIZE.depth).toBeGreaterThanOrEqual(0.82);
  expect(MYSTERY_BOX_VISUAL_SIZE.depth).toBeLessThanOrEqual(0.92);
});

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
  step(machine, MYSTERY_BOX_TUNING.revealTime + 0.1);
  expect(machine.state).toBe('awaitingPickup');
  const result = machine.result;
  expect(result).not.toBeNull();
  return result as WeaponId;
}

describe('Mystery Box pool', () => {
  it('contains the standard weapons, Ray Gun and ZEUS-77', () => {
    expect(MYSTERY_BOX_POOL.map((entry) => entry.weaponId).sort()).toEqual(
      ['ak47', 'l96', 'm4a1', 'm60', 'raygun', 'tesla'].sort(),
    );
  });

  it('never includes the M1911 (starting weapon)', () => {
    expect(MYSTERY_BOX_POOL.some((entry) => entry.weaponId === 'm1911')).toBe(false);
  });

  it('makes ZEUS-77 a legendary pull rarer than the Ray Gun', () => {
    const tesla = MYSTERY_BOX_POOL.find((entry) => entry.weaponId === 'tesla');
    const raygun = MYSTERY_BOX_POOL.find((entry) => entry.weaponId === 'raygun');
    expect(tesla).toMatchObject({ weight: 1, rarity: 'legendary' });
    expect(raygun).toMatchObject({ weight: 10, rarity: 'rare' });
    expect(tesla!.weight).toBeLessThan(raygun!.weight);
    const others = MYSTERY_BOX_POOL.filter((entry) => entry.rarity === 'standard');
    expect(raygun).toBeDefined();
    for (const entry of others) expect(raygun!.weight).toBeLessThan(entry.weight);
  });

  it('maps the legendary ZEUS-77 reveal to gold', () => {
    const tesla = MYSTERY_BOX_POOL.find((entry) => entry.weaponId === 'tesla')!;
    expect(getMysteryBoxResultColor(tesla.weaponId, tesla.rarity)).toBe(
      LEGENDARY_MYSTERY_BOX_COLOR,
    );
  });
});
describe('pickWeighted (deterministic, injected rng)', () => {
  const pool = MYSTERY_BOX_POOL;

  it('maps the roll onto cumulative weights', () => {
    // Total 101: 25/25/20/20/10/1, with ZEUS-77 occupying the final 1-weight slice.
    expect(pickWeighted(pool, () => 0)).toBe('m4a1');
    expect(pickWeighted(pool, () => 0.24)).toBe('m4a1');
    expect(pickWeighted(pool, () => 0.25)).toBe('ak47');
    expect(pickWeighted(pool, () => 0.55)).toBe('m60');
    expect(pickWeighted(pool, () => 0.75)).toBe('l96');
    expect(pickWeighted(pool, () => 0.95)).toBe('raygun');
    expect(pickWeighted(pool, () => 0.9999)).toBe('tesla');
  });

  it('dampens the previous result without making it impossible', () => {
    // With lastId=ak47 and factor 0.5: weights become 25 / 12.5 / 20 / 20 / 10 / 1 → total 88.5.
    // The AK window shrinks to [25/88.5≈0.2825 .. 37.5/88.5≈0.4237).
    expect(pickWeighted(pool, () => 0.3, 'ak47', 0.5)).toBe('ak47'); // still possible
    expect(pickWeighted(pool, () => 0.45, 'ak47', 0.5)).toBe('m60'); // old AK territory, now M60
    expect(pickWeighted(pool, () => 0.27, 'ak47', 0.5)).toBe('m4a1'); // below the shrunk window
  });

  it('with factor 0 the previous weapon cannot repeat at all', () => {
    // factor 0 removes ak47 from the wheel (total 76): [0..25) m4a1, [25..45) m60, …
    // A roll of 0.5 × 76 = 38 lands where the AK used to be and skips to m60.
    expect(pickWeighted(pool, () => 0.5, 'ak47', 0)).toBe('m60');
  });

  it('completely excludes the equipped weapon while preserving the other weights', () => {
    expect(pickWeighted(pool, () => 0, null, 1, 'm4a1')).toBe('ak47');
    expect(pickWeighted(pool, () => 0.9999, null, 1, 'tesla')).toBe('raygun');
  });

  it('falls back to the last entry when the roll lands on the exact total', () => {
    expect(pickWeighted(pool, () => 1)).toBe('tesla');
  });
});

describe('MysteryBoxMachine state flow', () => {
  it('starts closed and usable', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    expect(machine.state).toBe('closed');
    expect(machine.canUse).toBe(true);
    expect(machine.result).toBeNull();
  });

  it('starts the open cue right when the player interacts so the audio is not delayed', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    expect(machine.tryActivate()).toBe(true);
    expect(machine.pendingEvents.map((event) => event.type)).toContain('opened');
    expect(machine.state).toBe('opening');
  });

  it('walks closed → opening → rolling → awaitingPickup with a pool result', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    expect(machine.tryActivate()).toBe(true);
    expect(machine.state).toBe('opening');
    expect(machine.canUse).toBe(false);

    let events = step(machine, MYSTERY_BOX_TUNING.openTime + 0.1);
    expect(events).toContain('opened');
    expect(machine.state).toBe('rolling');

    events = step(machine, MYSTERY_BOX_TUNING.revealTime);
    expect(events).toContain('rollTick');
    expect(events).toContain('result');
    expect(machine.state).toBe('awaitingPickup');
    expect(MYSTERY_BOX_POOL.some((e) => e.weaponId === machine.result)).toBe(true);
  });

  it('never offers the weapon equipped when the box was activated', () => {
    for (const equipped of MYSTERY_BOX_POOL.map((entry) => entry.weaponId)) {
      for (const random of [0, 0.25, 0.5, 0.75, 0.9999]) {
        const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => random);
        expect(machine.tryActivate(equipped)).toBe(true);
        step(machine, MYSTERY_BOX_TUNING.revealTime + 0.1);
        expect(machine.result).not.toBe(equipped);
      }
    }
  });

  it('ignores activation spam while busy', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    expect(machine.tryActivate()).toBe(true);
    expect(machine.tryActivate()).toBe(false); // opening
    step(machine, MYSTERY_BOX_TUNING.openTime + 0.1);
    expect(machine.tryActivate()).toBe(false); // rolling
    step(machine, MYSTERY_BOX_TUNING.revealTime);
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

  it('reveals the weapon exactly five seconds after activation for every RNG value', () => {
    expect(MYSTERY_BOX_TUNING.revealTime).toBe(5);
    for (const rng of [() => 0, () => 0.5, () => 0.9999]) {
      const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, rng);
      machine.tryActivate();
      step(machine, MYSTERY_BOX_TUNING.revealTime - DT);
      expect(machine.state).toBe('rolling');
      step(machine, DT * 2);
      expect(machine.state).toBe('awaitingPickup');
    }
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

describe('MysteryBoxMachine fixed reveal', () => {
  /** Activates and steps until the result is offered; returns seconds since activation. */
  function timeToReveal(machine: MysteryBoxMachine): number {
    expect(machine.tryActivate()).toBe(true);
    let elapsed = 0;
    while (machine.state !== 'awaitingPickup' && elapsed < 30) {
      machine.update(DT);
      machine.clearEvents();
      elapsed += DT;
    }
    expect(machine.state).toBe('awaitingPickup');
    return elapsed;
  }

  it('offers the result five seconds after activation', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    expect(timeToReveal(machine)).toBeCloseTo(5, 2);
  });

  it('emits the result exactly once per roll (no double delivery)', () => {
    const machine = new MysteryBoxMachine(MYSTERY_BOX_POOL, MYSTERY_BOX_TUNING, () => 0.5);
    machine.tryActivate();
    const events = step(machine, 12); // whole sequence + pickup window start
    expect(events.filter((type) => type === 'result')).toHaveLength(1);
    // Picking up consumes the single result; a second pickup is refused.
    expect(machine.tryPickup()).not.toBeNull();
    expect(machine.tryPickup()).toBeNull();
  });
});
