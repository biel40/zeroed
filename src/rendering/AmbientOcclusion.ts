import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { VIEW_MODEL_DEPTH_SHARE } from './ViewModelDepth';

/** Tuning of the ambient occlusion; a look decision. Radius and thickness are in metres. */
export const AMBIENT_OCCLUSION = {
  /** How far a surface looks for something shading it: corners, furniture, bodies. */
  radius: 0.55,
  thickness: 1,
  /** Exponent on the result: above 1 deepens the contact shadows. */
  strength: 1.35,
  samples: 12,
  denoiseSamples: 8,
} as const;

// GTAO and its denoiser reconstruct normals with texelFetch as well as sampling depth.
const DEPTH_READ = /return ((?:textureLod\(tDepth, uv\.xy, 0\.0\)|texelFetch\(tDepth, uv\.xy, 0\))\.(?:DEPTH_SWIZZLING|r|a));/g;

/**
 * Makes the occlusion shader read the first-person view model as empty sky.
 * The weapon is drawn in a squeezed slice of the depth range (see
 * `applyViewModelDepth`), so its depth does not describe where it is: left
 * in, it would be shaded as a wall touching the camera. Every depth read is
 * masked, including normal reconstruction and the denoiser's edge weights.
 */
export function maskViewModelDepth(fragmentShader: string): string {
  return fragmentShader.replace(
    DEPTH_READ,
    `float depth = $1;
			return depth < ${VIEW_MODEL_DEPTH_SHARE.toFixed(3)} ? 1.0 : depth;`,
  );
}

/**
 * Ground-truth ambient occlusion over the scene already drawn: it reuses the
 * depth of the frame instead of drawing the world a second time, and rebuilds
 * the normals from it. Transparent effects write no depth, so they neither
 * receive nor cast it.
 */
export class AmbientOcclusion {
  public readonly pass: GTAOPass;

  public constructor(scene: THREE.Scene, camera: THREE.Camera, depthTexture: THREE.DepthTexture) {
    this.pass = new GTAOPass(scene, camera);
    // After construction: the pass only builds the targets it resizes later when it starts without a depth texture.
    this.pass.setGBuffer(depthTexture);
    this.pass.gtaoMaterial.fragmentShader = maskViewModelDepth(this.pass.gtaoMaterial.fragmentShader);
    this.pass.pdMaterial.fragmentShader = maskViewModelDepth(this.pass.pdMaterial.fragmentShader);
    this.pass.updateGtaoMaterial({
      radius: AMBIENT_OCCLUSION.radius,
      thickness: AMBIENT_OCCLUSION.thickness,
      scale: AMBIENT_OCCLUSION.strength,
      samples: AMBIENT_OCCLUSION.samples,
    });
    this.pass.updatePdMaterial({ samples: AMBIENT_OCCLUSION.denoiseSamples });
  }

  /** Points the pass at the camera and at the depth of the frame about to be drawn. */
  public prepare(camera: THREE.Camera, depthTexture: THREE.DepthTexture): void {
    this.pass.camera = camera;
    this.pass.gtaoMaterial.uniforms.tDepth.value = depthTexture;
    this.pass.pdMaterial.uniforms.tDepth.value = depthTexture;
  }

  public dispose(): void {
    this.pass.dispose();
    // Three r178 releases the targets and denoiser but omits this material.
    this.pass.gtaoMaterial.dispose();
  }
}
