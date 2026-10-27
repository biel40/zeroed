import * as THREE from 'three';
import { getDissolveNoiseTexture } from './RayGunDissolveShader';

/** Colour of glowing embers in the cracks of a charred body. */
const EMBER_COLOR = new THREE.Color(1, 0.3, 0.05);

export interface ZombieCharUniforms {
  /** 0 untouched → 1 burnt to charcoal; patches char first, the rest follows. */
  uCharAmount: { value: number };
  /** 0..1 glow of the embers in the cracks. */
  uCharEmber: { value: number };
  uCharTime: { value: number };
  uCharEmberColor: { value: THREE.Color };
  uCharNoiseMap: { value: THREE.DataTexture };
}

const VERTEX_PARS = /* glsl */ `
varying vec3 vCharLocalPos;
`;

/** After skinning: the animated pose in model metres, so the char sticks to the body. */
const VERTEX_MAIN = /* glsl */ `
vCharLocalPos = transformed;
`;

const FRAGMENT_PARS = /* glsl */ `
varying vec3 vCharLocalPos;
uniform float uCharAmount;
uniform float uCharEmber;
uniform float uCharTime;
uniform vec3 uCharEmberColor;
uniform sampler2D uCharNoiseMap;
`;

/**
 * Burnt flesh, after the emissive map: patches blacken first and spread into
 * a crusted charcoal with a faint grain; blistered, raw red flesh opens in
 * the deepest burns; thin ember cracks glow and breathe in the char.
 */
const FRAGMENT_MAIN = /* glsl */ `
if (uCharAmount > 0.001) {
  vec2 charUv = vCharLocalPos.xz * 2.1 + vec2(vCharLocalPos.y * 1.6, vCharLocalPos.y * 0.7);
  float patches = texture2D(uCharNoiseMap, charUv * 0.6).r;
  float grain = texture2D(uCharNoiseMap, charUv * 3.3 + 0.37).r;
  float burnt = smoothstep(0.0, 0.35, uCharAmount * 1.35 - patches * 0.5);
  vec3 charcoal = vec3(0.03, 0.024, 0.02) * (0.55 + grain * 0.9);
  diffuseColor.rgb = mix(diffuseColor.rgb, charcoal, burnt);
  float raw = (1.0 - smoothstep(0.22, 0.3, grain)) * burnt * smoothstep(0.35, 0.8, uCharAmount);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.015, 0.01), raw * 0.9);
  float crackField = abs(texture2D(uCharNoiseMap, charUv * 1.7 + 0.71).r - 0.5);
  float crack = 1.0 - smoothstep(0.012, 0.045, crackField);
  float breathe = 0.6 + 0.4 * sin(uCharTime * 3.1 + patches * 17.0);
  totalEmissiveRadiance += uCharEmberColor * crack * burnt * uCharEmber * breathe * 2.6
    + uCharEmberColor * raw * uCharEmber * 0.25;
}
`;

/**
 * Adds the ФАКЕЛ-33 char layer to a zombie's standard material, keeping any
 * shader hook already installed (the Ray Gun dissolve) and the material's
 * skinning, shadows and lighting. Dormant (a uniform branch, no recompile)
 * while `uCharAmount` is 0.
 */
export function installZombieChar(material: THREE.MeshStandardMaterial): ZombieCharUniforms {
  const existing = material.userData.zombieChar as ZombieCharUniforms | undefined;
  if (existing) return existing;
  const uniforms: ZombieCharUniforms = {
    uCharAmount: { value: 0 },
    uCharEmber: { value: 0 },
    uCharTime: { value: 0 },
    uCharEmberColor: { value: EMBER_COLOR.clone() },
    uCharNoiseMap: { value: getDissolveNoiseTexture() },
  };
  material.userData.zombieChar = uniforms;

  const previousKey = material.customProgramCacheKey.bind(material);
  material.customProgramCacheKey = () => `${previousKey()}|zombie-char-v1`;
  const previousCompile = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
      .replace('#include <skinning_vertex>', `#include <skinning_vertex>\n${VERTEX_MAIN}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAGMENT_MAIN}`);
  };
  material.needsUpdate = true;
  return uniforms;
}

/** Sets how charred (0..1) and how hot (0..1) a material installed with `installZombieChar` is. */
export function setZombieChar(material: THREE.Material, amount: number, ember: number, time: number): void {
  const uniforms = material.userData.zombieChar as ZombieCharUniforms | undefined;
  if (!uniforms) return;
  uniforms.uCharAmount.value = THREE.MathUtils.clamp(amount, 0, 1);
  uniforms.uCharEmber.value = THREE.MathUtils.clamp(ember, 0, 1);
  uniforms.uCharTime.value = time;
}
