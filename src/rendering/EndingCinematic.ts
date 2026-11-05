import * as THREE from 'three';
import type { ArenaEndingShot } from '../zombies/maps/ZombieArena';
import { matchPlayerLens, type PathKey, sampleIntroPath, toPathKey } from './IntroCinematic';

/** A shot ready to sample: its keys as vectors and where it starts on the ending's clock. */
interface ShotPath {
  readonly start: number;
  readonly end: number;
  readonly keys: ReadonlyArray<PathKey>;
  readonly shake: number;
}

/** Sum of two incommensurate sines per axis, normalised to [-1, 1]: a handheld wobble with no randomness. */
function wobble(time: number, phase: number): number {
  return (Math.sin(time * 13.7 + phase) + 0.6 * Math.sin(time * 7.9 + phase * 2.3)) / 1.6;
}

/**
 * Films a map's ending (`ArenaEnding.shots`), or a guardian's entrance
 * (`ArenaGuardianEntrance.shots`), through its own camera, which the shell
 * renders instead of the player's while `isPlaying`. Shots play back to
 * back with hard cuts; after the last one the camera holds its final frame
 * until `stop` (under the HUD's credits, at the end of a run).
 */
export class EndingCinematic {
  public readonly camera = new THREE.PerspectiveCamera();
  private readonly shots: ReadonlyArray<ShotPath>;
  private readonly position = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private elapsed = 0;
  private playing = false;

  public constructor(shots: ReadonlyArray<ArenaEndingShot>) {
    if (shots.length === 0) throw new Error('A filmed ending needs at least one shot');
    let start = 0;
    this.shots = shots.map((shot) => {
      if (shot.keys.length === 0) throw new Error('Every ending shot needs at least one key');
      const path: ShotPath = { start, end: start + shot.duration, keys: shot.keys.map(toPathKey), shake: shot.shake ?? 0 };
      start = path.end;
      return path;
    });
    this.camera.name = 'ending-cinematic-camera';
  }

  public get isPlaying(): boolean {
    return this.playing;
  }

  public start(playerCamera: THREE.PerspectiveCamera): void {
    this.elapsed = 0;
    this.playing = true;
    this.pose(playerCamera);
  }

  /** Back to the player's camera (restart or exit). */
  public stop(): void {
    this.playing = false;
  }

  public update(dt: number, playerCamera: THREE.PerspectiveCamera): void {
    if (!this.playing) return;
    this.elapsed += Math.max(0, dt);
    this.pose(playerCamera);
  }

  private pose(playerCamera: THREE.PerspectiveCamera): void {
    const shot = this.currentShot();
    const time = Math.min(this.elapsed, shot.end) - shot.start;
    sampleIntroPath(shot.keys, time, this.position, this.target);
    if (shot.shake > 0) {
      const t = this.elapsed;
      this.position.x += shot.shake * wobble(t, 0);
      this.position.y += shot.shake * wobble(t, 1.9);
      this.position.z += shot.shake * wobble(t, 4.1);
      this.target.x += shot.shake * wobble(t, 2.7);
      this.target.y += shot.shake * wobble(t, 5.3);
    }
    this.camera.position.copy(this.position);
    this.camera.lookAt(this.target);
    matchPlayerLens(this.camera, playerCamera);
    this.camera.updateMatrixWorld(true);
  }

  /** The shot playing now; the last one keeps its final frame. */
  private currentShot(): ShotPath {
    for (const shot of this.shots) {
      if (this.elapsed < shot.end) return shot;
    }
    return this.shots[this.shots.length - 1];
  }
}
