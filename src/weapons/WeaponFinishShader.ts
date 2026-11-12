import * as THREE from 'three';

/**
 * A cosmic nebula drifting through a weapon's body: deep violet depths,
 * glowing clouds, pale wisps and veins, and twinkling stars. Colours are
 * hex; `scale` is cloud features per metre of weapon, `flow` how fast the
 * matter drifts, `glowStrength` how much of it shines with its own light.
 */
export interface WeaponNebula {
  readonly deep: number;
  readonly body: number;
  readonly glow: number;
  readonly wisp: number;
  readonly scale: number;
  readonly flow: number;
  readonly glowStrength: number;
}

/**
 * Uniforms one weapon's finished materials share: the finish's clock, the
 * weapon frame (inverse of the weapon root's world matrix, so the pattern
 * is continuous across parts and sticks to the gun however it moves), and
 * the paint transition: how far it has spread (`reveal` 0..1) and the
 * `sweep` that maps a point of the weapon frame to 0..1 along the weapon.
 */
export interface WeaponFinishFrame {
  readonly time: THREE.IUniform<number>;
  readonly frame: THREE.IUniform<THREE.Matrix4>;
  readonly reveal: THREE.IUniform<number>;
  readonly sweep: THREE.IUniform<THREE.Vector4>;
}

export type WeaponFinishUniforms = Record<string, THREE.IUniform>;

/**
 * Which shader one finished material gets: the nebula on the body or the
 * polished trim colour on bright steel; `paint` spreads it over the weapon
 * with `reveal` instead of wearing it whole; `reducedEffects` drops the
 * nebula's domain warp, which halves its noise lookups.
 */
export interface WeaponFinishVariant {
  readonly role: 'body' | 'trim';
  readonly paint: boolean;
  readonly reducedEffects: boolean;
}

export function createWeaponFinishUniforms(
  nebula: WeaponNebula,
  trim: number,
  shared: WeaponFinishFrame,
): WeaponFinishUniforms {
  return {
    uFinishTime: shared.time,
    uFinishFrame: shared.frame,
    uFinishReveal: shared.reveal,
    uFinishSweep: shared.sweep,
    uFinishDeep: { value: new THREE.Color(nebula.deep) },
    uFinishBody: { value: new THREE.Color(nebula.body) },
    uFinishGlow: { value: new THREE.Color(nebula.glow) },
    uFinishWisp: { value: new THREE.Color(nebula.wisp) },
    uFinishTrim: { value: new THREE.Color(trim) },
    uFinishScale: { value: nebula.scale },
    uFinishFlow: { value: nebula.flow },
    uFinishGlowStrength: { value: nebula.glowStrength },
  };
}

/** Program cache suffix of a variant, appended to the original material's key. */
export function weaponFinishProgramKey(variant: WeaponFinishVariant): string {
  return `finish:${variant.role}${variant.paint ? ':paint' : ''}${variant.reducedEffects ? ':reduced' : ''}`;
}

const VERTEX_HEADER = /* glsl */ `
uniform mat4 uFinishFrame;
varying highp vec3 vFinishCoord;`;

const VERTEX_COORD = /* glsl */ `
vFinishCoord = (uFinishFrame * modelMatrix * vec4(transformed, 1.0)).xyz;`;

/**
 * Value noise in highp: mobile fragment shaders default to mediump, where
 * the hash would band. Two noise lookups warp the domain into swirls (full
 * effects only), four octaves shape the clouds and one ridged lookup draws
 * the veins; stars come from a hashed grid, without noise. The paint front
 * is one more lookup that frays its edge, and only exists while painting.
 */
const FRAGMENT_HEADER = /* glsl */ `
uniform highp float uFinishTime;
uniform highp float uFinishReveal;
uniform highp vec4 uFinishSweep;
uniform vec3 uFinishDeep;
uniform vec3 uFinishBody;
uniform vec3 uFinishGlow;
uniform vec3 uFinishWisp;
uniform vec3 uFinishTrim;
uniform float uFinishScale;
uniform float uFinishFlow;
uniform float uFinishGlowStrength;
varying highp vec3 vFinishCoord;

#ifdef FINISH_TRIM
const float FINISH_METALNESS = 0.9;
const float FINISH_ROUGHNESS = 0.28;
#else
const float FINISH_METALNESS = 0.2;
const float FINISH_ROUGHNESS = 0.32;
#endif

highp float finishHash(highp vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

highp float finishNoise(highp vec3 x) {
  highp vec3 i = floor(x);
  highp vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(finishHash(i), finishHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(finishHash(i + vec3(0.0, 1.0, 0.0)), finishHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(finishHash(i + vec3(0.0, 0.0, 1.0)), finishHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(finishHash(i + vec3(0.0, 1.0, 1.0)), finishHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

highp float finishFbm(highp vec3 p) {
  highp float value = 0.0;
  highp float amplitude = 0.5;
  for (int octave = 0; octave < 4; octave++) {
    value += amplitude * finishNoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amplitude *= 0.5;
  }
  return value;
}

vec3 finishNebula(highp vec3 coord, out vec3 glow) {
  highp vec3 p = coord * uFinishScale;
  highp float t = uFinishTime * uFinishFlow;
#ifdef FINISH_WARP
  highp vec2 swirl = vec2(
    finishNoise(p * 0.7 + vec3(0.0, 0.0, t)),
    finishNoise(p * 0.7 + vec3(5.2, 1.3, -t)));
  p += vec3(swirl.x, swirl.y, swirl.x - swirl.y) * 1.6 - 0.8;
#endif
  highp float n = finishFbm(p + vec3(t * 0.6, -t * 0.35, t * 0.2));
  float body = smoothstep(0.30, 0.56, n);
  float cloud = smoothstep(0.48, 0.70, n);
  float wisp = smoothstep(0.60, 0.80, n);
  float ridge = 1.0 - abs(finishNoise(p * 2.6 - vec3(t)) * 2.0 - 1.0);
  float vein = pow(ridge, 12.0) * cloud;
  vec3 color = mix(uFinishDeep, uFinishBody, body);
  color = mix(color, uFinishGlow, cloud * 0.85);
  color = mix(color, uFinishWisp, clamp(wisp * 0.6 + vein, 0.0, 1.0));

  highp vec3 starCoord = coord * uFinishScale * 9.0;
  highp float starSeed = finishHash(floor(starCoord) + vec3(11.0, 23.0, 37.0));
  float star = step(0.9, starSeed) * (1.0 - smoothstep(0.0, 0.35, length(fract(starCoord) - 0.5)));
  star *= 0.6 + 0.4 * sin(uFinishTime * (1.5 + starSeed * 4.0) + starSeed * 60.0);

  glow = (color * (0.25 + 0.75 * cloud) + uFinishWisp * (vein * 0.8 + star * 1.8)) * uFinishGlowStrength;
  return color;
}

#ifdef FINISH_PAINT
// How far behind the paint front a point lies, in weapon lengths: positive
// where the finish has reached. The front starts just before the weapon and
// ends just past it, frayed by noise that boils as it moves.
float finishPaintFront(highp vec3 coord) {
  highp float along = dot(coord, uFinishSweep.xyz) + uFinishSweep.w;
  float frayed = (finishNoise(coord * uFinishScale * 3.0 + vec3(0.0, uFinishTime * 0.5, 0.0)) - 0.5) * 0.12;
  return uFinishReveal * 1.2 - 0.1 - along - frayed;
}
#endif`;

/** Finish colour over the original, wherever the finish has reached. */
const FRAGMENT_COLOR = /* glsl */ `
vec3 finishGlow = vec3(0.0);
#ifdef FINISH_TRIM
vec3 finishColor = uFinishTrim;
#else
vec3 finishColor = finishNebula(vFinishCoord, finishGlow);
#endif
#ifdef FINISH_PAINT
float finishFront = finishPaintFront(vFinishCoord);
float finishMask = smoothstep(-0.008, 0.008, finishFront);
float finishEdge = (1.0 - smoothstep(0.0, 0.045, abs(finishFront)))
  * smoothstep(0.0, 0.04, uFinishReveal) * (1.0 - smoothstep(0.96, 1.0, uFinishReveal));
#else
float finishMask = 1.0;
float finishEdge = 0.0;
#endif
diffuseColor.rgb = mix(diffuseColor.rgb, finishColor, finishMask);
finishGlow *= finishMask;`;

/** Glossy cosmic paint on the body, polished steel on the trim. */
const FRAGMENT_SURFACE = /* glsl */ `
metalnessFactor = mix(metalnessFactor, FINISH_METALNESS, finishMask);
roughnessFactor = mix(roughnessFactor, FINISH_ROUGHNESS, finishMask);`;

/**
 * The finish's own light replaces the original's: the nebula's glow and a
 * rim along the silhouette that reads as charge; the paint front burns
 * bright where it is spreading.
 */
const FRAGMENT_EMISSIVE = /* glsl */ `
totalEmissiveRadiance *= 1.0 - finishMask;
totalEmissiveRadiance += finishGlow;
#ifndef FINISH_TRIM
float finishRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
totalEmissiveRadiance += uFinishGlow * finishRim * 0.5 * uFinishGlowStrength * finishMask;
#endif
totalEmissiveRadiance += uFinishWisp * finishEdge * 2.5;`;

function inject(source: string, anchor: string, code: string): string {
  if (!source.includes(anchor)) throw new Error(`Weapon finish: shader chunk ${anchor} not found`);
  return source.replace(anchor, `${anchor}\n${code}`);
}

function variantDefines(variant: WeaponFinishVariant): string {
  const defines: string[] = [];
  if (variant.role === 'trim') defines.push('#define FINISH_TRIM');
  else if (!variant.reducedEffects) defines.push('#define FINISH_WARP');
  if (variant.paint) defines.push('#define FINISH_PAINT');
  return defines.join('\n');
}

/**
 * Turns a standard material's shader into a weapon finish. Runs after the
 * material's own patches (the view model's depth range) and keeps the
 * original look wherever a painting finish has not reached yet.
 */
export function patchWeaponFinishShader(
  shader: THREE.WebGLProgramParametersWithUniforms,
  uniforms: WeaponFinishUniforms,
  variant: WeaponFinishVariant,
): void {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = inject(shader.vertexShader, '#include <common>', VERTEX_HEADER);
  shader.vertexShader = inject(shader.vertexShader, '#include <project_vertex>', VERTEX_COORD);
  shader.fragmentShader = inject(shader.fragmentShader, '#include <common>', `${variantDefines(variant)}\n${FRAGMENT_HEADER}`);
  shader.fragmentShader = inject(shader.fragmentShader, '#include <color_fragment>', FRAGMENT_COLOR);
  shader.fragmentShader = inject(shader.fragmentShader, '#include <metalnessmap_fragment>', FRAGMENT_SURFACE);
  shader.fragmentShader = inject(shader.fragmentShader, '#include <emissivemap_fragment>', FRAGMENT_EMISSIVE);
}
