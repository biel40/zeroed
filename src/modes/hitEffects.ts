import type * as THREE from 'three';
import type { AudioSystem } from '../audio/AudioSystem';
import type { Effects } from '../rendering/Effects';
import type { HitTarget } from '../shooting/HitTarget';

/**
 * Classic range feedback for hitting a reactive target: steel pings and
 * sparks, paper takes a bullet-hole decal. Shared by both modes so the
 * range props behave identically no matter which mode is running.
 */
export function standardTargetHitEffects(
  audio: AudioSystem,
  effects: Effects,
  target: HitTarget,
  point: THREE.Vector3,
  normal: THREE.Vector3,
  object: THREE.Object3D,
): void {
  if (target.surface === 'metal') {
    audio.playPing();
    effects.spark(point, normal);
  } else {
    audio.playImpact('paper');
    effects.bulletHole(point, normal, object);
  }
}
