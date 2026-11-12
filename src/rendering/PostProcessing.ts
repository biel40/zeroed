import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/** Glow around whatever is brighter than `threshold` in linear light; a look decision. */
export const BLOOM = { strength: 0.32, radius: 0.55, threshold: 0.85 } as const;

/** The renderer's own antialiasing does not reach an offscreen target, so the target carries it. */
const MSAA_SAMPLES = 4;

/** Half-float where the GPU can render to it, so lights above white survive until the bloom. */
export function hdrTextureType(renderer: THREE.WebGLRenderer): THREE.TextureDataType {
  const { extensions } = renderer;
  return extensions.has('EXT_color_buffer_float') || extensions.has('EXT_color_buffer_half_float')
    ? THREE.HalfFloatType
    : THREE.UnsignedByteType;
}

/**
 * HDR frame for the top quality tier: the scene is drawn antialiased into a
 * linear offscreen target, bright light blooms, and the renderer's tone
 * mapping and colour space are applied once at the end.
 */
export class PostProcessing {
  private readonly composer: EffectComposer;
  private readonly scenePass: RenderPass;

  public constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    // The frame is several draws: count them all instead of only the last pass.
    renderer.info.autoReset = false;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: hdrTextureType(renderer), samples: MSAA_SAMPLES });
    this.composer = new EffectComposer(renderer, target);
    this.scenePass = new RenderPass(scene, camera);
    this.composer.addPass(this.scenePass);
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM.strength, BLOOM.radius, BLOOM.threshold));
    const output = new OutputPass();
    // It draws to the screen: swapping after it would make the scene alternate
    // between two antialiased HDR targets and allocate both.
    output.needsSwap = false;
    this.composer.addPass(output);
  }

  /**
   * The target the scene is drawn into. Shaders compiled while it is bound
   * are the ones the frames use: an offscreen target takes no tone mapping.
   */
  public get sceneTarget(): THREE.WebGLRenderTarget {
    return this.composer.readBuffer;
  }

  /** Size in CSS pixels and the device pixel ratio of the drawing buffer. */
  public setResolution(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
  }

  public render(camera: THREE.Camera): void {
    this.renderer.info.reset();
    this.scenePass.camera = camera;
    this.composer.render();
  }

  public dispose(): void {
    this.composer.dispose();
  }
}
