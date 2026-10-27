import * as THREE from 'three';
import { FlameParticles } from './FlameParticles';

/**
 * The pressurised rod of fuel leaving the nozzle: radius at the nozzle and
 * where it breaks up, and how far it stays coherent before the rolling
 * fire (FlameParticles) takes over.
 */
const NOZZLE_RADIUS = 0.045;
const ROD_RADIUS = 0.3;
const ROD_LENGTH = 3.4;
/** The pale core: a narrow white-blue cone inside the rod. */
const CORE_LENGTH_SHARE = 0.55;
const CORE_WIDTH_SHARE = 0.38;
/** Crimson arcane ribbons of the core crystal, spiralling round the rod and out into the fire. */
const HELIX_RIBBONS = 2;
const HELIX_LENGTH_SHARE = 1.5;
/** How fast the rod shoots out to its reach, and how fast a cut rod's tail runs off, m/s. */
const GROWTH_SPEED = 55;
const TAIL_SPEED = 30;
const IGNITE_RATE = 16;
const FADE_RATE = 6;

const STREAM_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform float uWidth;
  uniform float uNozzle;
  varying float vAlong;
  varying float vAngle;
  varying float vFacing;
  void main() {
    float t = clamp(-position.z, 0.0, 1.0);
    vec2 radial = normalize(position.xy + vec2(1e-5));
    float wobble = sin(t * 11.0 - uTime * 31.0 + radial.x * 3.0) * 0.14 + sin(t * 23.0 - uTime * 47.0 + radial.y * 5.0) * 0.08;
    float radius = (uNozzle + (uWidth - uNozzle) * pow(t, 0.8)) * (1.0 + wobble * t);
    vec3 local = vec3(radial * radius, -t * uLength);
    vAlong = t;
    vAngle = atan(radial.y, radial.x);
    vec4 view = modelViewMatrix * vec4(local, 1.0);
    vec3 normal = normalize(normalMatrix * vec3(radial, 0.0));
    vFacing = abs(dot(normal, normalize(-view.xyz)));
    gl_Position = projectionMatrix * view;
  }
`;

/**
 * Racing fire along the rod: fast scrolling noise, dense in the middle and
 * soft at the edge. The core burns blue-white to gold; the body runs gold
 * to orange and frays out at its end, where the rolling fire takes over.
 */
const STREAM_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform float uIntensity;
  uniform float uTail;
  uniform float uCore;
  varying float vAlong;
  varying float vAngle;
  varying float vFacing;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    if (vAlong < uTail) discard;
    float distance = vAlong * uLength;
    float flow = noise(vec2(vAngle * 2.0, distance * 3.0 - uTime * 30.0)) * 0.6
      + noise(vec2(vAngle * 5.0 + 3.0, distance * 7.0 - uTime * 46.0)) * 0.4;
    float density = pow(vFacing, 1.2) * (0.5 + 0.8 * flow);
    density *= smoothstep(0.0, 0.04, vAlong - uTail) * (1.0 - smoothstep(0.6, 1.0, vAlong + (flow - 0.5) * 0.35));
    vec3 color;
    if (uCore > 0.5) {
      color = mix(vec3(0.7, 0.85, 1.0), vec3(1.0, 0.95, 0.75), smoothstep(0.05, 0.6, vAlong)) * 1.6;
    } else {
      color = mix(vec3(1.0, 0.86, 0.45), vec3(1.0, 0.46, 0.08), smoothstep(0.1, 0.8, vAlong)) * 1.25;
    }
    gl_FragColor = vec4(color * density, uIntensity);
  }
`;

/** A flat ribbon along -Z twisted into a widening helix round the rod. */
const HELIX_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uLength;
  uniform float uPhase;
  varying float vAlong;
  varying float vAcross;
  void main() {
    float t = clamp(-position.z, 0.0, 1.0);
    float angle = t * 15.0 - uTime * 14.0 + uPhase;
    float radius = 0.05 + t * 0.42;
    vec3 center = vec3(cos(angle) * radius, sin(angle) * radius, -t * uLength);
    vec3 across = vec3(-sin(angle), cos(angle), 0.0);
    vAlong = t;
    vAcross = position.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(center + across * position.x * (0.02 + t * 0.06), 1.0);
  }
`;

const HELIX_FRAGMENT = /* glsl */ `
  uniform float uIntensity;
  uniform float uTail;
  uniform float uTime;
  varying float vAlong;
  varying float vAcross;
  void main() {
    if (vAlong < uTail) discard;
    float edge = 1.0 - abs(vAcross) * 2.0;
    float pulse = 0.65 + 0.35 * sin(vAlong * 40.0 - uTime * 25.0);
    float fade = smoothstep(0.0, 0.06, vAlong - uTail) * (1.0 - smoothstep(0.45, 1.0, vAlong));
    vec3 color = mix(vec3(1.0, 0.75, 0.7), vec3(1.0, 0.08, 0.12), smoothstep(0.0, 0.25, 1.0 - edge));
    gl_FragColor = vec4(color * edge * edge * pulse * fade * 1.6, uIntensity);
  }
`;

const additive = {
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
  forceSinglePass: true,
} as const;

function streamMaterial(core: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: core ? 'flame_jet_core' : 'flame_jet_rod',
    uniforms: {
      uTime: { value: 0 },
      uLength: { value: 1 },
      uWidth: { value: core ? ROD_RADIUS * CORE_WIDTH_SHARE : ROD_RADIUS },
      uNozzle: { value: core ? NOZZLE_RADIUS * 0.55 : NOZZLE_RADIUS },
      uIntensity: { value: 0 },
      uTail: { value: 0 },
      uCore: { value: core ? 1 : 0 },
    },
    vertexShader: STREAM_VERTEX,
    fragmentShader: STREAM_FRAGMENT,
    ...additive,
  });
}

/**
 * World-space stream of the ФАКЕЛ-33, a magic flamethrower: a white-hot
 * pressurised rod with a blue-white core leaves the nozzle wrapped in two
 * crimson ribbons of the core crystal's power, and breaks up into rolling
 * fireballs that keep the aim they left with (sweeping bends the fire into
 * a lagging arc), swell and climb at the end of the reach, splash across a
 * wall that cuts it, shed smoke and spit sparks (FlameParticles). Ignition
 * throws a fireball out of the nozzle. Six draw calls while it burns, none
 * once everything has died out; no lights (the shell's muzzle light
 * flickers with it).
 */
export class FlameJet {
  readonly group = new THREE.Group();
  private readonly rod = new THREE.Group();
  private readonly body: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly core: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly helices: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  private readonly particles: FlameParticles;
  private intensity = 0;
  private length = 0;
  private tail = 0;
  private time = 0;
  private fed = false;
  private readonly aim = new THREE.Vector3();
  private readonly look = new THREE.Vector3();

  constructor(reduced = false) {
    // Unit cone along -Z, open at both ends; the shader shapes radius and length.
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 16, 20, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
    this.body = new THREE.Mesh(geometry, streamMaterial(false));
    this.core = new THREE.Mesh(geometry, streamMaterial(true));
    this.core.renderOrder = 1;
    // A ribbon: across in X, along -Z, densely cut so the twist stays smooth.
    const ribbon = new THREE.PlaneGeometry(1, 1, 1, 64).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
    for (let index = 0; index < HELIX_RIBBONS; index++) {
      const helix = new THREE.Mesh(ribbon, new THREE.ShaderMaterial({
        name: 'flame_jet_arcane_helix',
        uniforms: {
          uTime: { value: 0 }, uLength: { value: 1 }, uPhase: { value: (index / HELIX_RIBBONS) * Math.PI * 2 },
          uIntensity: { value: 0 }, uTail: { value: 0 },
        },
        vertexShader: HELIX_VERTEX,
        fragmentShader: HELIX_FRAGMENT,
        ...additive,
      }));
      helix.renderOrder = 2;
      this.helices.push(helix);
    }
    for (const mesh of [this.body, this.core, ...this.helices]) mesh.frustumCulled = false;
    this.rod.name = 'flame-jet-rod';
    this.rod.add(this.body, this.core, ...this.helices);
    this.particles = new FlameParticles(reduced);
    this.group.name = 'flame-jet';
    this.group.add(this.rod, this.particles.group);
    this.reset();
  }

  /** True while any of the fire is still visible. */
  get burning(): boolean {
    return this.rod.visible || this.particles.aliveCount > 0;
  }

  /**
   * Advances the stream from `origin` (the nozzle) towards `target` (its full
   * reach, or the wall that cuts it, `blocked`). `active` is the trigger
   * keeping it fed.
   */
  update(dt: number, active: boolean, origin: THREE.Vector3, target: THREE.Vector3, blocked = false): void {
    this.time += dt;
    this.aim.subVectors(target, origin);
    const reach = this.aim.length();
    if (reach > 1e-4) this.aim.divideScalar(reach);
    const wall = blocked ? reach : Infinity;
    if (active && !this.fed) this.particles.ignite(origin, this.aim, wall);
    if (active) this.particles.emit(dt, origin, this.aim, wall);
    this.fed = active;
    this.particles.update(dt);
    this.updateRod(dt, active, origin, Math.min(reach, ROD_LENGTH));
  }

  reset(): void {
    this.intensity = 0;
    this.length = 0;
    this.tail = 0;
    this.fed = false;
    this.rod.visible = false;
    this.particles.reset();
  }

  dispose(): void {
    this.body.geometry.dispose();
    this.body.material.dispose();
    this.core.material.dispose();
    this.helices[0]?.geometry.dispose();
    for (const helix of this.helices) helix.material.dispose();
    this.particles.dispose();
  }

  private updateRod(dt: number, active: boolean, origin: THREE.Vector3, reach: number): void {
    if (active) {
      this.intensity = Math.min(1, this.intensity + IGNITE_RATE * dt);
      this.length = Math.min(reach, this.length + GROWTH_SPEED * dt);
      this.tail = 0;
    } else {
      this.intensity = Math.max(0, this.intensity - FADE_RATE * dt);
      if (this.length > 0) this.tail = Math.min(1, this.tail + (TAIL_SPEED * dt) / Math.max(0.5, this.length));
    }
    if (this.intensity <= 0.001 || this.tail >= 1 || this.length <= 0.01) {
      this.rod.visible = false;
      if (!active) {
        this.length = 0;
        this.tail = 0;
      }
      return;
    }
    this.rod.visible = true;
    this.rod.position.copy(origin);
    this.rod.lookAt(this.look.copy(origin).sub(this.aim));
    // The fire breathes: a fast, uneven flicker, never a steady glow.
    const flicker = 0.82 + Math.random() * 0.18;
    for (const [mesh, share] of [[this.body, 1], [this.core, CORE_LENGTH_SHARE]] as const) {
      const uniforms = mesh.material.uniforms;
      uniforms.uTime.value = this.time;
      uniforms.uLength.value = this.length * share;
      uniforms.uIntensity.value = this.intensity * flicker;
      uniforms.uTail.value = this.tail;
    }
    for (const helix of this.helices) {
      const uniforms = helix.material.uniforms;
      uniforms.uTime.value = this.time;
      uniforms.uLength.value = this.length * HELIX_LENGTH_SHARE;
      uniforms.uIntensity.value = this.intensity * (0.7 + Math.random() * 0.3);
      uniforms.uTail.value = this.tail;
    }
  }
}
