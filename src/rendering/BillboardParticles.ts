import * as THREE from 'three';

/** One camera-facing particle; owners add their own fields. Sizes in metres, life in seconds. */
export interface BillboardParticle {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  growth: number;
  seed: number;
  spin: number;
  spinRate: number;
}

const BILLBOARD_VERTEX = /* glsl */ `
  attribute vec3 aOffset;
  attribute float aAge;
  attribute float aSize;
  attribute float aSeed;
  attribute float aSpin;
  varying vec2 vUv;
  varying float vAge;
  varying float vSeed;
  void main() {
    vUv = uv;
    vAge = aAge;
    vSeed = aSeed;
    vec4 view = viewMatrix * vec4(aOffset, 1.0);
    float c = cos(aSpin);
    float s = sin(aSpin);
    view.xy += mat2(c, -s, s, c) * position.xy * aSize;
    gl_Position = projectionMatrix * view;
  }
`;

/** Value noise and fbm for billboard fragment shaders (`hash`, `noise`, `fbm`). */
export const BILLBOARD_NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p) {
    return noise(p) * 0.55 + noise(p * 2.1 + 1.7) * 0.3 + noise(p * 4.3 + 3.1) * 0.15;
  }
`;

/**
 * Camera-facing quads, one instance per live particle, packed and drawn in a
 * single call. The fragment shader receives `vUv`, `vAge` (0..1 of its life),
 * `vSeed` and the `uTime` uniform.
 */
export class BillboardLayer {
  public readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly offsets: Float32Array;
  private readonly ages: Float32Array;
  private readonly sizes: Float32Array;
  private readonly seeds: Float32Array;
  private readonly spins: Float32Array;
  private readonly attributes: THREE.InstancedBufferAttribute[];

  public constructor(name: string, capacity: number, fragmentShader: string, additive: boolean) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('uv', quad.getAttribute('uv'));
    this.offsets = new Float32Array(capacity * 3);
    this.ages = new Float32Array(capacity);
    this.sizes = new Float32Array(capacity);
    this.seeds = new Float32Array(capacity);
    this.spins = new Float32Array(capacity);
    const attribute = (array: Float32Array, size: number): THREE.InstancedBufferAttribute =>
      new THREE.InstancedBufferAttribute(array, size).setUsage(THREE.DynamicDrawUsage);
    this.attributes = [attribute(this.offsets, 3), attribute(this.ages, 1), attribute(this.sizes, 1), attribute(this.seeds, 1), attribute(this.spins, 1)];
    ['aOffset', 'aAge', 'aSize', 'aSeed', 'aSpin'].forEach((key, index) => geometry.setAttribute(key, this.attributes[index]));
    geometry.instanceCount = 0;
    this.mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      name,
      uniforms: { uTime: { value: 0 } },
      vertexShader: BILLBOARD_VERTEX,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    this.mesh.name = name;
    // World-space particles drawn from the origin; their spread has no static bounds.
    this.mesh.frustumCulled = false;
  }

  /** Uploads the live particles of `pool` (age < life). */
  public write(pool: readonly BillboardParticle[], time: number): number {
    let count = 0;
    for (const particle of pool) {
      if (particle.age >= particle.life) continue;
      particle.position.toArray(this.offsets, count * 3);
      this.ages[count] = particle.age / particle.life;
      this.sizes[count] = particle.size + particle.growth * particle.age;
      this.seeds[count] = particle.seed;
      this.spins[count] = particle.spin;
      count++;
    }
    this.mesh.geometry.instanceCount = count;
    this.mesh.material.uniforms.uTime.value = time;
    for (const attribute of this.attributes) attribute.needsUpdate = true;
    this.mesh.visible = count > 0;
    return count;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
