import type { CaptainUssrState } from './CaptainUssrBrain';
import { anticipation, smooth } from './CaptainUssrMotion';
import { createPose, POSE, POSE_CHANNELS, type Pose } from './CaptainUssrPose';

/** What the choreography needs to pose the body for one frame. */
export interface ChoreographyInput {
  readonly state: CaptainUssrState;
  /** 0..1 through a timed state (the brain's `stateProgress`). */
  readonly progress: number;
  /** Seconds in the current state, by the view's clock. */
  readonly stateTime: number;
  /** Seconds it has been shown: breathing, idle sway, lolling. */
  readonly time: number;
  readonly phase: 1 | 2 | 3;
  /** How much the march shows (0..1) and its swing (-1..1, positive while the left foot leads). */
  readonly walk: number;
  readonly swing: number;
  /** Dormant on its perch, before a filmed entrance's leap. */
  readonly perched: boolean;
  /** The current recovery follows a bash: its strike plays first. */
  readonly followThrough: boolean;
  /** The current stun follows a crash into a solid. */
  readonly crashed: boolean;
  /** Weight of a roar over whatever it does, 0..1. */
  readonly roar: number;
}

/** Seconds of a bash's strike, from the release until it is back in its guard. */
const STRIKE_SECONDS = 0.4;
/** The death's beats, seconds: the stagger ends, the knees hit, the topple starts and the body hits the ground. */
export const DEATH = { stagger: 0.35, kneel: 0.95, topple: 2.0, down: 2.75 } as const;
/** Scrapes a second of the rear foot while it gathers for a charge. */
export const PAW_RATE = 2.3;
/** Share of a paw cycle spent lifting the foot forward; the rest drags it back along the ground. */
export const PAW_LIFT = 0.4;
/** Share of the leap spent in the air; the rest is the slam and the rise. */
export const LEAP_FLIGHT = 0.8;

/** How fast the body chases its pose: snappy strikes, normal moves. */
const AGILITY = { strike: 2.6, fling: 2.3, leap: 1.8, charge: 1.6, fall: 2.2, stagger: 1.6 } as const;
/** The fighting stance: feet apart, the shield side's foot leading. */
const STANCE = { width: 0.19, lead: 0.17, rear: -0.15 } as const;

const scratch = createPose();

/**
 * Writes into `out` the pose CAPITÁN URSS strikes this frame and returns
 * how fast the body should chase it (1 is its normal pace). Every state
 * builds on the guard: a low stance, shield up before the chest, the free
 * fist cocked, the head locked on its prey. Pure: the state, its timers and
 * the march decide everything.
 */
export function choreograph(input: ChoreographyInput, out: Pose): number {
  guard(out, input);
  let agility = 1;
  switch (input.state) {
    case 'dormant':
      if (input.perched) perch(out);
      break;
    case 'arriving':
      agility = arrive(out, input);
      break;
    case 'bashWindup':
      coilBash(out, input);
      break;
    case 'recovering':
      if (input.followThrough && input.stateTime < STRIKE_SECONDS) agility = strike(out, input);
      break;
    case 'throwWindup':
      cockThrow(out, input);
      break;
    case 'shieldFlight':
      agility = release(out, input);
      break;
    case 'chargeWindup':
      gatherCharge(out, input);
      break;
    case 'charging':
      charge(out, input);
      agility = AGILITY.charge;
      break;
    case 'stunned':
      blendTowards(out, 1 - smooth((input.progress - 0.7) / 0.3), input.crashed ? floored : winded, input);
      break;
    case 'defeated':
      agility = fall(out, input);
      break;
    case 'stalking':
      break;
  }
  if (input.state !== 'defeated' && input.state !== 'arriving') blendTowards(out, input.roar, roar, input);
  return agility;
}

function guard(out: Pose, input: ChoreographyInput): void {
  const { walk, swing, time } = input;
  const fury = input.phase === 3 ? 1 : input.phase === 2 ? 0.5 : 0;
  const still = 1 - walk;
  const breath = Math.sin(time * (1.7 + fury * 0.9));
  const shift = Math.sin(time * 0.6) * still;
  out.fill(0);
  out[POSE.sway] = shift * 0.018;
  out[POSE.drop] = -0.07 - 0.05 * walk - 0.03 * fury;
  out[POSE.pitch] = 0.05 + 0.1 * walk + 0.04 * fury;
  out[POSE.roll] = shift * 0.02 - swing * 0.03;
  out[POSE.twist] = swing * 0.1;
  out[POSE.spinePitch] = 0.06 + 0.04 * fury - breath * 0.025;
  out[POSE.spineYaw] = -0.16 - swing * 0.12;
  lookAhead(out, 0.1);
  out[POSE.jaw] = 0.04 + 0.06 * fury + breath * 0.02;
  // The free fist cocked by the chest, swinging against the stride.
  arm(out, 1, -0.35 - swing * 0.45, -0.18, -1.05 + swing * 0.2);
  // The shield arm, when the shield is not on it (the view reaches it to the grip otherwise).
  arm(out, 0, -0.7, 0.25, -1.2);
  foot(out, 0, STANCE.width, STANCE.lead * still);
  foot(out, 1, -STANCE.width, STANCE.rear * still);
  shield(out, 0.1, 0.3 + breath * 0.01, 0.5, 0.16, -0.06, 0);
  if (fury < 1) return;
  // Red fury: it shakes with rage.
  out[POSE.shoulderRoll[1]] += Math.sin(time * 31) * 0.02;
  out[POSE.shieldX] += Math.sin(time * 27) * 0.006;
}

/** Crouched over the drop on its perch, the free fist braced between its feet, the shield at its side. */
function perch(out: Pose): void {
  out[POSE.drop] = -0.42;
  out[POSE.pitch] = 0.5;
  out[POSE.spinePitch] = 0.12;
  out[POSE.spineYaw] = -0.05;
  lookAhead(out, 0.25);
  arm(out, 1, -0.55, -0.05, -0.25);
  foot(out, 0, 0.16, 0.1);
  foot(out, 1, -0.16, -0.06);
  shield(out, 0.42, -0.1, 0.25, 1.25, 0, 0.1);
}

/** The leap: launched from the crouch, tucked in the air with the fist cocked, then a three-point slam it rises from. */
function arrive(out: Pose, input: ChoreographyInput): number {
  const p = input.progress;
  if (p >= LEAP_FLIGHT) {
    blendTowards(out, 1 - smooth((p - LEAP_FLIGHT) / (1 - LEAP_FLIGHT)), slam, input);
    return p < LEAP_FLIGHT + 0.05 ? AGILITY.strike : 1;
  }
  const flight = p / LEAP_FLIGHT;
  const launch = 1 - smooth(flight / 0.15);
  const tuck = smooth((flight - 0.08) / 0.25) * (1 - smooth((flight - 0.7) / 0.3));
  const raise = smooth(flight / 0.3) * (1 - smooth((flight - 0.72) / 0.28));
  out[POSE.drop] = -0.1 * tuck - 0.3 * launch;
  out[POSE.pitch] = 0.35 * launch - 0.12 * tuck + 0.35 * smooth((flight - 0.75) / 0.25);
  out[POSE.spinePitch] = 0.05;
  out[POSE.spineYaw] = -0.05;
  lookAhead(out, 0.45);
  out[POSE.jaw] = 0.35 * raise;
  arm(out, 1, -0.4 - 2.2 * raise, -0.25, -0.5 - 0.3 * raise);
  foot(out, 0, STANCE.width, 0.18 * tuck, 0.45 * tuck);
  foot(out, 1, -STANCE.width, -0.05 * tuck, 0.35 * tuck);
  shield(out, 0.45, 0.35, 0.2, 0.9, -0.2, 0);
  return AGILITY.leap;
}

/** Landed: the right knee down, the right fist punched into the ground, the shield flung wide, glaring up. */
function slam(out: Pose): void {
  out[POSE.drop] = -0.62;
  out[POSE.pitch] = 0.5;
  out[POSE.spinePitch] = 0.35;
  out[POSE.spineYaw] = -0.05;
  out[POSE.twist] = 0;
  lookAhead(out, 0.35);
  out[POSE.jaw] = 0.3;
  arm(out, 1, -0.55, -0.12, -0.08);
  foot(out, 0, 0.22, 0.42);
  foot(out, 1, -0.2, -0.45, 0, 0.25);
  shield(out, 0.5, 0, 0.35, 1, 0.2, 0);
}

/** The bash's windup: the shield drawn in, the shield shoulder pulled back, weight on the rear leg, the lead foot lifting. */
function coilBash(out: Pose, input: ChoreographyInput): void {
  const coil = anticipation(input.progress);
  out[POSE.spineYaw] = -0.16 + 0.6 * coil;
  out[POSE.twist] = 0.25 * coil;
  out[POSE.drop] -= 0.12 * coil;
  out[POSE.pitch] -= 0.08 * coil;
  out[POSE.sway] = -0.06 * coil;
  out[POSE.lunge] = -0.08 * coil;
  lookAhead(out, 0.12);
  out[POSE.jaw] = 0.15 + 0.15 * coil;
  arm(out, 1, -0.35 + 0.5 * coil, -0.18, -1.3);
  foot(out, 0, STANCE.width, STANCE.lead - 0.05 * coil, 0.07 * smooth((input.progress - 0.55) / 0.45));
  shield(out, 0.1 + 0.16 * coil, 0.32, 0.5 - 0.22 * coil, 0.16 - 0.45 * coil, -0.06, 0);
}

/** The bash itself: a long step, the hips and the shield shoulder driven through, the shield punched forward. */
function strike(out: Pose, input: ChoreographyInput): number {
  const t = input.stateTime;
  blendTowards(out, smooth(t / 0.07) * (1 - smooth((t - 0.18) / (STRIKE_SECONDS - 0.18))), lunge, input);
  return t < 0.18 ? AGILITY.strike : 1.2;
}

function lunge(out: Pose): void {
  out[POSE.lunge] = 0.3;
  out[POSE.sway] = 0.04;
  out[POSE.drop] = -0.2;
  out[POSE.pitch] = 0.28;
  out[POSE.twist] = -0.3;
  out[POSE.spinePitch] = 0.12;
  out[POSE.spineYaw] = -0.6;
  lookAhead(out, 0.15);
  out[POSE.jaw] = 0.3;
  arm(out, 1, 0.35, -0.2, -1.4);
  foot(out, 0, 0.2, 0.58);
  foot(out, 1, -STANCE.width, -0.3, 0.04, 0.5);
  shield(out, 0.02, 0.32, 0.88, 0.45, -0.1, 0);
}

/** The backhand's windup: the shield cocked across the chest to the right shoulder, the body wound up the other way. */
function cockThrow(out: Pose, input: ChoreographyInput): void {
  const coil = anticipation(input.progress);
  const cock = smooth(input.progress / 0.6);
  out[POSE.spineYaw] = -0.16 - 0.75 * coil;
  out[POSE.twist] = -0.25 * coil;
  out[POSE.drop] -= 0.12 * coil;
  out[POSE.pitch] += 0.08 * coil;
  out[POSE.roll] = 0.05 * coil;
  lookAhead(out, 0.1);
  out[POSE.jaw] = 0.2 * coil;
  arm(out, 1, -0.2, -0.18 - 0.55 * coil, -0.6);
  foot(out, 0, 0.22, STANCE.lead - 0.05);
  foot(out, 1, -0.22, STANCE.rear);
  shield(out, lerp(0.1, -0.22, cock), lerp(0.3, 0.42, cock), lerp(0.5, 0.26, cock), lerp(0.16, -1.25, cock), -0.06, 0.25 * cock);
}

/** The release: unwound, the arm flung out to the left off a step; then open, waiting for the shield to come back. */
function release(out: Pose, input: ChoreographyInput): number {
  blendTowards(out, 1, waitForShield, input);
  const t = input.stateTime;
  blendTowards(out, smooth(t / 0.08) * (1 - smooth((t - 0.45) / 0.4)), fling, input);
  return t < 0.15 ? AGILITY.fling : 1;
}

function fling(out: Pose): void {
  out[POSE.spineYaw] = 0.5;
  out[POSE.twist] = 0.25;
  out[POSE.lunge] = 0.12;
  out[POSE.pitch] = 0.14;
  out[POSE.drop] = -0.12;
  lookAhead(out, 0.1);
  out[POSE.jaw] = 0.35;
  arm(out, 0, -1.25, 1.25, -0.12);
  arm(out, 1, -0.7, 0.1, -1.6);
  foot(out, 0, 0.22, 0.38);
  foot(out, 1, -STANCE.width, -0.22);
}

function waitForShield(out: Pose): void {
  out[POSE.drop] = -0.12;
  out[POSE.pitch] = 0.1;
  arm(out, 0, -1.1, 0.45, -0.35);
}

/** Gathering for the charge: low behind the shield, the rear foot scraping the ground like a bull's. */
function gatherCharge(out: Pose, input: ChoreographyInput): void {
  const lower = smooth(input.progress / 0.35);
  out[POSE.drop] -= 0.17 * lower;
  out[POSE.pitch] += 0.32 * lower;
  out[POSE.spinePitch] += 0.12 * lower;
  out[POSE.spineYaw] = -0.16 - 0.2 * lower;
  lookAhead(out, 0.15);
  out[POSE.jaw] = 0.2 * lower;
  arm(out, 1, -0.9, 0.25, -1.3);
  shield(out, 0.06, 0.2, 0.62, 0.25, -0.25, 0);
  foot(out, 0, STANCE.width, 0.2);
  // The paw: lifted forward, then dragged back along the ground.
  const paw = smooth(input.progress / 0.2) * (1 - smooth((input.progress - 0.85) / 0.15));
  const cycle = (input.stateTime * PAW_RATE) % 1;
  const forward = cycle < PAW_LIFT ? smooth(cycle / PAW_LIFT) : 1 - smooth((cycle - PAW_LIFT) / (1 - PAW_LIFT));
  const lift = cycle < PAW_LIFT ? 0.07 * Math.sin((Math.PI * cycle) / PAW_LIFT) : 0;
  foot(out, 1, -STANCE.width, lerp(STANCE.rear, -0.34 + 0.3 * forward, paw), lift * paw, cycle < PAW_LIFT ? 0 : 0.3 * paw);
}

/** Head down behind the shield, the shield shoulder leading, the free arm pumping. */
function charge(out: Pose, input: ChoreographyInput): void {
  out[POSE.drop] = -0.15;
  out[POSE.pitch] = 0.42;
  out[POSE.spinePitch] = 0.2;
  out[POSE.spineYaw] = -0.3;
  out[POSE.twist] = -0.1;
  lookAhead(out, 0.2);
  out[POSE.jaw] = 0.3;
  arm(out, 1, -0.5 - input.swing * 0.9, -0.2, -1.4);
  foot(out, 0, STANCE.width, 0);
  foot(out, 1, -STANCE.width, 0);
  shield(out, 0, 0.25, 0.66, 0.35, -0.2, 0);
}

/** Crashed: dropped onto one knee, the shield sagging to the ground, the head lolling. */
function floored(out: Pose, input: ChoreographyInput): void {
  const t = input.time;
  out[POSE.drop] = -0.48;
  out[POSE.pitch] = 0.22;
  out[POSE.roll] = 0.04;
  out[POSE.spinePitch] = 0.12 + Math.sin(t * 1.3) * 0.04;
  out[POSE.spineRoll] = Math.sin(t * 1.1) * 0.06;
  out[POSE.spineYaw] = -0.1;
  out[POSE.twist] = 0;
  out[POSE.headPitch] = 0.35 + Math.sin(t * 2.9) * 0.15;
  out[POSE.headYaw] = Math.sin(t * 1.7) * 0.35;
  out[POSE.jaw] = 0.2 + Math.sin(t * 2.3) * 0.1;
  arm(out, 1, -0.65, 0.05, -1.2);
  foot(out, 0, STANCE.width, 0.32);
  foot(out, 1, -STANCE.width, -0.42, 0, 0.3);
  shield(out, 0.42, -0.36, 0.28, 1.1, 0.1, 0.15);
}

/** Its charge spent: hunched over, panting, the shield lowered. */
function winded(out: Pose, input: ChoreographyInput): void {
  const pant = Math.sin(input.time * 7);
  out[POSE.drop] = -0.2;
  out[POSE.pitch] = 0.48;
  out[POSE.spinePitch] = 0.08 + pant * 0.04;
  out[POSE.spineYaw] = -0.1;
  out[POSE.twist] = 0;
  lookAhead(out, 0.25);
  out[POSE.jaw] = 0.25 + pant * 0.1;
  arm(out, 1, -0.55, -0.05, -0.25);
  foot(out, 0, 0.22, 0.12);
  foot(out, 1, -0.22, -0.1);
  shield(out, 0.22, -0.02, 0.42, 0.4, 0.45, 0);
}

/** Struck down: staggered back, its knees give way, it sways kneeling, then topples face down like a felled tree. */
function fall(out: Pose, input: ChoreographyInput): number {
  const t = input.stateTime;
  const kneel = Math.min(1, Math.max(0, (t - DEATH.stagger) / (DEATH.kneel - DEATH.stagger))) ** 2;
  const topple = Math.min(1, Math.max(0, (t - DEATH.topple) / (DEATH.down - DEATH.topple))) ** 2;
  blendTowards(out, smooth(t / 0.12) * (1 - smooth((t - DEATH.stagger) / 0.3)), stagger, input);
  blendTowards(out, kneel, kneeling, input);
  blendTowards(out, topple, faceDown, input);
  if (t < DEATH.kneel) return AGILITY.stagger;
  return t < DEATH.down + 0.3 ? AGILITY.fall : 1;
}

function stagger(out: Pose): void {
  out[POSE.lunge] = -0.18;
  out[POSE.drop] = -0.05;
  out[POSE.pitch] = -0.22;
  out[POSE.spinePitch] = -0.18;
  out[POSE.headPitch] = -0.55;
  out[POSE.jaw] = 0.35;
  arm(out, 0, -0.5, 0.6, -0.3);
  arm(out, 1, -0.7, -0.85, -0.4);
  foot(out, 1, -STANCE.width, -0.36);
}

function kneeling(out: Pose, input: ChoreographyInput): void {
  out[POSE.lunge] = 0;
  out[POSE.sway] = 0;
  out[POSE.drop] = -0.64;
  out[POSE.pitch] = 0.08;
  out[POSE.roll] = 0;
  out[POSE.twist] = 0;
  out[POSE.spinePitch] = 0.22;
  out[POSE.spineYaw] = 0;
  out[POSE.spineRoll] = Math.sin(input.stateTime * 1.4) * 0.03;
  out[POSE.headPitch] = 0.65;
  out[POSE.headYaw] = 0.1;
  out[POSE.jaw] = 0.3;
  arm(out, 0, 0.05, 0.12, -0.15);
  arm(out, 1, 0.05, -0.12, -0.15);
  foot(out, 0, 0.2, -0.4, 0, 0.9);
  foot(out, 1, -0.2, -0.4, 0, 0.9);
}

function faceDown(out: Pose): void {
  out[POSE.drop] = -0.87;
  out[POSE.pitch] = 1.42;
  out[POSE.spinePitch] = 0.1;
  out[POSE.spineYaw] = 0.05;
  out[POSE.spineRoll] = 0;
  out[POSE.headPitch] = -0.35;
  out[POSE.headYaw] = 1.1;
  out[POSE.jaw] = 0.35;
  arm(out, 0, 0.15, 0.45, -0.25);
  arm(out, 1, 0.15, -0.45, -0.25);
  foot(out, 0, 0.24, -0.98, 0, 1.4);
  foot(out, 1, -0.24, -0.98, 0, 1.4);
}

/** The roar: chest out, head thrown back, jaw wide, the free arm flung up and the shield out wide. */
function roar(out: Pose, input: ChoreographyInput): void {
  const fury = input.phase === 3 ? 1 : 0;
  out[POSE.drop] = -0.12;
  out[POSE.pitch] = -0.03;
  out[POSE.twist] = 0;
  out[POSE.spinePitch] = -0.22;
  out[POSE.spineYaw] = 0;
  out[POSE.headPitch] = -0.75;
  out[POSE.headYaw] = 0;
  out[POSE.jaw] = 0.55 + 0.1 * fury;
  arm(out, 1, -0.8 - 0.3 * fury, -1.35, -0.55);
  out[POSE.footX[0]] = 0.27;
  out[POSE.footX[1]] = -0.27;
  shield(out, 0.52, 0.42, 0.22, 1.05, 0, 0.2);
}

/** The head cancels the body's lean and turn to keep its eyes on its prey, `chin` radians down. */
function lookAhead(out: Pose, chin: number): void {
  out[POSE.headPitch] = chin - out[POSE.pitch] - out[POSE.spinePitch];
  out[POSE.headYaw] = -out[POSE.spineYaw] - out[POSE.twist];
}

function arm(out: Pose, side: number, pitch: number, roll: number, elbow: number): void {
  out[POSE.shoulderPitch[side]] = pitch;
  out[POSE.shoulderRoll[side]] = roll;
  out[POSE.elbow[side]] = elbow;
}

function foot(out: Pose, side: number, x: number, z: number, lift = 0, pitch = 0): void {
  out[POSE.footX[side]] = x;
  out[POSE.footZ[side]] = z;
  out[POSE.footY[side]] = lift;
  out[POSE.footPitch[side]] = pitch;
}

function shield(out: Pose, x: number, y: number, z: number, yaw: number, pitch: number, roll: number): void {
  out[POSE.shieldX] = x;
  out[POSE.shieldY] = y;
  out[POSE.shieldZ] = z;
  out[POSE.shieldYaw] = yaw;
  out[POSE.shieldPitch] = pitch;
  out[POSE.shieldRoll] = roll;
}

/** Blends `out` towards `out` reshaped by `shape`, by `weight` (0..1). */
function blendTowards(out: Pose, weight: number, shape: (pose: Pose, input: ChoreographyInput) => void, input: ChoreographyInput): void {
  if (weight <= 0) return;
  scratch.set(out);
  shape(scratch, input);
  if (weight >= 1) {
    out.set(scratch);
    return;
  }
  for (let channel = 0; channel < POSE_CHANNELS; channel++) out[channel] += (scratch[channel] - out[channel]) * weight;
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}
