import * as THREE from 'three';
import type { ArenaIntro, ArenaIntroShot } from '../zombies/maps/ZombieArena';

/** How far ahead of the player's eyes the closing shot aims. */
const HANDOFF_TARGET_DISTANCE = 10;

interface PathKey {
  readonly time: number;
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
}

/** Sine ease in/out: the camera drifts off its first shot and settles on the last. */
export function easeIntroTime(elapsed: number, duration: number): number {
  if (duration <= 0) return 0;
  const progress = THREE.MathUtils.clamp(elapsed / duration, 0, 1);
  return duration * (0.5 - 0.5 * Math.cos(Math.PI * progress));
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, s: number): number {
  const s2 = s * s;
  return 0.5 * (2 * p1 + (p2 - p0) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (3 * p1 - p0 - 3 * p2 + p3) * s2 * s);
}

function blend(out: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, s: number): void {
  out.set(catmullRom(a.x, b.x, c.x, d.x, s), catmullRom(a.y, b.y, c.y, d.y, s), catmullRom(a.z, b.z, c.z, d.z, s));
}

/**
 * Samples a smooth Catmull-Rom path through `keys` (ordered by time) at
 * `time`, writing the camera position and look target. Times outside the
 * path clamp to its ends.
 */
export function sampleIntroPath(
  keys: ReadonlyArray<PathKey>,
  time: number,
  position: THREE.Vector3,
  target: THREE.Vector3,
): void {
  const last = keys.length - 1;
  if (time <= keys[0].time || last === 0) {
    position.copy(keys[0].position);
    target.copy(keys[0].target);
    return;
  }
  if (time >= keys[last].time) {
    position.copy(keys[last].position);
    target.copy(keys[last].target);
    return;
  }
  let index = 0;
  while (time > keys[index + 1].time) index++;
  const k0 = keys[Math.max(0, index - 1)];
  const k1 = keys[index];
  const k2 = keys[index + 1];
  const k3 = keys[Math.min(last, index + 2)];
  const s = (time - k1.time) / Math.max(1e-6, k2.time - k1.time);
  blend(position, k0.position, k1.position, k2.position, k3.position, s);
  blend(target, k0.target, k1.target, k2.target, k3.target, s);
}

function toKey(shot: ArenaIntroShot): PathKey {
  return {
    time: shot.time,
    position: new THREE.Vector3(shot.position.x, shot.position.y, shot.position.z),
    target: new THREE.Vector3(shot.target.x, shot.target.y, shot.target.z),
  };
}

/**
 * Plays a map's `ArenaIntro` through its own camera, which the shell renders
 * instead of the player's while `isPlaying`. The path ends on a key glued to
 * the player's live view, so the cut back to first person is seamless. Lens
 * settings follow the player camera so aspect changes apply mid-intro too.
 */
export class IntroCinematic {
  readonly camera = new THREE.PerspectiveCamera();
  private readonly keys: PathKey[];
  private readonly handoff: PathKey;
  private readonly position = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private elapsed = 0;
  private playing = false;

  constructor(readonly definition: ArenaIntro) {
    this.keys = definition.shots.map(toKey);
    this.handoff = { time: definition.duration, position: new THREE.Vector3(), target: new THREE.Vector3() };
    this.keys.push(this.handoff);
    this.camera.name = 'intro-cinematic-camera';
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /** Seconds since `start`, for skip guards. */
  get time(): number {
    return this.elapsed;
  }

  start(playerCamera: THREE.PerspectiveCamera): void {
    this.elapsed = 0;
    this.playing = true;
    this.pose(playerCamera);
  }

  /** Cuts straight to the player (skip, restart or exit). */
  stop(): void {
    this.playing = false;
  }

  /** Advances the shot; returns true on the frame the intro completes. */
  update(dt: number, playerCamera: THREE.PerspectiveCamera): boolean {
    if (!this.playing) return false;
    this.elapsed += Math.max(0, dt);
    this.pose(playerCamera);
    if (this.elapsed < this.definition.duration) return false;
    this.playing = false;
    return true;
  }

  private pose(playerCamera: THREE.PerspectiveCamera): void {
    playerCamera.updateWorldMatrix(true, false);
    playerCamera.getWorldPosition(this.handoff.position);
    playerCamera.getWorldDirection(this.handoff.target)
      .multiplyScalar(HANDOFF_TARGET_DISTANCE)
      .add(this.handoff.position);

    sampleIntroPath(this.keys, easeIntroTime(this.elapsed, this.definition.duration), this.position, this.target);
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.target);

    if (
      this.camera.fov !== playerCamera.fov || this.camera.aspect !== playerCamera.aspect
      || this.camera.near !== playerCamera.near || this.camera.far !== playerCamera.far
    ) {
      this.camera.fov = playerCamera.fov;
      this.camera.aspect = playerCamera.aspect;
      this.camera.near = playerCamera.near;
      this.camera.far = playerCamera.far;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld(true);
  }
}
