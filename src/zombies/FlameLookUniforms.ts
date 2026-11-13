import * as THREE from 'three';
import type { FlameShotLook } from '../weapons/WeaponShotLook';

/**
 * Uniforms through which a flame stream's shaders (FlameJet, FlameParticles)
 * burn in a finish's colours (FlameShotLook): `uLook` 0 keeps the weapon's
 * own fire, 1 uses the look's core, body, ember and arcane colours.
 */
export interface FlameLookUniforms {
  readonly uLook: THREE.IUniform<number>;
  readonly uLookCore: THREE.IUniform<THREE.Color>;
  readonly uLookBody: THREE.IUniform<THREE.Color>;
  readonly uLookEmber: THREE.IUniform<THREE.Color>;
  readonly uLookArcane: THREE.IUniform<THREE.Color>;
}

/** Fresh uniforms with the look off. */
export function createFlameLookUniforms(): FlameLookUniforms {
  return {
    uLook: { value: 0 },
    uLookCore: { value: new THREE.Color() },
    uLookBody: { value: new THREE.Color() },
    uLookEmber: { value: new THREE.Color() },
    uLookArcane: { value: new THREE.Color() },
  };
}

/** Writes `look` into `uniforms`; null turns the look off and keeps the last colours. */
export function applyFlameLook(uniforms: FlameLookUniforms, look: FlameShotLook | null): void {
  uniforms.uLook.value = look ? 1 : 0;
  if (!look) return;
  uniforms.uLookCore.value.setHex(look.core);
  uniforms.uLookBody.value.setHex(look.body);
  uniforms.uLookEmber.value.setHex(look.ember);
  uniforms.uLookArcane.value.setHex(look.arcane);
}
