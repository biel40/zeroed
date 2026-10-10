import * as THREE from 'three';

/**
 * Listener-relative placement for one-shot cues routed through
 * AudioSystem's stereo bus. `muffle` (0..1) darkens sources behind the
 * player or on another floor: stereo panning alone cannot tell front from
 * back, and a low-passed cue reads as "behind/through a wall" instantly.
 */
export interface SpatialCue {
  readonly pan: number;
  readonly attenuation: number;
  readonly muffle: number;
}

interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Full-volume radius before the gentle 1/d falloff, meters. */
const NEAR_DISTANCE = 2;
const FALLOFF = 0.12;
/** Distant cues stay faintly audible: knowing where a threat is matters more than realism. */
const MIN_ATTENUATION = 0.18;
/** Muffle for a source directly behind the listener. */
const REAR_MUFFLE = 0.6;
/** Vertical offset, meters, where a source starts reading as another floor. */
const FLOOR_MUFFLE_START = 1.4;
const FLOOR_MUFFLE_RANGE = 1.6;
const FLOOR_MUFFLE = 0.85;
/** Low-pass cutoff range for muffle 0 (open) and 1 (fully muffled), Hz. */
const OPEN_CUTOFF = 20000;
const MUFFLED_CUTOFF = 750;

/** Pure: listener position and forward vector against a source point. */
export function spatialCue(listener: Point3, forward: Point3, source: Point3): SpatialCue {
  const dx = source.x - listener.x;
  const dy = source.y - listener.y;
  const dz = source.z - listener.z;
  const horizontal = Math.hypot(dx, dz);
  const distance = Math.hypot(horizontal, dy);
  const forwardLength = Math.hypot(forward.x, forward.z);
  let pan = 0;
  let rear = 0;
  if (horizontal > 0.001 && forwardLength > 0.001) {
    const fx = forward.x / forwardLength;
    const fz = forward.z / forwardLength;
    // Right-hand vector of the horizontal forward is (-fz, fx).
    pan = THREE.MathUtils.clamp((dx * -fz + dz * fx) / horizontal, -1, 1);
    rear = THREE.MathUtils.clamp(-(dx * fx + dz * fz) / horizontal, 0, 1);
  }
  const floorMuffle = THREE.MathUtils.clamp((Math.abs(dy) - FLOOR_MUFFLE_START) / FLOOR_MUFFLE_RANGE, 0, 1)
    * FLOOR_MUFFLE;
  return {
    pan,
    attenuation: THREE.MathUtils.clamp(
      1 / (1 + Math.max(0, distance - NEAR_DISTANCE) * FALLOFF),
      MIN_ATTENUATION,
      1,
    ),
    muffle: Math.max(rear * REAR_MUFFLE, floorMuffle),
  };
}

/** Exponential so each muffle step sounds equally darker. */
export function muffleCutoff(muffle: number): number {
  return OPEN_CUTOFF * Math.pow(MUFFLED_CUTOFF / OPEN_CUTOFF, THREE.MathUtils.clamp(muffle, 0, 1));
}

/**
 * Zombie positions sit on the floor; the camera sits at eye height. Judging
 * a zombie from its head keeps "same floor" and "floor above" apart.
 */
const VOICE_HEIGHT = 1.5;

/** Pass `out` on per-frame paths to reuse a vector instead of allocating. */
export function voicePoint(position: Point3, out?: THREE.Vector3): Point3 {
  if (out) return out.set(position.x, position.y + VOICE_HEIGHT, position.z);
  return { x: position.x, y: position.y + VOICE_HEIGHT, z: position.z };
}

const tmpListener = new THREE.Vector3();
const tmpForward = new THREE.Vector3();

/** Cue for a world point as heard from the first-person camera. */
export function cameraSpatialCue(camera: THREE.Camera, source: Point3): SpatialCue {
  camera.getWorldPosition(tmpListener);
  camera.getWorldDirection(tmpForward);
  return spatialCue(tmpListener, tmpForward, source);
}
