import * as THREE from 'three';
import type { MuzzleFlareConfig } from './WeaponTypes';

/** Which part of the flame a vertex belongs to; read by the shader. */
const SHAPE = { burst: 0, tongue: 1, vent: 2 } as const;
/** The rounded core clears the barrel face and stretches forward with the gas. */
const BURST_AHEAD = 0.65;
const BURST_DEPTH = 0.5;
/** Per-shot spread of the flame's size and length. */
const SIZE_JITTER = 0.1;
const LENGTH_JITTER = 0.15;
/** Fraction of the shot light left when the flare ends. */
const LIGHT_TAIL = 0.04;

/** Colour of the shot's light pulse: the hot core, not the orange fringe. */
export const FLARE_LIGHT_COLOR = 0xffb870;

/** Look of a flare at `progress` (0 at the shot, 1 at its end). */
export interface FlareEnvelope {
  /** Overall strength, 1 → 0. */
  fade: number;
  /** 1 white-hot → cooler orange as the gas expands. */
  heat: number;
  /** Length along the barrel relative to the shot's own. */
  stretch: number;
}

/** Bright at once, then cooling and dying fast while the gas pushes forward. */
export function flareEnvelope(progress: number, out: FlareEnvelope = { fade: 0, heat: 0, stretch: 0 }): FlareEnvelope {
  const p = THREE.MathUtils.clamp(progress, 0, 1);
  out.fade = Math.pow(1 - p, 2.1);
  out.heat = 1 - p * 0.8;
  out.stretch = 0.85 + Math.sqrt(p) * 0.3;
  return out;
}

/** Exponential decay rate that leaves `LIGHT_TAIL` of the shot light when a flare of `duration` ends. */
export function flareLightDecay(duration: number): number {
  return -Math.log(LIGHT_TAIL) / duration;
}

class FlareGeometryBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly shapes: number[] = [];
  private readonly phases: number[] = [];
  private readonly indices: number[] = [];

  /** Small rounded crown volume; projected UVs retain an irregular soft flame edge. */
  public burst(radius: number): void {
    const base = this.positions.length / 3;
    const rings = 6;
    const segments = 12;
    for (let ring = 0; ring <= rings; ring++) {
      const latitude = ring / rings * Math.PI;
      const radial = Math.sin(latitude);
      for (let segment = 0; segment <= segments; segment++) {
        const angle = segment / segments * Math.PI * 2;
        const x = Math.cos(angle) * radial;
        const y = Math.sin(angle) * radial;
        const z = Math.cos(latitude);
        this.positions.push(x * radius, y * radius, -radius * (BURST_AHEAD + z * BURST_DEPTH));
        const normal = new THREE.Vector3(x, y, -z / BURST_DEPTH).normalize();
        this.normals.push(normal.x, normal.y, normal.z);
        this.uvs.push(x * 0.5 + 0.5, y * 0.5 + 0.5);
        this.shapes.push(SHAPE.burst);
        this.phases.push(0);
        if (ring === rings || segment === segments) continue;
        const a = base + ring * (segments + 1) + segment;
        const b = a + segments + 1;
        this.indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }

  /**
   * One quad. `origin` is where its UV x is 0 (the root of the flame), `along`
   * runs to the tip and `across` spans the full width, centred on `origin`.
   */
  public quad(origin: THREE.Vector3, along: THREE.Vector3, across: THREE.Vector3, shape: number, phase: number): void {
    const base = this.positions.length / 3;
    const normal = new THREE.Vector3().crossVectors(along, across).normalize();
    const corners: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const [u, v] of corners) {
      const point = origin.clone().addScaledVector(along, u).addScaledVector(across, v - 0.5);
      this.positions.push(point.x, point.y, point.z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.uvs.push(u, v);
      this.shapes.push(shape);
      this.phases.push(phase);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  public build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute('aShape', new THREE.Float32BufferAttribute(this.shapes, 1));
    geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.phases, 1));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

/**
 * The flame as one mesh, forward along -Z from the crown at the origin: a
 * rounded core at the crown (what the shooter mostly sees), soft
 * tongues fanned around the barrel axis and, for a muzzle brake, jets
 * thrown out to both sides from behind the crown.
 */
export function buildFlareGeometry(config: MuzzleFlareConfig): THREE.BufferGeometry {
  const builder = new FlareGeometryBuilder();
  builder.burst(config.burst);
  const forward = new THREE.Vector3(0, 0, -config.length);
  for (let tongue = 0; tongue < config.tongues; tongue++) {
    const angle = (tongue / config.tongues) * Math.PI;
    const across = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(config.width);
    builder.quad(new THREE.Vector3(), forward, across, SHAPE.tongue, tongue + 1);
  }
  if (config.vents) {
    const { offset, length, spread, behind } = config.vents;
    for (const side of [-1, 1]) {
      const origin = new THREE.Vector3(side * offset, 0, behind);
      const outward = new THREE.Vector3(side * length, 0, 0);
      builder.quad(origin, outward, new THREE.Vector3(0, 0, spread), SHAPE.vent, side + 7);
      builder.quad(origin, outward, new THREE.Vector3(0, spread, 0), SHAPE.vent, side + 11);
    }
  }
  return builder.build();
}

const VERTEX = /* glsl */ `
attribute float aShape;
attribute float aPhase;
varying vec2 vUv;
varying float vShape;
varying float vPhase;
varying float vFacing;
#include <common>
void main() {
  vUv = uv;
  vShape = aShape;
  vPhase = aPhase;
  #include <begin_vertex>
  #include <project_vertex>
  // Sheets seen edge-on fade out instead of showing as lines.
  vFacing = abs(dot(normalize(normalMatrix * normal), normalize(-mvPosition.xyz)));
}
`;

const FRAGMENT = /* glsl */ `
uniform float uSeed;
uniform float uFade;
uniform float uHeat;
uniform float uBrightness;
uniform float uProgress;
uniform vec3 uTint;
varying vec2 vUv;
varying float vShape;
varying float vPhase;
varying float vFacing;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 blend = fract(p);
  blend = blend * blend * (3.0 - 2.0 * blend);
  return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), blend.x),
    mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), blend.x), blend.y);
}

/** 0 deep orange fringe -> 1 white-yellow core. */
vec3 flameColor(float heat) {
  vec3 fringe = vec3(1.0, 0.3, 0.05);
  vec3 body = vec3(1.0, 0.62, 0.22);
  vec3 core = vec3(1.0, 0.93, 0.74);
  return mix(mix(fringe, body, smoothstep(0.0, 0.5, heat)), core, smoothstep(0.5, 1.0, heat));
}

void main() {
  float density;
  float heat;
  if (vShape < 0.5) {
    // Burst: a hot core and a few uneven petals; the seed reshapes them every shot.
    vec2 p = vUv * 2.0 - 1.0;
    float radius = length(p);
    float angle = atan(p.y, p.x);
    vec2 around = vec2(cos(angle), sin(angle)) * 1.6 + uSeed + uProgress * vec2(1.7, -2.1);
    float reach = 0.3 + 0.6 * noise(around) * (0.55 + 0.45 * noise(around * 2.7 + 5.0));
    float petals = 1.0 - smoothstep(reach * 0.45, reach, radius);
    float core = exp(-radius * radius * 28.0);
    density = max(petals * 0.7, core);
    heat = clamp(core + petals * (0.6 - radius * 0.5), 0.0, 1.0);
  } else {
    // Tongue or vent: x runs from the root to the tip, y across the sheet.
    float along = vUv.x;
    float across = abs(vUv.y * 2.0 - 1.0);
    vec2 seed = vec2(vPhase * 7.31 + uSeed - uProgress * 2.0, vPhase * 3.17 - uSeed + uProgress * 1.3);
    float wobble = noise(vec2(along * 6.0, vUv.y * 2.5) + seed);
    float profile = sin(3.14159 * pow(along, 0.55)) * (0.55 + 0.6 * wobble);
    float sheet = 1.0 - smoothstep(profile * 0.35, profile, across);
    float tip = 0.55 + 0.4 * hash(seed);
    density = sheet * (1.0 - smoothstep(tip * 0.6, tip, along));
    heat = clamp((1.0 - along * 1.4) * (1.0 - across * 0.8) + 0.15, 0.0, 1.0);
  }
  density *= smoothstep(0.05, 0.45, vFacing);
  float alpha = density * uFade;
  if (alpha < 0.002) discard;
  float level = heat * uHeat;
  gl_FragColor = vec4(flameColor(level) * uTint * uBrightness * (0.3 + 0.7 * level), alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Gunpowder flame of the top quality tier, a child of the muzzle with
 * forward along -Z. One mesh and one material for the weapon's lifetime; a
 * shot only moves uniforms, the roll and the scale, so full auto allocates
 * nothing and compiles nothing.
 */
export class MuzzleFlare {
  public readonly root = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private remaining = 0;
  /** The shot landed this frame: its first update shows it at full strength. */
  private fresh = false;
  private shotSize = 1;
  private shotLength = 1;
  private readonly envelope: FlareEnvelope = { fade: 0, heat: 0, stretch: 0 };

  public constructor(private readonly config: MuzzleFlareConfig, private readonly random: () => number = Math.random) {
    this.material = new THREE.ShaderMaterial({
      name: 'muzzle-flare',
      uniforms: {
        uSeed: { value: 0 },
        uFade: { value: 0 },
        uHeat: { value: 1 },
        uBrightness: { value: config.brightness },
        uProgress: { value: 0 },
        uTint: { value: new THREE.Color(0xffffff) },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      // Alpha compositing bounds overlapping HDR sheets instead of adding them into a white halo.
      blending: THREE.NormalBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    });
    const mesh = new THREE.Mesh(buildFlareGeometry(config), this.material);
    mesh.name = 'muzzle-flare-mesh';
    mesh.frustumCulled = false;
    this.root.name = 'muzzle-flare';
    this.root.add(mesh);
    this.root.visible = false;
  }

  /** Multiplies the flame's colours (white keeps them): a finish retints its flare. */
  public setTint(color: number): void {
    (this.material.uniforms.uTint.value as THREE.Color).setHex(color);
  }

  public trigger(): void {
    this.remaining = this.config.duration;
    this.fresh = true;
    this.material.uniforms.uSeed.value = this.random() * 64;
    const roll = this.random() * Math.PI * 2;
    // Brake ports belong to the barrel; their side jets must not roll into vertical flares.
    this.root.rotation.z = this.config.vents ? 0 : roll;
    this.shotSize = 1 + (this.random() * 2 - 1) * SIZE_JITTER;
    this.shotLength = this.shotSize * (1 + (this.random() * 2 - 1) * LENGTH_JITTER);
    this.apply(0);
    this.root.visible = true;
  }

  public update(dt: number): void {
    if (this.remaining <= 0) return;
    if (this.fresh) {
      this.fresh = false;
      return;
    }
    this.remaining -= dt;
    if (this.remaining <= 1e-6) {
      this.reset();
      return;
    }
    this.apply(1 - this.remaining / this.config.duration);
  }

  public reset(): void {
    this.remaining = 0;
    this.fresh = false;
    this.root.visible = false;
  }

  private apply(progress: number): void {
    const envelope = flareEnvelope(progress, this.envelope);
    this.material.uniforms.uProgress.value = progress;
    this.material.uniforms.uFade.value = envelope.fade;
    this.material.uniforms.uHeat.value = envelope.heat;
    this.root.scale.set(this.shotSize, this.shotSize, this.shotLength * envelope.stretch);
  }
}
