/** How the truck's sprung body sits on its wheels at one instant. */
export interface TruckBodySway {
  /** Metres up from rest. */
  heave: number;
  /** Radians, + lifts the nose. */
  pitch: number;
  /** Radians, + dips the east flank. */
  roll: number;
}

/** What drives the body's motion at one instant (a subset of `EscapeDrivePose`). */
export interface TruckMotionInput {
  readonly time: number;
  readonly distance: number;
  readonly speed: number;
  readonly engine: number;
  readonly cranking: number;
}

/** The idling diesel's shiver, in metres / radians and rad/s. */
const IDLE = { heave: 0.0035, roll: 0.0016, rate: 2 * Math.PI * 21 } as const;
/** The starter's slow shudder while it cranks. */
const STARTER = { heave: 0.011, roll: 0.006, rate: 2 * Math.PI * 7.5 } as const;
/** Road bumps, laid along the road (so they follow the distance driven) and full at `fullSpeed` m/s. */
const ROAD = { heave: 0.028, pitch: 0.011, roll: 0.013, fullSpeed: 12 } as const;

export function createTruckBodySway(): TruckBodySway {
  return { heave: 0, pitch: 0, roll: 0 };
}

/**
 * The body's sway at `input` into `out` (no allocation): the starter's
 * shudder, the idling engine's fine shiver and, once moving, bumps of the
 * road that grow with speed. Deterministic, and exactly still with the
 * engine off and the truck parked. `lag` seconds samples it that much
 * earlier, for loose things that follow the body late.
 */
export function truckBodySway(input: TruckMotionInput, out: TruckBodySway, lag = 0): TruckBodySway {
  const time = input.time - lag;
  const distance = input.distance - input.speed * lag;
  const idle = input.engine * Math.sin(time * IDLE.rate);
  const starter = input.cranking * Math.sin(time * STARTER.rate);
  const road = Math.min(1, Math.max(0, input.speed / ROAD.fullSpeed));
  out.heave = IDLE.heave * idle + STARTER.heave * starter + ROAD.heave * road * roadBump(distance, 1.7, 4.3, 0.9);
  out.pitch = ROAD.pitch * road * roadBump(distance, 1.1, 2.9, 0.4);
  out.roll = IDLE.roll * idle * 0.7 + STARTER.roll * starter + ROAD.roll * road * roadBump(distance, 0.83, 3.7, 2.1);
  return out;
}

/** Two incommensurate undulations along the road, normalised to [-1, 1]. */
function roadBump(distance: number, wave: number, ripple: number, phase: number): number {
  return (Math.sin(distance * wave + phase) + 0.5 * Math.sin(distance * ripple + phase * 2)) / 1.5;
}
