import type * as THREE from 'three';
import { getSettings } from '../core/PlayerSettings';

const TRAUMA_DECAY = 2.1;
const SHAKE_MAX_ANGLE = 0.04;

/**
 * Trauma-based camera shake: impulses pile up to 1 and decay smoothly; the
 * view rattles by the square of the trauma, so small hits stay subtle. It is
 * layered on the camera after the player controller has written its pose
 * and after this frame's shots, so it never deflects aim. The player's
 * camera-shake setting scales (or removes) the rattle, not the trauma.
 */
export class CameraShake {
  private level = 0;
  private seed = 0;

  public get trauma(): number {
    return this.level;
  }

  /** Adds an impulse (0..1); the total never passes 1. */
  public add(amount: number): void {
    this.level = Math.min(1, this.level + Math.max(0, amount));
  }

  /** Decays the trauma and rotates `camera` by this frame's rattle. */
  public update(dt: number, camera: THREE.Object3D): void {
    if (this.level <= 0) return;
    this.level = Math.max(0, this.level - TRAUMA_DECAY * dt);
    this.seed += dt * 34;
    const amount = this.level * this.level * SHAKE_MAX_ANGLE * getSettings().cameraShake;
    if (amount === 0) return;
    camera.rotation.x += Math.sin(this.seed * 1.1) * amount;
    camera.rotation.y += Math.sin(this.seed * 0.9 + 1.7) * amount;
    camera.rotation.z += Math.sin(this.seed * 1.3 + 3.1) * amount * 0.6;
  }

  public reset(): void {
    this.level = 0;
  }
}
