import { describe, expect, it } from 'vitest';
import type { CaptainUssrState } from '../src/zombies/guardians/CaptainUssrBrain';
import { choreograph, type ChoreographyInput } from '../src/zombies/guardians/CaptainUssrChoreography';
import { CAPTAIN_USSR_BODY as B, createPose, POSE, type Pose } from '../src/zombies/guardians/CaptainUssrPose';

const GUARD: ChoreographyInput = {
  state: 'stalking', progress: 0, stateTime: 0, time: 0, phase: 1, walk: 0, swing: 0,
  perched: false, followThrough: false, crashed: false, roar: 0,
};

function pose(input: Partial<ChoreographyInput> = {}): Pose {
  const out = createPose();
  choreograph({ ...GUARD, ...input }, out);
  return out;
}

const STATES: readonly CaptainUssrState[] = [
  'dormant', 'arriving', 'stalking', 'bashWindup', 'throwWindup', 'shieldFlight',
  'chargeWindup', 'charging', 'stunned', 'recovering', 'defeated',
];

describe('Captain USSR choreography', () => {
  it('keeps both feet on or over the ground and within reach of the hips in every pose', () => {
    const reach = B.thigh + B.shin + 0.04;
    for (const state of STATES) {
      for (const progress of [0, 0.25, 0.5, 0.79, 0.81, 0.9, 1]) {
        for (const stateTime of [0, 0.1, 0.3, 0.6, 1.2, 2, 2.4, 3, 6]) {
          for (const variant of [{}, { perched: true }, { followThrough: true }, { crashed: true }, { walk: 1, swing: 1 }, { roar: 1, phase: 3 as const }]) {
            const out = pose({ state, progress, stateTime, time: stateTime * 1.7, ...variant });
            for (let side = 0; side < 2; side++) {
              const hipX = (side === 0 ? 1 : -1) * B.hipX + out[POSE.sway];
              const dx = out[POSE.footX[side]] - hipX;
              const dy = B.ankle + out[POSE.footY[side]] - (B.hips + out[POSE.drop]);
              const dz = out[POSE.footZ[side]] - out[POSE.lunge];
              expect(out[POSE.footY[side]]).toBeGreaterThanOrEqual(0);
              expect(Math.hypot(dx, dy, dz), `${state} ${progress} ${stateTime} ${JSON.stringify(variant)}`).toBeLessThanOrEqual(reach);
            }
          }
        }
      }
    }
  });

  it('guards its chest behind the raised shield while it stalks', () => {
    const guard = pose();
    expect(guard[POSE.shieldZ]).toBeGreaterThan(0.35);
    expect(guard[POSE.shieldY]).toBeGreaterThan(0.15);
    expect(guard[POSE.shieldY]).toBeLessThan(0.55);
  });

  it('coils behind the shield before a bash, then drives it through off a long step', () => {
    const guard = pose();
    const coiled = pose({ state: 'bashWindup', progress: 1 });
    const strike = createPose();
    const agility = choreograph({ ...GUARD, state: 'recovering', followThrough: true, stateTime: 0.1 }, strike);
    expect(coiled[POSE.shieldZ]).toBeLessThan(guard[POSE.shieldZ]);
    expect(strike[POSE.shieldZ]).toBeGreaterThan(guard[POSE.shieldZ] + 0.2);
    expect(strike[POSE.lunge]).toBeGreaterThan(0.2);
    expect(strike[POSE.footZ[0]]).toBeGreaterThan(guard[POSE.footZ[0]] + 0.2);
    expect(agility).toBeGreaterThan(1.5);
    // Its strike spent, it falls back into the guard.
    expect(pose({ state: 'recovering', followThrough: true, stateTime: 0.6 })[POSE.shieldZ]).toBeCloseTo(guard[POSE.shieldZ], 1);
  });

  it('cocks the shield across its chest for the backhand and flings the arm out on the release', () => {
    const guard = pose();
    const cocked = pose({ state: 'throwWindup', progress: 1 });
    const released = pose({ state: 'shieldFlight', stateTime: 0.1 });
    expect(cocked[POSE.shieldX]).toBeLessThan(0);
    expect(cocked[POSE.spineYaw]).toBeLessThan(guard[POSE.spineYaw]);
    expect(released[POSE.shoulderRoll[0]]).toBeGreaterThan(0.8);
    expect(released[POSE.spineYaw]).toBeGreaterThan(guard[POSE.spineYaw]);
  });

  it('lowers its head behind the shield and leans into a charge', () => {
    const march = pose({ walk: 1 });
    const charge = pose({ state: 'charging', walk: 1 });
    expect(charge[POSE.pitch] + charge[POSE.spinePitch]).toBeGreaterThan(march[POSE.pitch] + march[POSE.spinePitch] + 0.3);
    const windup = pose({ state: 'chargeWindup', progress: 0.5, stateTime: 0.5 });
    expect(windup[POSE.drop]).toBeLessThan(-0.15);
  });

  it('is floored by a crash, only winded by a charge that ran out', () => {
    const crashed = pose({ state: 'stunned', crashed: true, progress: 0.4, stateTime: 1 });
    const winded = pose({ state: 'stunned', progress: 0.4, stateTime: 0.5 });
    expect(crashed[POSE.drop]).toBeLessThan(winded[POSE.drop] - 0.15);
    // The shield sags away from its chest: it is open.
    expect(crashed[POSE.shieldZ]).toBeLessThan(pose()[POSE.shieldZ]);
  });

  it('falls to its knees before toppling face down, and stays down', () => {
    const kneeling = pose({ state: 'defeated', stateTime: 1.3 });
    expect(kneeling[POSE.drop]).toBeLessThan(-0.5);
    expect(kneeling[POSE.pitch]).toBeLessThan(0.6);
    const down = pose({ state: 'defeated', stateTime: 3.2 });
    expect(down[POSE.pitch]).toBeGreaterThan(1.2);
    expect(down[POSE.drop]).toBeLessThan(-0.75);
    expect([...pose({ state: 'defeated', stateTime: 12 })]).toEqual([...down]);
  });

  it('throws its head back, opens its jaw and its chest to roar', () => {
    const guard = pose();
    const roaring = pose({ roar: 1 });
    expect(roaring[POSE.headPitch]).toBeLessThan(guard[POSE.headPitch] - 0.3);
    expect(roaring[POSE.jaw]).toBeGreaterThan(guard[POSE.jaw] + 0.2);
    expect(roaring[POSE.shieldX]).toBeGreaterThan(guard[POSE.shieldX] + 0.25);
  });

  it('crouches on its perch and lands a three-point slam from the leap', () => {
    const perched = pose({ state: 'dormant', perched: true });
    expect(perched[POSE.drop]).toBeLessThan(-0.3);
    const flying = pose({ state: 'arriving', progress: 0.4 });
    expect(flying[POSE.footY[0]]).toBeGreaterThan(0.2);
    const landed = pose({ state: 'arriving', progress: 0.82 });
    expect(landed[POSE.drop]).toBeLessThan(-0.5);
    expect(landed[POSE.footY[0]]).toBe(0);
    expect(landed[POSE.footY[1]]).toBe(0);
  });
});
