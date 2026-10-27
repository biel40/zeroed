import * as THREE from 'three';

/** Seconds the pool takes to spread to its full size. */
const SPREAD_SECONDS = 1.8;
/** Full size, metres: longer along the body than across it. */
const WIDTH = 1.05;
const LENGTH = 1.6;
/** Just above the floor, under any floor decal's offset. */
const FLOOR_OFFSET = 0.011;

const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Thick dark blood with a lumpy edge, darkest and wettest at its heart. */
const FRAGMENT_SHADER = /* glsl */ `
  uniform float uSpread;
  uniform float uOpacity;
  uniform float uSeed;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float angle = atan(p.y, p.x);
    float lobes = noise(vec2(angle * 2.2 + uSeed, uSeed)) * 0.35 + noise(p * 3.0 + uSeed) * 0.2;
    float radius = length(p) / max(0.05, uSpread);
    float edge = 1.0 - smoothstep(0.62 + lobes * 0.5, 0.78 + lobes * 0.5, radius);
    if (edge <= 0.01) discard;
    vec3 color = mix(vec3(0.2, 0.012, 0.01), vec3(0.075, 0.004, 0.004), smoothstep(0.5, 0.0, radius));
    gl_FragColor = vec4(color, edge * uOpacity * 0.92);
  }
`;

/**
 * Dark blood spreading under a body that burnt to death (ФАКЕЛ-33): one
 * flat quad on the floor with a lumpy, noisy edge, growing out from under
 * the corpse and fading with it. Hidden (no draw call) until it bleeds.
 */
export class ZombieBloodPool {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private age = Infinity;

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(WIDTH, LENGTH).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        name: 'zombie_blood_pool',
        uniforms: { uSpread: { value: 0 }, uOpacity: { value: 1 }, uSeed: { value: 0 } },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.mesh.name = 'zombie-blood-pool';
    this.mesh.renderOrder = 1;
    this.mesh.visible = false;
  }

  /** Starts bleeding at `forward` metres ahead of the feet, along the fallen body. */
  bleed(forward: number): void {
    this.age = 0;
    this.mesh.position.set(0, FLOOR_OFFSET, forward);
    this.mesh.material.uniforms.uSeed.value = Math.random() * 40;
    this.mesh.material.uniforms.uSpread.value = 0;
    this.mesh.material.uniforms.uOpacity.value = 1;
    this.mesh.visible = true;
  }

  /** `fade` 0..1 follows the corpse fading out. */
  update(dt: number, fade: number): void {
    if (!this.mesh.visible) return;
    this.age += dt;
    const spread = Math.min(1, this.age / SPREAD_SECONDS);
    this.mesh.material.uniforms.uSpread.value = 1 - (1 - spread) * (1 - spread);
    this.mesh.material.uniforms.uOpacity.value = 1 - fade;
  }

  hide(): void {
    this.mesh.visible = false;
    this.age = Infinity;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
