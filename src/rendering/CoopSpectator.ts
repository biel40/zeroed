import * as THREE from 'three';
import type { PlayerLifeState } from '../network/Protocol';
import { EYE_HEIGHT } from '../player/PlayerController';
import type { RemotePlayer } from './RemotePlayer';

/** Borrows the teammate's interpolated view without moving the local gameplay rig. */
export class CoopSpectator {
  private readonly view = new THREE.PerspectiveCamera();
  private active = false;

  public update(target: RemotePlayer, enabled: boolean, life: PlayerLifeState): void {
    this.active = enabled && target.latest !== null && life !== 'dead';
    // The spectator looks through the teammate's eyes, so their body must not occlude the view.
    target.setViewHidden(this.active);
    if (!this.active) return;

    this.view.position.copy(target.root.position);
    this.view.position.y += EYE_HEIGHT + (life === 'downed' ? -1.2 : target.viewEyeOffsetY);
    this.view.rotation.set(target.viewPitch, target.root.rotation.y, 0, 'YXZ');
    this.view.updateMatrixWorld(true);
  }

  /** Resize and orientation changes also apply while the shared simulation is paused. */
  public getCamera(projection: THREE.PerspectiveCamera): THREE.PerspectiveCamera | null {
    if (!this.active) return null;
    this.view.fov = projection.fov;
    this.view.aspect = projection.aspect;
    this.view.near = projection.near;
    this.view.far = projection.far;
    this.view.projectionMatrix.copy(projection.projectionMatrix);
    this.view.projectionMatrixInverse.copy(projection.projectionMatrixInverse);
    return this.view;
  }
}
