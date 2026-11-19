import { describe, expect, it } from 'vitest';
import { EVACUATION_ENDING_TIMELINE as BEAT } from '../src/zombies/evacuation/EvacuationEndingTimeline';
import { PROTOCOL33_DEPARTURE } from '../src/zombies/maps/Station33Config';
import { createEscapeDrivePose, escapeDrivePose } from '../src/zombies/maps/station33/EscapeDrive';
import { lightPoolIntensity } from '../src/zombies/maps/station33/EscapeTruckLamps';
import { createTruckBodySway, truckBodySway, type TruckMotionInput } from '../src/zombies/maps/station33/EscapeTruckMotion';
import { trailParticleAge } from '../src/zombies/maps/station33/EscapeTruckTrail';

const pose = createEscapeDrivePose();
const swayAt = (time: number, lag = 0): ReturnType<typeof createTruckBodySway> =>
  truckBodySway(escapeDrivePose(time, PROTOCOL33_DEPARTURE, pose), createTruckBodySway(), lag);
const largest = (from: number, to: number, read: (sway: ReturnType<typeof createTruckBodySway>) => number): number => {
  let peak = 0;
  for (let time = from; time < to; time += 0.01) peak = Math.max(peak, Math.abs(read(swayAt(time))));
  return peak;
};

describe('Station 33 truck body motion', () => {
  it('sits dead still with the engine off and the truck parked', () => {
    const parked: TruckMotionInput = { time: 0.4, distance: 0, speed: 0, engine: 0, cranking: 0 };
    expect(truckBodySway(parked, createTruckBodySway())).toEqual({ heave: 0, pitch: 0, roll: 0 });
    expect(Math.abs(swayAt(0).heave)).toBe(0);
  });

  it('shudders on the starter, shivers at idle and rocks harder on the road', () => {
    const cranking = largest(BEAT.ignition, BEAT.engineCatch, (sway) => sway.heave);
    const idle = largest(BEAT.engineCatch + 0.5, BEAT.launch, (sway) => sway.heave);
    const road = largest(BEAT.gateImpact + 1, BEAT.gateImpact + 4, (sway) => sway.heave);
    expect(cranking).toBeGreaterThan(idle);
    expect(idle).toBeGreaterThan(0);
    expect(road).toBeGreaterThan(cranking);
    expect(largest(BEAT.engineCatch + 0.5, BEAT.launch, (sway) => sway.pitch)).toBe(0);
    expect(largest(BEAT.gateImpact + 1, BEAT.gateImpact + 4, (sway) => sway.pitch)).toBeGreaterThan(0);
  });

  it('stays within a few centimetres and a degree, the same way every run', () => {
    expect(largest(0, 30, (sway) => sway.heave)).toBeLessThan(0.05);
    expect(largest(0, 30, (sway) => sway.pitch)).toBeLessThan(0.02);
    expect(largest(0, 30, (sway) => sway.roll)).toBeLessThan(0.02);
    expect(swayAt(7.3)).toEqual(swayAt(7.3));
  });

  it('samples the past when lagged, for things that follow the body late', () => {
    const now = { ...escapeDrivePose(7.3, PROTOCOL33_DEPARTURE, pose) };
    const late = truckBodySway(now, createTruckBodySway(), 0.2);
    const shifted = truckBodySway({ ...now, time: now.time - 0.2, distance: now.distance - now.speed * 0.2 }, createTruckBodySway());
    expect(late.heave).toBeCloseTo(shifted.heave, 12);
    expect(late.roll).toBeCloseTo(shifted.roll, 12);
    expect(late).not.toEqual(swayAt(7.3));
  });
});

describe('Station 33 truck wake', () => {
  it('lets one particle go every life / count seconds, each cycling through its whole life', () => {
    expect(trailParticleAge(0, 4, 1, 0)).toBe(0);
    expect(trailParticleAge(1, 4, 1, 0)).toBeCloseTo(0.25, 9);
    expect(trailParticleAge(0, 4, 1, 1.1)).toBeCloseTo(0.1, 9);
    for (let time = 0; time < 5; time += 0.13) {
      for (let index = 0; index < 4; index++) {
        const age = trailParticleAge(index, 4, 1, time);
        expect(age).toBeGreaterThanOrEqual(0);
        expect(age).toBeLessThan(1);
      }
    }
  });
});

describe('Station 33 truck headlight pool', () => {
  it('is dark under the bumper, brightest a few metres ahead and gone at its edges', () => {
    expect(lightPoolIntensity(0, 0)).toBe(0);
    expect(lightPoolIntensity(0, 0.25)).toBeGreaterThan(0.9);
    expect(lightPoolIntensity(0, 1)).toBe(0);
    expect(lightPoolIntensity(1, 0.5)).toBe(0);
    expect(lightPoolIntensity(0.4, 0.15)).toBeLessThan(lightPoolIntensity(0.4, 0.6));
  });
});
