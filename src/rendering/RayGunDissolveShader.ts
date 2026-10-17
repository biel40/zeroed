import * as THREE from 'three';

/**
 * Duration of the Ray Gun vaporization / dissolution sequence in seconds
 * (within the 0.8–1.2 s window).
 */
export const RAYGUN_DISSOLVE_DURATION = 1.0;

export const RAYGUN_NEON_GREEN = 0x5cff3a;
export const RAYGUN_HOT_CORE = 0xe8ffd1;
const ASH_PARTICLE_COUNT = 36;
const NOISE_TEXTURE_SIZE = 64;

export interface RayGunDissolveUniforms {
  uDissolveProgress: { value: number };
  uDissolveEdgeWidth: { value: number };
  uDissolveEdgeColor: { value: THREE.Color };
  uDissolveHotColor: { value: THREE.Color };
  uDissolveOrigin: { value: THREE.Vector3 };
  uDissolveHeight: { value: number };
  uDissolveNoiseMap: { value: THREE.DataTexture };
}

let sharedNoiseTexture: THREE.DataTexture | null = null;

/**
 * Deterministic 2D value/perlin-like noise baked into a tileable DataTexture
 * so mobile GPUs can sample high-frequency breakup at minimal ALU cost,
 * without needing a DOM canvas in headless tests.
 */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function tileableValueNoise(u: number, v: number, period: number): number {
  const x = u * period;
  const y = v * period;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const uFade = xf * xf * (3 - 2 * xf);
  const vFade = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y0 = ((yi % period) + period) % period;
  const y1 = (y0 + 1) % period;
  const n00 = hash2(x0, y0);
  const n10 = hash2(x1, y0);
  const n01 = hash2(x0, y1);
  const n11 = hash2(x1, y1);
  const nx0 = n00 + (n10 - n00) * uFade;
  const nx1 = n01 + (n11 - n01) * uFade;
  return nx0 + (nx1 - nx0) * vFade;
}

export function getDissolveNoiseTexture(): THREE.DataTexture {
  if (sharedNoiseTexture) return sharedNoiseTexture;
  const data = new Uint8Array(NOISE_TEXTURE_SIZE * NOISE_TEXTURE_SIZE * 4);
  for (let y = 0; y < NOISE_TEXTURE_SIZE; y++) {
    for (let x = 0; x < NOISE_TEXTURE_SIZE; x++) {
      const u = x / NOISE_TEXTURE_SIZE;
      const v = y / NOISE_TEXTURE_SIZE;
      const fbm =
        tileableValueNoise(u, v, 4) * 0.55 +
        tileableValueNoise(u, v, 8) * 0.3 +
        tileableValueNoise(u, v, 16) * 0.15;
      const byte = Math.max(0, Math.min(255, Math.round(fbm * 255)));
      const idx = (y * NOISE_TEXTURE_SIZE + x) * 4;
      data[idx] = byte;
      data[idx + 1] = byte;
      data[idx + 2] = byte;
      data[idx + 3] = 255;
    }
  }
  sharedNoiseTexture = new THREE.DataTexture(
    data,
    NOISE_TEXTURE_SIZE,
    NOISE_TEXTURE_SIZE,
    THREE.RGBAFormat,
  );
  sharedNoiseTexture.wrapS = THREE.RepeatWrapping;
  sharedNoiseTexture.wrapT = THREE.RepeatWrapping;
  sharedNoiseTexture.magFilter = THREE.LinearFilter;
  sharedNoiseTexture.minFilter = THREE.LinearFilter;
  sharedNoiseTexture.needsUpdate = true;
  return sharedNoiseTexture;
}

export function disposeDissolveNoiseTexture(): void {
  if (!sharedNoiseTexture) return;
  sharedNoiseTexture.dispose();
  sharedNoiseTexture = null;
}

/**
 * Vertex shader declarations injected into MeshStandardMaterial via onBeforeCompile.
 */
export const RAYGUN_DISSOLVE_VERTEX_PARS = /* glsl */ `
varying vec3 vDissolveLocalPos;
`;

/**
 * Vertex shader body snippet injected after `#include <skinning_vertex>` so
 * `vDissolveLocalPos` reflects the animated bone pose in model meters.
 */
export const RAYGUN_DISSOLVE_VERTEX_MAIN = /* glsl */ `
vDissolveLocalPos = transformed;
`;

/**
 * Fragment shader declarations and 3D Simplex-like procedural noise helper
 * combined with the tileable noise texture for mobile-friendly dissolution.
 */
export const RAYGUN_DISSOLVE_FRAGMENT_PARS = /* glsl */ `
varying vec3 vDissolveLocalPos;
uniform float uDissolveProgress;
uniform float uDissolveEdgeWidth;
uniform vec3 uDissolveEdgeColor;
uniform vec3 uDissolveHotColor;
uniform vec3 uDissolveOrigin;
uniform float uDissolveHeight;
uniform sampler2D uDissolveNoiseMap;

float rayGunHash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float rayGunNoise3D(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(rayGunHash31(i + vec3(0.0, 0.0, 0.0)), rayGunHash31(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(rayGunHash31(i + vec3(0.0, 1.0, 0.0)), rayGunHash31(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(rayGunHash31(i + vec3(0.0, 0.0, 1.0)), rayGunHash31(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(rayGunHash31(i + vec3(0.0, 1.0, 1.0)), rayGunHash31(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}
`;

/**
 * Fragment shader body snippet injected after `#include <emissivemap_fragment>`.
 * Progressively discards fragments from the top and impact origin, adding an
 * incandescent neon-green plasma rim along the active dissolution threshold.
 */
export const RAYGUN_DISSOLVE_FRAGMENT_MAIN = /* glsl */ `
if (uDissolveProgress > 0.001) {
  float invHeight = 1.0 / max(uDissolveHeight, 0.1);
  float topDown = 1.0 - clamp(vDissolveLocalPos.y * invHeight, 0.0, 1.0);
  float radial = clamp(length(vDissolveLocalPos - uDissolveOrigin) * invHeight, 0.0, 1.0);
  vec2 noiseUv = vDissolveLocalPos.xz * 1.9 + vec2(vDissolveLocalPos.y * 1.35);
  float texNoise = texture2D(uDissolveNoiseMap, noiseUv).r;
  float procNoise = rayGunNoise3D(vDissolveLocalPos * 4.5);
  float combinedNoise = mix(texNoise, procNoise, 0.5);

  float dissolveField = mix(topDown, radial, 0.35) * 0.55 + combinedNoise * 0.45;
  float threshold = uDissolveProgress * 1.28 - 0.08;
  float delta = dissolveField - threshold;
  if (delta < 0.0) {
    discard;
  }
  float edge = 1.0 - smoothstep(0.0, max(uDissolveEdgeWidth, 0.01), delta);
  if (edge > 0.0) {
    float charMask = smoothstep(0.0, 1.0, edge);
    diffuseColor.rgb *= mix(1.0, 0.08, charMask);
    vec3 rimGlow = mix(uDissolveEdgeColor, uDissolveHotColor, edge * edge);
    totalEmissiveRadiance += rimGlow * (edge * 3.8);
  }
}
`;

export const RAYGUN_ASH_VERTEX_SHADER = /* glsl */ `
attribute vec3 aVelocity;
attribute float aPhase;
attribute float aScale;

uniform float uProgress;
uniform float uPointScale;

varying float vAlpha;
varying float vHotness;

void main() {
  float localT = clamp((uProgress - aPhase * 0.38) / (1.0 - aPhase * 0.38), 0.0, 1.0);
  vec3 animatedPos = position + aVelocity * localT;
  animatedPos.x += sin(localT * 9.0 + aPhase * 6.2831) * 0.08 * localT;
  animatedPos.z += cos(localT * 8.0 + aPhase * 6.2831) * 0.08 * localT;

  vec4 mvPosition = modelViewMatrix * vec4(animatedPos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float fadeIn = smoothstep(0.0, 0.15, localT);
  float fadeOut = 1.0 - smoothstep(0.55, 1.0, localT);
  vAlpha = fadeIn * fadeOut * step(0.001, uProgress);
  vHotness = 1.0 - localT;

  float depth = max(0.5, -mvPosition.z);
  gl_PointSize = clamp((aScale * uPointScale * (1.0 - localT * 0.45)) / depth, 1.5, 42.0);
}
`;

export const RAYGUN_ASH_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uEdgeColor;
uniform vec3 uHotColor;

varying float vAlpha;
varying float vHotness;

void main() {
  if (vAlpha <= 0.01) discard;
  vec2 centered = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(centered, centered);
  if (r2 > 1.0) discard;
  float radial = exp(-r2 * 3.2);
  vec3 color = mix(uEdgeColor, uHotColor, radial * vHotness);
  gl_FragColor = vec4(color, radial * vAlpha);
}
`;

/**
 * Installs the Ray Gun dissolution shader hook onto a zombie's standard material.
 * Preserves hardware bone skinning, shadows, and PBR lighting while dormant
 * (`uDissolveProgress === 0`).
 */
export function installRayGunDissolve(
  material: THREE.MeshStandardMaterial,
  height = 1.8,
): RayGunDissolveUniforms {
  const existing = material.userData.rayGunDissolve as RayGunDissolveUniforms | undefined;
  if (existing) {
    existing.uDissolveHeight.value = height;
    return existing;
  }

  const uniforms: RayGunDissolveUniforms = {
    uDissolveProgress: { value: 0 },
    uDissolveEdgeWidth: { value: 0.11 },
    uDissolveEdgeColor: { value: new THREE.Color(RAYGUN_NEON_GREEN) },
    uDissolveHotColor: { value: new THREE.Color(RAYGUN_HOT_CORE) },
    uDissolveOrigin: { value: new THREE.Vector3(0, height * 0.55, 0) },
    uDissolveHeight: { value: height },
    uDissolveNoiseMap: { value: getDissolveNoiseTexture() },
  };
  material.userData.rayGunDissolve = uniforms;

  const prevCacheKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${prevCacheKey()}|raygun-dissolve-v1`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolveProgress = uniforms.uDissolveProgress;
    shader.uniforms.uDissolveEdgeWidth = uniforms.uDissolveEdgeWidth;
    shader.uniforms.uDissolveEdgeColor = uniforms.uDissolveEdgeColor;
    shader.uniforms.uDissolveHotColor = uniforms.uDissolveHotColor;
    shader.uniforms.uDissolveOrigin = uniforms.uDissolveOrigin;
    shader.uniforms.uDissolveHeight = uniforms.uDissolveHeight;
    shader.uniforms.uDissolveNoiseMap = uniforms.uDissolveNoiseMap;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${RAYGUN_DISSOLVE_VERTEX_PARS}`,
      )
      .replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>\n${RAYGUN_DISSOLVE_VERTEX_MAIN}`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${RAYGUN_DISSOLVE_FRAGMENT_PARS}`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>\n${RAYGUN_DISSOLVE_FRAGMENT_MAIN}`,
      );
  };
  material.needsUpdate = true;
  return uniforms;
}

/**
 * Updates the dissolution progress (`0..1`) and optional local-space impact origin
 * on a material previously registered with `installRayGunDissolve`.
 */
export function setRayGunDissolveState(
  material: THREE.Material,
  progress: number,
  origin?: THREE.Vector3,
): void {
  const uniforms = material.userData.rayGunDissolve as RayGunDissolveUniforms | undefined;
  if (!uniforms) return;
  uniforms.uDissolveProgress.value = THREE.MathUtils.clamp(progress, 0, 1);
  if (origin) uniforms.uDissolveOrigin.value.copy(origin);
}

/**
 * Ascending neon-green plasma ash particle burst attached to a zombie visual
 * during a Ray Gun vaporization death. Uses a single draw call (`THREE.Points`)
 * and exposes `dispose()` for explicit GPU memory cleanup.
 */
export class RayGunAshParticles {
  public readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly basePositions = new Float32Array(ASH_PARTICLE_COUNT * 3);
  private readonly velocities = new Float32Array(ASH_PARTICLE_COUNT * 3);
  private readonly phases = new Float32Array(ASH_PARTICLE_COUNT);
  private readonly positionAttr: THREE.BufferAttribute;

  public constructor(height = 1.8) {
    this.geometry = new THREE.BufferGeometry();
    const initialPositions = new Float32Array(ASH_PARTICLE_COUNT * 3);
    const scales = new Float32Array(ASH_PARTICLE_COUNT);

    for (let i = 0; i < ASH_PARTICLE_COUNT; i++) {
      const ratio = i / ASH_PARTICLE_COUNT;
      const angle = i * 2.3999632;
      const radius = 0.08 + (i % 5) * 0.055;
      const bx = Math.cos(angle) * radius;
      const by = (0.15 + ratio * 0.78) * height;
      const bz = Math.sin(angle) * radius;
      this.basePositions[i * 3] = bx;
      this.basePositions[i * 3 + 1] = by;
      this.basePositions[i * 3 + 2] = bz;
      initialPositions[i * 3] = bx;
      initialPositions[i * 3 + 1] = by;
      initialPositions[i * 3 + 2] = bz;

      // Ascending buoyant velocity with slight outward spread
      const radialSpeed = 0.22 + (i % 4) * 0.07;
      this.velocities[i * 3] = Math.cos(angle) * radialSpeed;
      this.velocities[i * 3 + 1] = 0.95 + (i % 6) * 0.16;
      this.velocities[i * 3 + 2] = Math.sin(angle) * radialSpeed;

      this.phases[i] = ratio;
      scales[i] = 0.8 + (i % 3) * 0.35;
    }

    this.positionAttr = new THREE.BufferAttribute(initialPositions, 3).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('aVelocity', new THREE.BufferAttribute(this.velocities, 3));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(this.phases, 1));
    this.geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

    this.material = new THREE.ShaderMaterial({
      vertexShader: RAYGUN_ASH_VERTEX_SHADER,
      fragmentShader: RAYGUN_ASH_FRAGMENT_SHADER,
      uniforms: {
        uProgress: { value: 0 },
        uPointScale: { value: 68 },
        uEdgeColor: { value: new THREE.Color(RAYGUN_NEON_GREEN) },
        uHotColor: { value: new THREE.Color(RAYGUN_HOT_CORE) },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.name = 'raygun-ash-particles';
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  public setProgress(progress: number): void {
    const clamped = THREE.MathUtils.clamp(progress, 0, 1);
    this.material.uniforms.uProgress.value = clamped;
    this.points.visible = clamped > 0.001 && clamped < 0.999;
    if (!this.points.visible) return;

    // Also update CPU-side positions so bounding/inspection tools and headless
    // tests can observe the ascending ash cloud directly.
    for (let i = 0; i < ASH_PARTICLE_COUNT; i++) {
      const phase = this.phases[i];
      const localT = THREE.MathUtils.clamp((clamped - phase * 0.38) / (1 - phase * 0.38), 0, 1);
      const idx = i * 3;
      this.positionAttr.setXYZ(
        i,
        this.basePositions[idx] + this.velocities[idx] * localT * 0.25,
        this.basePositions[idx + 1] + this.velocities[idx + 1] * localT * 0.35,
        this.basePositions[idx + 2] + this.velocities[idx + 2] * localT * 0.25,
      );
    }
    this.positionAttr.needsUpdate = true;
  }

  public reset(): void {
    this.material.uniforms.uProgress.value = 0;
    this.points.visible = false;
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
