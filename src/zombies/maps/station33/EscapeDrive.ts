import { EVACUATION_ENDING_TIMELINE as BEAT } from '../../evacuation/EvacuationEndingTimeline';

/** The departure's tuning (`PROTOCOL33_DEPARTURE`). */
export interface EscapeDriveConfig {
  /** Metres from the bumper to the shut gate; the truck covers them between `launch` and `gateImpact`. */
  readonly gateGap: number;
  /** Cruising speed down the road, m/s. */
  readonly topSpeed: number;
  /** Where the truck stops, deep in the fog, metres from its parking spot. */
  readonly maxDistance: number;
  /** Radians each gate leaf rests at once rammed open. */
  readonly gateSwing: number;
}

/** Everything the departure shows at one instant. */
export interface EscapeDrivePose {
  /** Metres driven north from the parking spot. */
  distance: number;
  /** Rear doors: 0 open as parked, 1 shut. */
  doorsShut: number;
  /** Headlights and tail lights: 0 dark, 1 full. */
  headlights: number;
  /** Radians each gate leaf has swung out of the yard. */
  gateSwing: number;
  /** Radians the body rocks on its springs after the impact (+ lifts the nose). */
  jolt: number;
}

const DOORS_SHUT_SECONDS = 0.7;
/** The lamps sputter (on/off/on) before they hold. */
const HEADLIGHT_FLICKER = [0.08, 0.16, 0.3, 0.4] as const;
/** Spring of each gate leaf on its hinge after the impact: overshoot, then settle. */
const GATE_SPRING = { damping: 4.5, frequency: 8.5 } as const;
/** The body's rock after the impact. */
const JOLT = { amplitude: 0.045, damping: 5, frequency: 15 } as const;

/** The horde that pours out of the stairhead behind the truck (`PROTOCOL33_ESCAPE_HORDE`). */
export interface EscapeHordeConfig {
  /** Seconds after boarding when the first zombie bursts out. */
  readonly from: number;
  /** Seconds between two zombies. */
  readonly interval: number;
  readonly count: number;
  /** Where they come out: the doorway's middle on the yard side, and how far either side of it. */
  readonly doorway: { readonly x: number; readonly z: number; readonly spread: number };
}

/** Golden-ratio steps scatter consecutive zombies across the doorway without repeating a pattern. */
const GOLDEN_STEP = 0.618034;

/** How many zombies should have come out `time` seconds after boarding. */
export function escapeHordeDue(time: number, config: EscapeHordeConfig): number {
  if (time < config.from) return 0;
  return Math.min(config.count, Math.floor((time - config.from) / config.interval) + 1);
}

/** Where the `index`-th zombie of the horde comes out, written into `out`. */
export function escapeHordeSpot(index: number, config: EscapeHordeConfig, out: { x: number; z: number }): { x: number; z: number } {
  const across = ((index * GOLDEN_STEP) % 1) * 2 - 1;
  out.x = config.doorway.x + config.doorway.spread * across;
  out.z = config.doorway.z;
  return out;
}

export function createEscapeDrivePose(): EscapeDrivePose {
  return { distance: 0, doorsShut: 0, headlights: 0, gateSwing: 0, jolt: 0 };
}

/**
 * Pose of the departure `time` seconds after boarding, written into `out`
 * (no allocation): the doors shut, the lamps sputter on, and the truck pulls
 * away with the constant pull that puts its bumper on the gate exactly at
 * `gateImpact`, up to its top speed and down the road until `maxDistance`.
 */
export function escapeDrivePose(time: number, config: EscapeDriveConfig, out: EscapeDrivePose): EscapeDrivePose {
  out.doorsShut = smoothstep((time - BEAT.doorsShut) / DOORS_SHUT_SECONDS);
  out.headlights = headlightLevel(time - BEAT.headlights);
  out.distance = driven(time - BEAT.launch, config);
  const sinceImpact = time - BEAT.gateImpact;
  if (sinceImpact <= 0) {
    out.gateSwing = 0;
    out.jolt = 0;
    return out;
  }
  const spring = Math.exp(-GATE_SPRING.damping * sinceImpact) * Math.cos(GATE_SPRING.frequency * sinceImpact);
  out.gateSwing = config.gateSwing * (1 - spring);
  out.jolt = JOLT.amplitude * Math.exp(-JOLT.damping * sinceImpact) * Math.sin(JOLT.frequency * sinceImpact);
  return out;
}

function driven(sinceLaunch: number, config: EscapeDriveConfig): number {
  if (sinceLaunch <= 0) return 0;
  const pullTime = BEAT.gateImpact - BEAT.launch;
  const acceleration = (2 * config.gateGap) / (pullTime * pullTime);
  const cruiseAfter = config.topSpeed / acceleration;
  const distance = sinceLaunch < cruiseAfter
    ? 0.5 * acceleration * sinceLaunch * sinceLaunch
    : 0.5 * acceleration * cruiseAfter * cruiseAfter + config.topSpeed * (sinceLaunch - cruiseAfter);
  return Math.min(distance, config.maxDistance);
}

function headlightLevel(sinceOn: number): number {
  if (sinceOn < 0) return 0;
  const [on, off, again, hold] = HEADLIGHT_FLICKER;
  if (sinceOn < on) return 0.7;
  if (sinceOn < off) return 0.1;
  if (sinceOn < again) return 0.85;
  if (sinceOn < hold) return 0.25;
  return 1;
}

function smoothstep(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}
