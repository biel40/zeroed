import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/** Tuning of the lens and film treatment; a look decision. */
export const FILM = {
  /** Unsharp mask on the finished image: restores the crispness antialiasing and bloom soften. */
  sharpen: 0.32,
  /** Darkening of the corners, 0..1. */
  vignette: 0.16,
  /** Peak deviation of the grain, in display values. */
  grain: 0.008,
  /** Colour fringing at the corners, in screen widths. */
  aberration: 0.0006,
} as const;

const VERTEX = /* glsl */ `
precision highp float;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** A raw shader: the renderer would otherwise add its own tone mapping on top of this one. */
const FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uSeed;
uniform vec4 uFilm;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;

vec3 toned(vec2 uv) {
  return clamp(ACESFilmicToneMapping(texture2D(tDiffuse, uv).rgb), 0.0, 1.0);
}

void main() {
  vec2 centred = vUv - 0.5;
  float edge = dot(centred, centred);
  vec2 fringe = centred * edge * uFilm.w;
  vec3 middle = toned(vUv);
  vec3 color = vec3(toned(vUv + fringe).r, middle.g, toned(vUv - fringe).b);
  vec3 around = (toned(vUv + vec2(uTexel.x, 0.0)) + toned(vUv - vec2(uTexel.x, 0.0))
    + toned(vUv + vec2(0.0, uTexel.y)) + toned(vUv - vec2(0.0, uTexel.y))) * 0.25;
  color = clamp(color + (middle - around) * uFilm.x, 0.0, 1.0);
  color *= 1.0 - uFilm.y * smoothstep(0.08, 0.5, edge);
  color = sRGBTransferOETF(vec4(color, 1.0)).rgb;
  float noise = fract(sin(dot(gl_FragCoord.xy + uSeed, vec2(12.9898, 78.233))) * 43758.5453);
  gl_FragColor = vec4(color + (noise - 0.5) * uFilm.z, 1.0);
}
`;

/**
 * Last pass of the HDR frame: tone maps with the renderer's exposure, then
 * sharpens, fringes and darkens the corners like a lens, converts to the
 * display colour space and adds film grain. Assumes ACES tone mapping and an
 * sRGB canvas, which is what the game renders with.
 */
export class FilmOutputPass extends Pass {
  private readonly material = new THREE.RawShaderMaterial({
    name: 'film-output',
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      toneMappingExposure: { value: 1 },
      uTexel: { value: new THREE.Vector2() },
      uSeed: { value: 0 },
      uFilm: { value: new THREE.Vector4(FILM.sharpen, FILM.vignette, FILM.grain, FILM.aberration) },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
  private readonly quad = new FullScreenQuad(this.material);
  private time = 0;

  public constructor() {
    super();
    // It draws to the screen and leaves the frame buffers as they are.
    this.needsSwap = false;
  }

  public override render(
    renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number,
  ): void {
    const { uniforms } = this.material;
    this.time = (this.time + deltaTime) % 64;
    uniforms.tDiffuse.value = readBuffer.texture;
    uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    uniforms.uTexel.value.set(1 / readBuffer.width, 1 / readBuffer.height);
    uniforms.uSeed.value = this.time * 977;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  public override dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
