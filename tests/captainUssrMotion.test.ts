import { describe, expect, it } from 'vitest';
import { anticipation, ROAR_SECONDS, roarWeight } from '../src/zombies/guardians/CaptainUssrMotion';
import { CAPTAIN_USSR_SPRINGS, createPose, POSE, POSE_CHANNELS, PoseSpring } from '../src/zombies/guardians/CaptainUssrPose';

const DT = 1 / 60;

/** Steps `spring` towards `target` for `seconds`, returning the channel's value every frame. */
function track(spring: PoseSpring, target: Float64Array, channel: number, seconds: number, agility = 1): number[] {
  return Array.from({ length: Math.round(seconds / DT) }, () => {
    spring.update(target, DT, agility);
    return spring.value[channel];
  });
}

describe('Captain USSR motion', () => {
  it('coils slowly and then snaps: anticipation runs 0 to 1, ever faster towards the release', () => {
    expect(anticipation(0)).toBe(0);
    expect(anticipation(1)).toBe(1);
    expect(anticipation(-1)).toBe(0);
    expect(anticipation(2)).toBe(1);
    let previous = 0;
    for (let step = 1; step <= 10; step++) {
      const value = anticipation(step / 10);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
    expect(anticipation(0.5)).toBeLessThan(0.5);
  });

  it('roars in, holds and lets go within its time', () => {
    expect(roarWeight(0)).toBe(0);
    expect(roarWeight(ROAR_SECONDS)).toBe(0);
    expect(roarWeight(ROAR_SECONDS * 2)).toBe(0);
    expect(roarWeight(ROAR_SECONDS * 0.5)).toBeCloseTo(1, 6);
  });
});

describe('Captain USSR pose spring', () => {
  it('tunes every channel of the pose', () => {
    expect(CAPTAIN_USSR_SPRINGS).toHaveLength(POSE_CHANNELS);
    for (const tuning of CAPTAIN_USSR_SPRINGS) {
      expect(tuning.stiffness).toBeGreaterThan(0);
      expect(tuning.damping).toBeGreaterThan(0);
    }
  });

  it('carries its weight into a new pose: a slight overshoot, then it settles exactly', () => {
    const spring = new PoseSpring(CAPTAIN_USSR_SPRINGS);
    const target = createPose();
    target[POSE.spinePitch] = 0.5;
    const values = track(spring, target, POSE.spinePitch, 2);
    const peak = Math.max(...values);
    expect(peak).toBeGreaterThan(0.5);
    expect(peak).toBeLessThan(0.5 * 1.25);
    expect(values.at(-1)).toBeCloseTo(0.5, 4);
  });

  it('arrives sooner when it strikes than when it settles', () => {
    const relaxed = new PoseSpring(CAPTAIN_USSR_SPRINGS);
    const striking = new PoseSpring(CAPTAIN_USSR_SPRINGS);
    const target = createPose();
    target[POSE.shieldZ] = 0.4;
    const reach = (values: number[]): number => values.findIndex((value) => value >= 0.36);
    expect(reach(track(striking, target, POSE.shieldZ, 1, 2.4))).toBeLessThan(reach(track(relaxed, target, POSE.shieldZ, 1)));
  });

  it('jolts on a hit and settles back, a heavier hit further', () => {
    const rest = createPose();
    const light = new PoseSpring(CAPTAIN_USSR_SPRINGS);
    const heavy = new PoseSpring(CAPTAIN_USSR_SPRINGS);
    light.kick(POSE.spinePitch, -1);
    heavy.kick(POSE.spinePitch, -3);
    const peak = (spring: PoseSpring): number => Math.max(...track(spring, rest, POSE.spinePitch, 0.3).map(Math.abs));
    expect(peak(heavy)).toBeGreaterThan(peak(light));
    expect(Math.abs(track(heavy, rest, POSE.spinePitch, 2).at(-1)!)).toBeLessThan(1e-3);
  });

  it('keeps writhing under a stream of hits without piling them up', () => {
    const rest = createPose();
    const single = new PoseSpring(CAPTAIN_USSR_SPRINGS);
    single.kick(POSE.spineYaw, 2);
    const singlePeak = Math.max(...track(single, rest, POSE.spineYaw, 0.5).map(Math.abs));
    const stream = new PoseSpring(CAPTAIN_USSR_SPRINGS);
    let streamPeak = 0;
    for (let tick = 0; tick < 60; tick++) {
      stream.kick(POSE.spineYaw, 2);
      stream.update(rest, DT);
      streamPeak = Math.max(streamPeak, Math.abs(stream.value[POSE.spineYaw]));
    }
    // Held at the swing of one undamped jolt, never wider.
    const undamped = 2 / Math.sqrt(CAPTAIN_USSR_SPRINGS[POSE.spineYaw].stiffness);
    expect(streamPeak).toBeGreaterThan(singlePeak);
    expect(streamPeak).toBeLessThanOrEqual(undamped + 1e-9);
  });

  it('stays calm through a frame hitch', () => {
    const spring = new PoseSpring(CAPTAIN_USSR_SPRINGS);
    const target = createPose();
    target.fill(1);
    spring.update(target, 2);
    for (const value of spring.value) {
      expect(Number.isFinite(value)).toBe(true);
      expect(Math.abs(value)).toBeLessThan(2);
    }
  });

  it('snaps to a pose and resets to rest', () => {
    const spring = new PoseSpring(CAPTAIN_USSR_SPRINGS);
    const target = createPose();
    target[POSE.drop] = -0.4;
    spring.snap(target);
    expect(spring.value[POSE.drop]).toBe(-0.4);
    spring.update(target, DT);
    expect(spring.value[POSE.drop]).toBe(-0.4);
    spring.reset();
    expect([...spring.value].every((value) => value === 0)).toBe(true);
  });
});
