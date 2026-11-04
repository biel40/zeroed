import { describe, expect, it } from 'vitest';
import { EVACUATION_ENDING_TIMELINE as BEAT } from '../src/zombies/evacuation/EvacuationEndingTimeline';
import { PROTOCOL33_DEPARTURE, PROTOCOL33_ESCAPE_HORDE } from '../src/zombies/maps/Station33Config';
import { createEscapeDrivePose, escapeDrivePose, escapeHordeDue, escapeHordeSpot } from '../src/zombies/maps/station33/EscapeDrive';

const pose = createEscapeDrivePose();
const at = (time: number): ReturnType<typeof createEscapeDrivePose> => escapeDrivePose(time, PROTOCOL33_DEPARTURE, pose);

describe('Station 33 escape drive', () => {
  it('waits at the gate with its doors shutting and its lights coming on', () => {
    expect(at(0).distance).toBe(0);
    expect(at(0).doorsShut).toBe(0);
    expect(at(0).headlights).toBe(0);
    expect(at(BEAT.launch).doorsShut).toBe(1);
    expect(at(BEAT.launch).distance).toBe(0);
    expect(at(BEAT.headlights - 0.01).headlights).toBe(0);
    expect(at(BEAT.headlights + 0.6).headlights).toBe(1);
  });

  it('reaches the gate exactly on the impact beat, then rams it open', () => {
    expect(at(BEAT.gateImpact).distance).toBeCloseTo(PROTOCOL33_DEPARTURE.gateGap, 6);
    expect(at(BEAT.gateImpact).gateSwing).toBe(0);
    expect(at(BEAT.gateImpact).jolt).toBe(0);
    expect(at(BEAT.gateImpact + 0.1).gateSwing).toBeGreaterThan(0);
    expect(Math.abs(at(BEAT.gateImpact + 0.05).jolt)).toBeGreaterThan(0);
  });

  it('swings the leaves out past open without folding them into the fence, and settles', () => {
    let widest = 0;
    for (let time = BEAT.gateImpact; time < BEAT.gateImpact + 3; time += 0.01) widest = Math.max(widest, at(time).gateSwing);
    expect(widest).toBeGreaterThan(PROTOCOL33_DEPARTURE.gateSwing);
    expect(widest).toBeLessThan(Math.PI * 0.8);
    expect(at(BEAT.gateImpact + 4).gateSwing).toBeCloseTo(PROTOCOL33_DEPARTURE.gateSwing, 2);
    expect(Math.abs(at(BEAT.gateImpact + 4).jolt)).toBeLessThan(1e-3);
  });

  it('only ever drives forward, never faster than its top speed, and stops at the end of the road', () => {
    const step = 0.05;
    let previous = 0;
    for (let time = 0; time < 40; time += step) {
      const distance = at(time).distance;
      expect(distance).toBeGreaterThanOrEqual(previous);
      expect(distance - previous).toBeLessThanOrEqual(PROTOCOL33_DEPARTURE.topSpeed * step + 1e-9);
      previous = distance;
    }
    expect(previous).toBe(PROTOCOL33_DEPARTURE.maxDistance);
  });

  it('lets the horde out of the stairhead one by one, after the truck has gone, up to its count', () => {
    const { from, interval, count } = PROTOCOL33_ESCAPE_HORDE;
    expect(from).toBeGreaterThan(BEAT.gateImpact);
    expect(escapeHordeDue(0, PROTOCOL33_ESCAPE_HORDE)).toBe(0);
    expect(escapeHordeDue(from - 0.01, PROTOCOL33_ESCAPE_HORDE)).toBe(0);
    expect(escapeHordeDue(from, PROTOCOL33_ESCAPE_HORDE)).toBe(1);
    expect(escapeHordeDue(from + interval * 2.5, PROTOCOL33_ESCAPE_HORDE)).toBe(3);
    expect(escapeHordeDue(1000, PROTOCOL33_ESCAPE_HORDE)).toBe(count);
  });

  it('spreads the horde across the doorway, the same way every run', () => {
    const { doorway } = PROTOCOL33_ESCAPE_HORDE;
    const spots = Array.from({ length: PROTOCOL33_ESCAPE_HORDE.count }, (_, index) => escapeHordeSpot(index, PROTOCOL33_ESCAPE_HORDE, { x: 0, z: 0 }));
    for (const spot of spots) {
      expect(Math.abs(spot.x - doorway.x)).toBeLessThanOrEqual(doorway.spread + 1e-9);
      expect(spot.z).toBe(doorway.z);
    }
    expect(new Set(spots.map((spot) => spot.x.toFixed(3))).size).toBeGreaterThan(PROTOCOL33_ESCAPE_HORDE.count / 2);
    expect(escapeHordeSpot(3, PROTOCOL33_ESCAPE_HORDE, { x: 0, z: 0 })).toEqual(spots[3]);
  });

  it('is a pure function of time', () => {
    const first = { ...at(7.3) };
    at(2);
    expect(at(7.3)).toEqual(first);
  });
});
