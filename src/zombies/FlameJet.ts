import * as THREE from 'three';
import { makeSoftDotTexture } from './doors/BuyableDoorVisual';

/** Radius of the stream at the nozzle and at full reach, metres. */
const NOZZLE_RADIUS = 0.05;
const END_RADIUS = 1.05;
/** The pale core: a short, narrow cone inside the body. */
const CORE_LENGTH_SHARE = 0.3;
const CORE_WIDTH_SHARE = 0.32;
/** How fast the stream shoots out to its reach, and how fast a cut stream's tail runs off, m/s. */
const GROWTH_SPEED = 42;
const TAIL_SPEED = 26;
const IGNITE_RATE = 14;
const FADE_RATE = 5;
/** Rolling puffs where the stream breaks up (or splashes on a wall). */
const BILLOWS = 10;
const BILLOW_SIZE = 0.95;
const BILLOW_LIFE = 0.45;

const VERTEX_SHADER = /* glsl */ `
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
    float wobble = sin(t * 9.0 - uTime * 21.0 + radial.x * 3.0) * 0.12 + sin(t * 17.0 - uTime * 33.0 + radial.y * 5.0) * 0.07;
    float radius = (uNozzle + (uWidth - uNozzle) * pow(t, 0.72)) * (1.0 + wobble * t);
    // The stream sags and curls a little as it slows.
    vec3 local = vec3(radial * radius, -t * uLength);
    local.y += sin(t * 3.1 - uTime * 4.0) * 0.06 * t * t;
    vAlong = t;
    vAngle = atan(radial.y, radial.x);
    vec4 view = modelViewMatrix * vec4(local, 1.0);
    vec3 normal = normalize(normalMatrix * vec3(radial, 0.0));
    vFacing = abs(dot(normal, normalize(-view.xyz)));
    gl_Position = projectionMatrix * view;
  }
`;

/**
 * Flowing fire: value noise scrolled along the stream, dense in the middle
 * of the cone and soft at its silhouette. The core shader keeps a pale blue
 * root; the body runs from yellow to orange and a smoky red at its end.
 */
const FRAGMENT_SHADER = /* glsl */ `
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
    float flow = noise(vec2(vAngle * 2.0, distance * 2.2 - uTime * 16.0)) * 0.65
      + noise(vec2(vAngle * 5.0 + 3.0, distance * 5.0 - uTime * 27.0)) * 0.35;
    float density = pow(vFacing, 1.4) * (0.45 + 0.75 * flow);
    density *= smoothstep(0.0, 0.05, vAlong - uTail) * (1.0 - smoothstep(0.72, 1.0, vAlong + (flow - 0.5) * 0.25));
    vec3 color;
    if (uCore > 0.5) {
      color = mix(vec3(0.62, 0.78, 1.0), vec3(1.0, 0.86, 0.55), smoothstep(0.1, 0.9, vAlong));
      density *= 1.0 - smoothstep(0.5, 1.0, vAlong);
    } else {
      color = mix(vec3(1.0, 0.78, 0.34), vec3(1.0, 0.42, 0.08), smoothstep(0.08, 0.55, vAlong));
      color = mix(color, vec3(0.45, 0.1, 0.03), smoothstep(0.6, 1.0, vAlong));
    }
    gl_FragColor = vec4(color * density, uIntensity);
  }
`;

function streamMaterial(core: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: core ? 'flame_jet_core' : 'flame_jet_body',
    uniforms: {
      uTime: { value: 0 },
      uLength: { value: 1 },
      uWidth: { value: END_RADIUS },
      uNozzle: { value: NOZZLE_RADIUS },
      uIntensity: { value: 0 },
      uTail: { value: 0 },
      uCore: { value: core ? 1 : 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
}

/**
 * World-space flame stream of a flamethrower (ФАКЕЛ-33): a widening cone
 * of flowing fire from the nozzle to its reach, a pale blue-white core at
 * its root and a few rolling puffs where it breaks up or splashes on a
 * wall. Three draw calls while it burns, none once it has died out; no
 * lights (the shell's muzzle light flickers with it). It shoots out on
 * ignition and, when cut, its tail runs off and fades instead of vanishing.
 */
export class FlameJet {
  readonly group = new THREE.Group();
  private readonly body: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly core: THREE.Mesh<THREE.CylinderGeometry, THREE.ShaderMaterial>;
  private readonly billows: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly billowPositions: Float32Array;
  private readonly billowColors: Float32Array;
  private readonly billowAge = new Float32Array(BILLOWS);
  private readonly billowDrift = new Float32Array(BILLOWS * 3);
  private intensity = 0;
  private length = 0;
  private tail = 0;
  private time = 0;
  private readonly end = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();

  constructor() {
    // Unit cone along -Z, open at both ends; the shader shapes radius and length.
    const geometry = new THREE.CylinderGeometry(1, 1, 1, 14, 18, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5);
    this.body = new THREE.Mesh(geometry, streamMaterial(false));
    this.core = new THREE.Mesh(geometry, streamMaterial(true));
    this.core.material.uniforms.uWidth.value = END_RADIUS * CORE_WIDTH_SHARE;
    this.core.material.uniforms.uNozzle.value = NOZZLE_RADIUS * 0.6;
    this.core.renderOrder = 1;
    for (const mesh of [this.body, this.core]) mesh.frustumCulled = false;

    this.billowPositions = new Float32Array(BILLOWS * 3);
    this.billowColors = new Float32Array(BILLOWS * 3);
    const billowGeometry = new THREE.BufferGeometry();
    billowGeometry.setAttribute('position', new THREE.BufferAttribute(this.billowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    billowGeometry.setAttribute('color', new THREE.BufferAttribute(this.billowColors, 3).setUsage(THREE.DynamicDrawUsage));
    this.billows = new THREE.Points(billowGeometry, new THREE.PointsMaterial({
      name: 'flame_jet_billows',
      size: BILLOW_SIZE,
      map: typeof document === 'undefined' ? null : makeSoftDotTexture(),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    this.billows.frustumCulled = false;
    for (let index = 0; index < BILLOWS; index++) this.billowAge[index] = (index / BILLOWS) * BILLOW_LIFE;

    this.group.name = 'flame-jet';
    this.group.add(this.body, this.core, this.billows);
    this.group.visible = false;
  }

  /** True while any of the stream is still visible. */
  get burning(): boolean {
    return this.group.visible;
  }

  /**
   * Places the stream from `origin` (the nozzle) towards `target` (where
   * it ends: its full reach, or the wall that cuts it) and advances it.
   * `active` is the trigger keeping the stream fed.
   */
  update(dt: number, active: boolean, origin: THREE.Vector3, target: THREE.Vector3): void {
    this.time += dt;
    const reach = origin.distanceTo(target);
    if (active) {
      this.intensity = Math.min(1, this.intensity + IGNITE_RATE * dt);
      this.length = Math.min(reach, this.length + GROWTH_SPEED * dt);
      this.tail = 0;
    } else {
      this.intensity = Math.max(0, this.intensity - FADE_RATE * dt);
      if (this.length > 0) this.tail = Math.min(1, this.tail + (TAIL_SPEED * dt) / Math.max(0.5, this.length));
      this.length = Math.min(reach, this.length + GROWTH_SPEED * 0.4 * dt);
    }
    if (this.intensity <= 0.001 || this.tail >= 1 || this.length <= 0.01) {
      if (!active) this.reset();
      return;
    }
    this.group.visible = true;
    this.group.position.copy(origin);
    this.axis.subVectors(target, origin);
    if (this.axis.lengthSq() > 1e-8) this.group.lookAt(this.end.copy(origin).sub(this.axis));

    const flicker = 0.85 + Math.random() * 0.15;
    for (const [mesh, share] of [[this.body, 1], [this.core, CORE_LENGTH_SHARE]] as const) {
      const uniforms = mesh.material.uniforms;
      uniforms.uTime.value = this.time;
      uniforms.uLength.value = this.length * share;
      uniforms.uIntensity.value = this.intensity * flicker;
      uniforms.uTail.value = this.tail;
    }
    // Shorter streams (cut by a wall) stay narrower, then splash.
    this.body.material.uniforms.uWidth.value = END_RADIUS * Math.min(1, 0.35 + this.length / 9);
    this.updateBillows(dt);
  }

  reset(): void {
    this.intensity = 0;
    this.length = 0;
    this.tail = 0;
    this.group.visible = false;
  }

  dispose(): void {
    this.body.geometry.dispose();
    this.body.material.dispose();
    this.core.material.dispose();
    this.billows.geometry.dispose();
    this.billows.material.dispose();
  }

  /** Puffs born near the end of the stream roll outwards and up, dimming as they go. */
  private updateBillows(dt: number): void {
    const positions = this.billowPositions;
    const colors = this.billowColors;
    for (let index = 0; index < BILLOWS; index++) {
      let age = this.billowAge[index] + dt;
      const o = index * 3;
      if (age >= BILLOW_LIFE) {
        age -= BILLOW_LIFE;
        this.billowDrift[o] = (Math.random() - 0.5) * 1.6;
        this.billowDrift[o + 1] = 0.4 + Math.random() * 0.9;
        this.billowDrift[o + 2] = -(0.8 + Math.random() * 1.6);
      }
      this.billowAge[index] = age;
      const life = age / BILLOW_LIFE;
      // Local frame: -Z along the stream; born over its last third.
      const along = this.length * (0.68 + 0.3 * ((index * 0.37) % 1));
      positions[o] = this.billowDrift[o] * life;
      positions[o + 1] = this.billowDrift[o + 1] * life;
      positions[o + 2] = -along + this.billowDrift[o + 2] * life * 0.5;
      const glow = Math.sin(life * Math.PI) * this.intensity * (1 - this.tail) * 0.55;
      colors[o] = glow;
      colors[o + 1] = glow * 0.42;
      colors[o + 2] = glow * 0.12;
    }
    this.billows.geometry.attributes.position.needsUpdate = true;
    this.billows.geometry.attributes.color.needsUpdate = true;
  }
}
