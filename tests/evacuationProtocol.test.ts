import { describe, expect, it } from 'vitest';
import { EVACUATION_HORDE, EvacuationHorde } from '../src/zombies/evacuation/EvacuationHorde';
import { EvacuationProtocol, type EvacuationEvent, type EvacuationRules } from '../src/zombies/evacuation/EvacuationProtocol';

const RULES: EvacuationRules = { switchIds: ['ventilation', 'security'], cost: 10000, defenseSeconds: 120, escapeSeconds: 60 };

function drain(protocol: EvacuationProtocol): EvacuationEvent['type'][] {
  const types = protocol.pendingEvents.map((event) => event.type);
  protocol.clearEvents();
  return types;
}

function readyProtocol(): EvacuationProtocol {
  const protocol = new EvacuationProtocol(RULES);
  protocol.powerRestored();
  protocol.throwSwitch('ventilation');
  protocol.throwSwitch('security');
  protocol.clearEvents();
  return protocol;
}

/** Frames that sum exactly in binary, so whole seconds land on the boundaries. */
const DT = 0.125;

/** Advances in fixed frames; `defended` decides each frame's defence. */
function run(protocol: EvacuationProtocol, seconds: number, defended: boolean | ((time: number) => boolean)): void {
  const frames = Math.round(seconds / DT);
  for (let frame = 0; frame < frames; frame++) {
    protocol.update(DT, typeof defended === 'function' ? defended(frame * DT) : defended);
  }
}

describe('Evacuation protocol', () => {
  it('stays locked, unbriefed and unswitchable until the power comes on', () => {
    const protocol = new EvacuationProtocol(RULES);
    expect(protocol.stage).toBe('locked');
    expect(protocol.brief()).toBe(false);
    expect(protocol.throwSwitch('ventilation')).toBe(false);
    expect(protocol.initiate()).toBe(false);
    expect(protocol.powerRestored()).toBe(true);
    expect(protocol.stage).toBe('exploration');
    expect(protocol.powerRestored()).toBe(false);
    expect(protocol.brief()).toBe(true);
    expect(protocol.brief()).toBe(false);
  });

  it('restores each auxiliary system once and becomes ready with both', () => {
    const protocol = new EvacuationProtocol(RULES);
    protocol.powerRestored();
    expect(protocol.throwSwitch('unknown')).toBe(false);
    expect(protocol.throwSwitch('ventilation')).toBe(true);
    expect(protocol.throwSwitch('ventilation')).toBe(false);
    expect(protocol.isSwitchThrown('ventilation')).toBe(true);
    expect(protocol.briefed).toBe(true);
    expect(protocol.stage).toBe('exploration');
    expect(protocol.initiate()).toBe(false);
    expect(protocol.throwSwitch('security')).toBe(true);
    expect(protocol.stage).toBe('ready');
    expect(drain(protocol)).toEqual(['switchThrown', 'switchThrown', 'ready']);
    expect(protocol.throwSwitch('security')).toBe(false);
  });

  it('starts exactly once', () => {
    const protocol = readyProtocol();
    expect(protocol.initiate()).toBe(true);
    expect(protocol.initiate()).toBe(false);
    expect(protocol.stage).toBe('defending');
    expect(protocol.active).toBe(true);
    expect(drain(protocol)).toEqual(['initiated']);
  });

  it('needs 120 s of accumulated defence, pausing without losing progress', () => {
    const protocol = readyProtocol();
    protocol.initiate();
    run(protocol, 60, true);
    expect(protocol.defenseProgress).toBeCloseTo(0.5, 6);
    run(protocol, 45, false);
    expect(protocol.stage).toBe('defending');
    expect(protocol.defenseProgress).toBeCloseTo(0.5, 6);
    expect(protocol.defended).toBe(false);
    run(protocol, 60 - DT, true);
    expect(protocol.stage).toBe('defending');
    expect(protocol.defenseRemaining).toBe(DT);
    run(protocol, DT, true);
    expect(protocol.stage).toBe('escaping');
    expect(protocol.defenseProgress).toBe(1);
    expect(drain(protocol)).toEqual(['initiated', 'defensePaused', 'defenseResumed', 'doorOpened']);
  });

  it('reports each pause and resume once, however long it lasts', () => {
    const protocol = readyProtocol();
    protocol.initiate();
    protocol.clearEvents();
    run(protocol, 30, (time) => time < 10 || time >= 20);
    expect(drain(protocol)).toEqual(['defensePaused', 'defenseResumed']);
    expect(protocol.defenseProgress).toBe(20 / 120);
  });

  it('opens the escape only after the defence and fails it after exactly 60 s', () => {
    const protocol = readyProtocol();
    expect(protocol.extract()).toBe(false);
    protocol.initiate();
    expect(protocol.extract()).toBe(false);
    run(protocol, 120, true);
    expect(protocol.stage).toBe('escaping');
    expect(protocol.escapeRemaining).toBe(60);
    protocol.clearEvents();
    // The escape clock ignores whether anyone stays at the controls.
    run(protocol, 60 - DT, false);
    expect(protocol.stage).toBe('escaping');
    expect(protocol.escapeRemaining).toBe(DT);
    run(protocol, DT, false);
    expect(protocol.stage).toBe('failed');
    expect(protocol.active).toBe(false);
    expect(protocol.extract()).toBe(false);
    expect(drain(protocol)).toEqual(['escapeFailed']);
  });

  it('completes on extraction in time, once', () => {
    const protocol = readyProtocol();
    protocol.initiate();
    run(protocol, 120, true);
    run(protocol, 30, true);
    protocol.clearEvents();
    expect(protocol.extract()).toBe(true);
    expect(protocol.extract()).toBe(false);
    expect(protocol.stage).toBe('completed');
    run(protocol, 60, true);
    expect(protocol.stage).toBe('completed');
    expect(drain(protocol)).toEqual(['extracted']);
  });

  it('lets the developer shortcut skip straight to a successful extraction, once', () => {
    const protocol = new EvacuationProtocol(RULES);
    expect(protocol.skipToExtraction()).toBe(true);
    expect(protocol.stage).toBe('completed');
    expect(protocol.skipToExtraction()).toBe(false);
    expect(drain(protocol)).toEqual(['extracted']);
    const failed = readyProtocol();
    failed.initiate();
    run(failed, 180, true);
    expect(failed.stage).toBe('failed');
    expect(failed.skipToExtraction()).toBe(false);
  });

  it('resets every stage, switch, timer and event for a new run', () => {
    const protocol = readyProtocol();
    protocol.initiate();
    run(protocol, 130, true);
    protocol.reset();
    expect(protocol.stage).toBe('locked');
    expect(protocol.briefed).toBe(false);
    expect(protocol.isSwitchThrown('ventilation')).toBe(false);
    expect(protocol.defenseProgress).toBe(0);
    expect(protocol.escapeRemaining).toBe(0);
    expect(protocol.pendingEvents).toEqual([]);
    expect(protocol.powerRestored()).toBe(true);
    expect(protocol.throwSwitch('ventilation')).toBe(true);
  });
});

describe('Evacuation horde', () => {
  function spawnsOver(horde: EvacuationHorde, seconds: number, alive: number, dt = 0.1): number {
    let spawned = 0;
    for (let time = 0; time < seconds - 1e-9; time += dt) spawned += horde.update(dt, alive);
    return spawned;
  }

  it('spawns nothing until started and nothing after stopping', () => {
    const horde = new EvacuationHorde(EVACUATION_HORDE, false);
    expect(spawnsOver(horde, 10, 0)).toBe(0);
    horde.start(10, 1);
    expect(horde.update(0, 0)).toBe(1);
    horde.stop();
    expect(spawnsOver(horde, 10, 0)).toBe(0);
  });

  it('builds pressure over the event: faster spawns and a higher cap at the peak', () => {
    const horde = new EvacuationHorde(EVACUATION_HORDE, false);
    horde.start(1, 1);
    const opening = { interval: horde.spawnInterval, cap: horde.aliveCap };
    spawnsOver(horde, EVACUATION_HORDE.rampSeconds, 0);
    expect(horde.spawnInterval).toBeCloseTo(EVACUATION_HORDE.interval.end, 6);
    expect(opening.interval).toBeCloseTo(EVACUATION_HORDE.interval.start, 6);
    expect(horde.aliveCap).toBeGreaterThan(opening.cap);
    expect(opening.cap).toBe(EVACUATION_HORDE.alive.start);
  });

  it('never exceeds its cap and never banks spawns while full', () => {
    const horde = new EvacuationHorde(EVACUATION_HORDE, false);
    horde.start(5, 1);
    expect(spawnsOver(horde, 30, EVACUATION_HORDE.cap.full)).toBe(0);
    // A freed slot after a long full stretch gets one zombie, not the backlog.
    expect(horde.update(0, horde.aliveCap - 1)).toBe(1);
    expect(horde.update(0, horde.aliveCap - 1)).toBe(0);
  });

  it('scales with round and players and keeps reduced-effects devices lighter', () => {
    const solo = new EvacuationHorde(EVACUATION_HORDE, false);
    const late = new EvacuationHorde(EVACUATION_HORDE, false);
    const duo = new EvacuationHorde(EVACUATION_HORDE, false);
    const mobile = new EvacuationHorde(EVACUATION_HORDE, true);
    solo.start(1, 1);
    late.start(25, 1);
    duo.start(1, 2);
    mobile.start(60, 4);
    expect(late.aliveCap).toBeGreaterThan(solo.aliveCap);
    expect(duo.aliveCap).toBe(solo.aliveCap + EVACUATION_HORDE.alivePerExtraPlayer);
    expect(duo.spawnInterval).toBeLessThan(solo.spawnInterval);
    expect(mobile.aliveCap).toBe(EVACUATION_HORDE.cap.reduced);
    const desktop = new EvacuationHorde(EVACUATION_HORDE, false);
    desktop.start(60, 4);
    spawnsOver(desktop, 200, 0);
    expect(desktop.aliveCap).toBe(EVACUATION_HORDE.cap.full);
  });

  it('retries a spawn it could not place on the next frame', () => {
    const horde = new EvacuationHorde(EVACUATION_HORDE, false);
    horde.start(1, 1);
    expect(horde.update(0.016, 0)).toBe(1);
    expect(horde.update(0.016, 1)).toBe(0);
    horde.requeue();
    expect(horde.update(0.016, 1)).toBe(1);
    horde.reset();
    expect(horde.isRunning).toBe(false);
  });
});
