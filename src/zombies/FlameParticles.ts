import * as THREE from 'three';

/** Pool sizes at full quality; reduced-effects profiles keep half. */
const FIRE_POOL = 140;
const SMOKE_POOL = 40;
const SPARK_POOL = 96;

/** Emission while the stream is fed, per second, and the fireball thrown on ignition. */
const FIRE_RATE = 120;
const SPARK_RATE = 70;
const IGNITION_FIREBALLS = 30;
const IGNITION_SPARKS = 40;

/**
 * Fire puff ballistics: launched along the aim, slowed by the air (drag per
 * second) so they bloom and pile up at the end of the reach, then buoyed
 * upwards as they slow. Sizes in metres, life in seconds.
 */
const FIRE = {
  speed: [25, 30], spread: 0.05, drag: 2.6, lift: 4.2,
  size: [0.1, 0.2], growth: [2.2, 3.2], life: [0.55, 0.8],
} as const;
/** On a wall the puff flattens out across it and rolls back a little. */
const SPLASH = { tangent: 6, back: 1.2, growth: 1.6 } as const;
const SMOKE = { chance: 0.32, rise: [0.7, 1.4], size: [0.5, 0.8], growth: [1.2, 1.8], life: [1.4, 2.2] } as const;
const SPARK = { speed: [14, 30], spread: 0.22, gravity: 7, life: [0.35, 0.85], streak: 0.028 } as const;

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

const NOISE = /* glsl */ `
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
 * A rolling fireball: a ragged, churning ball of flame that starts as a
 * white-hot jet with a blue root, burns orange and dies dark red. One in
 * seven burns with the crimson of the core crystal: the arcane fire.
 */
const FIRE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vAge;
  varying float vSeed;
  ${NOISE}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float n = fbm(p * 1.9 + vec2(vSeed * 13.1, vSeed * 7.3 - uTime * 3.1));
    float shape = 1.0 - smoothstep(0.25, 1.0, length(p) + (n - 0.5) * 0.85);
    float heat = shape * (0.45 + 0.9 * n) * (1.0 - smoothstep(0.5, 1.0, vAge));
    if (heat <= 0.004) discard;
    vec3 color = mix(vec3(1.0, 0.95, 0.78), vec3(1.0, 0.5, 0.1), smoothstep(0.0, 0.3, vAge));
    color = mix(color, vec3(0.62, 0.08, 0.03), smoothstep(0.3, 0.85, vAge));
    color = mix(color, vec3(1.0, 0.1, 0.2), step(0.86, vSeed) * 0.8);
    color = mix(vec3(0.5, 0.68, 1.0), color, smoothstep(0.0, 0.07, vAge));
    gl_FragColor = vec4(color * heat * 1.25, 1.0);
  }
`;

/** Thick oily smoke rolling off the dying fire: dark, soft, slowly thinning. */
const SMOKE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vAge;
  varying float vSeed;
  ${NOISE}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float n = fbm(p * 1.4 + vec2(vSeed * 9.0, vSeed * 4.0 - uTime * 0.6));
    float shape = 1.0 - smoothstep(0.2, 1.0, length(p) + (n - 0.5) * 0.7);
    float alpha = shape * smoothstep(0.0, 0.25, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge)) * 0.38;
    if (alpha <= 0.004) discard;
    gl_FragColor = vec4(vec3(0.05, 0.045, 0.04) * (0.7 + n * 0.6), alpha);
  }
`;

interface Particle {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  growth: number;
  seed: number;
  spin: number;
  spinRate: number;
  /** Metres it may travel before hitting the wall that cut the stream; Infinity in the open. */
  travelLeft: number;
}

const random = (range: readonly [number, number]): number => range[0] + Math.random() * (range[1] - range[0]);

function makePool(size: number): Particle[] {
  return Array.from({ length: size }, () => ({
    position: new THREE.Vector3(), velocity: new THREE.Vector3(),
    age: 0, life: 0, size: 0, growth: 0, seed: 0, spin: 0, spinRate: 0, travelLeft: Infinity,
  }));
}

/** Camera-facing quads, one instance per live particle, packed and drawn in a single call. */
class BillboardLayer {
  readonly mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly offsets: Float32Array;
  private readonly ages: Float32Array;
  private readonly sizes: Float32Array;
  private readonly seeds: Float32Array;
  private readonly spins: Float32Array;
  private readonly attributes: THREE.InstancedBufferAttribute[];

  constructor(name: string, capacity: number, fragmentShader: string, additive: boolean) {
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
  write(pool: readonly Particle[], time: number): number {
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

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * The world-space fire of a flame stream (ФАКЕЛ-33): puffs of flame shot
 * from the nozzle that keep the aim they left with, so sweeping the weapon
 * bends the fire into a lagging arc; they slow, swell and roll upwards at
 * the end of the reach, splash flat across a wall that cuts the stream and
 * shed oily smoke as they die, while sparks streak out of the fire and fall.
 * Three draw calls (fire, smoke, sparks) while anything is alive, none after;
 * fixed pools, no allocation per frame, no lights.
 */
export class FlameParticles {
  readonly group = new THREE.Group();
  private readonly fire: Particle[];
  private readonly smoke: Particle[];
  private readonly sparks: Particle[];
  private readonly fireLayer: BillboardLayer;
  private readonly smokeLayer: BillboardLayer;
  private readonly sparkLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly sparkPositions: Float32Array;
  private readonly sparkColors: Float32Array;
  private readonly rates: { readonly fire: number; readonly sparks: number };
  private fireDebt = 0;
  private sparkDebt = 0;
  private time = 0;
  private alive = 0;
  private readonly aim = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  constructor(reduced = false) {
    const scale = reduced ? 0.5 : 1;
    this.fire = makePool(Math.round(FIRE_POOL * scale));
    this.smoke = makePool(Math.round(SMOKE_POOL * scale));
    this.sparks = makePool(Math.round(SPARK_POOL * scale));
    this.rates = { fire: FIRE_RATE * scale, sparks: SPARK_RATE * scale };
    this.fireLayer = new BillboardLayer('flame_fireballs', this.fire.length, FIRE_FRAGMENT, true);
    this.smokeLayer = new BillboardLayer('flame_smoke', this.smoke.length, SMOKE_FRAGMENT, false);
    // Smoke under the fire, so the flames read through it.
    this.smokeLayer.mesh.renderOrder = -1;
    this.sparkPositions = new Float32Array(this.sparks.length * 6);
    this.sparkColors = new Float32Array(this.sparks.length * 6);
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
    sparkGeometry.setAttribute('color', new THREE.BufferAttribute(this.sparkColors, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkLines = new THREE.LineSegments(sparkGeometry, new THREE.LineBasicMaterial({
      name: 'flame_sparks', vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.sparkLines.name = 'flame_sparks';
    this.sparkLines.frustumCulled = false;
    this.group.name = 'flame-particles';
    this.group.add(this.smokeLayer.mesh, this.fireLayer.mesh, this.sparkLines);
    this.reset();
  }

  /** Live fire, smoke and sparks. */
  get aliveCount(): number {
    return this.alive;
  }

  /**
   * Feeds the stream from `origin` along `direction` (normalised) for `dt`:
   * `wallDistance` is how far the wall that cuts it stands (Infinity in the open).
   */
  emit(dt: number, origin: THREE.Vector3, direction: THREE.Vector3, wallDistance: number): void {
    this.basis(direction);
    this.fireDebt += this.rates.fire * dt;
    this.sparkDebt += this.rates.sparks * dt;
    for (; this.fireDebt >= 1; this.fireDebt--) this.spawnFire(origin, wallDistance, 1);
    for (; this.sparkDebt >= 1; this.sparkDebt--) this.spawnSpark(origin, 1);
  }

  /** The stream catches: a fireball bursts out of the nozzle with a spray of sparks. */
  ignite(origin: THREE.Vector3, direction: THREE.Vector3, wallDistance: number): void {
    this.basis(direction);
    for (let index = 0; index < IGNITION_FIREBALLS; index++) this.spawnFire(origin, wallDistance, 2.6);
    for (let index = 0; index < IGNITION_SPARKS; index++) this.spawnSpark(origin, 2);
  }

  update(dt: number): void {
    this.time += dt;
    const drag = Math.exp(-FIRE.drag * dt);
    let alive = 0;
    for (const puff of this.fire) {
      if (puff.age >= puff.life) continue;
      puff.age += dt;
      if (puff.age >= puff.life) {
        if (Math.random() < SMOKE.chance) this.spawnSmoke(puff);
        continue;
      }
      alive++;
      puff.velocity.multiplyScalar(drag);
      puff.velocity.y += FIRE.lift * dt * Math.min(1, puff.age * 3);
      const step = puff.velocity.length() * dt;
      if (step >= puff.travelLeft) this.splash(puff);
      else puff.travelLeft -= step;
      puff.position.addScaledVector(puff.velocity, dt);
      puff.spin += puff.spinRate * dt;
    }
    for (const cloud of this.smoke) {
      if (cloud.age >= cloud.life) continue;
      cloud.age += dt;
      cloud.position.addScaledVector(cloud.velocity, dt);
      cloud.spin += cloud.spinRate * dt;
      if (cloud.age < cloud.life) alive++;
    }
    alive += this.updateSparks(dt);
    this.alive = alive;
    this.fireLayer.write(this.fire, this.time);
    this.smokeLayer.write(this.smoke, this.time);
  }

  reset(): void {
    for (const pool of [this.fire, this.smoke, this.sparks]) for (const particle of pool) particle.age = particle.life = 0;
    this.fireDebt = this.sparkDebt = 0;
    this.alive = 0;
    this.fireLayer.write(this.fire, 0);
    this.smokeLayer.write(this.smoke, 0);
    this.sparkLines.geometry.setDrawRange(0, 0);
    this.sparkLines.visible = false;
  }

  dispose(): void {
    this.fireLayer.dispose();
    this.smokeLayer.dispose();
    this.sparkLines.geometry.dispose();
    this.sparkLines.material.dispose();
  }

  private basis(direction: THREE.Vector3): void {
    this.aim.copy(direction);
    this.side.set(0, 1, 0).cross(this.aim);
    if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
    this.side.normalize();
    this.up.crossVectors(this.aim, this.side);
  }

  /** A launch direction around the aim, `spread` radians wide. */
  private scatter(out: THREE.Vector3, spread: number): THREE.Vector3 {
    const radius = spread * Math.sqrt(Math.random());
    const angle = Math.random() * Math.PI * 2;
    return out.copy(this.aim)
      .addScaledVector(this.side, Math.cos(angle) * radius)
      .addScaledVector(this.up, Math.sin(angle) * radius)
      .normalize();
  }

  private take(pool: Particle[]): Particle | null {
    for (const particle of pool) if (particle.age >= particle.life) return particle;
    return null;
  }

  /** `burst` > 1 throws a faster, wider, bigger puff (the ignition fireball). */
  private spawnFire(origin: THREE.Vector3, wallDistance: number, burst: number): void {
    const puff = this.take(this.fire);
    if (!puff) return;
    puff.position.copy(origin);
    this.scatter(puff.velocity, FIRE.spread * burst).multiplyScalar(random(FIRE.speed) * (burst > 1 ? 0.8 + Math.random() * 0.5 : 1));
    // Spread the launches over the frame so the stream never shows gaps.
    puff.position.addScaledVector(puff.velocity, Math.random() * 0.016);
    puff.age = 0;
    puff.life = random(FIRE.life) * (burst > 1 ? 1.25 : 1);
    puff.size = random(FIRE.size) * (burst > 1 ? 2 : 1);
    puff.growth = random(FIRE.growth) * (burst > 1 ? 1.3 : 1);
    puff.seed = Math.random();
    puff.spin = Math.random() * Math.PI * 2;
    puff.spinRate = (Math.random() - 0.5) * 4;
    puff.travelLeft = wallDistance;
  }

  /** It hit the wall: spread out flat across it and roll back a little. */
  private splash(puff: Particle): void {
    const angle = Math.random() * Math.PI * 2;
    puff.velocity.copy(this.side).multiplyScalar(Math.cos(angle) * SPLASH.tangent)
      .addScaledVector(this.up, Math.sin(angle) * SPLASH.tangent * 0.7)
      .addScaledVector(this.aim, -SPLASH.back);
    puff.growth *= SPLASH.growth;
    puff.travelLeft = Infinity;
    if (Math.random() < 0.3) this.spawnSpark(puff.position, 0.6);
  }

  private spawnSmoke(from: Particle): void {
    const cloud = this.take(this.smoke);
    if (!cloud) return;
    cloud.position.copy(from.position);
    cloud.velocity.set((Math.random() - 0.5) * 0.4, random(SMOKE.rise), (Math.random() - 0.5) * 0.4)
      .addScaledVector(from.velocity, 0.15);
    cloud.age = 0;
    cloud.life = random(SMOKE.life);
    cloud.size = random(SMOKE.size) + from.size + from.growth * from.life * 0.5;
    cloud.growth = random(SMOKE.growth);
    cloud.seed = Math.random();
    cloud.spin = Math.random() * Math.PI * 2;
    cloud.spinRate = (Math.random() - 0.5) * 0.6;
    cloud.travelLeft = Infinity;
  }

  private spawnSpark(origin: THREE.Vector3, burst: number): void {
    const spark = this.take(this.sparks);
    if (!spark) return;
    spark.position.copy(origin);
    this.scatter(spark.velocity, SPARK.spread * burst).multiplyScalar(random(SPARK.speed) / Math.max(1, burst * 0.6));
    spark.age = 0;
    spark.life = random(SPARK.life);
    // Gold, or the crystal's crimson now and then.
    spark.seed = Math.random();
    spark.travelLeft = Infinity;
  }

  /** Falling, streaking sparks: a short line behind each, white-gold cooling to red. */
  private updateSparks(dt: number): number {
    const positions = this.sparkPositions;
    const colors = this.sparkColors;
    const drag = Math.exp(-1.2 * dt);
    let count = 0;
    for (const spark of this.sparks) {
      if (spark.age >= spark.life) continue;
      spark.age += dt;
      if (spark.age >= spark.life) continue;
      spark.velocity.multiplyScalar(drag);
      spark.velocity.y -= SPARK.gravity * dt;
      spark.position.addScaledVector(spark.velocity, dt);
      const o = count * 6;
      positions[o] = spark.position.x;
      positions[o + 1] = spark.position.y;
      positions[o + 2] = spark.position.z;
      positions[o + 3] = spark.position.x - spark.velocity.x * SPARK.streak;
      positions[o + 4] = spark.position.y - spark.velocity.y * SPARK.streak;
      positions[o + 5] = spark.position.z - spark.velocity.z * SPARK.streak;
      const glow = 1 - spark.age / spark.life;
      const crimson = spark.seed > 0.8;
      const r = glow * 1.4;
      const g = crimson ? glow * 0.15 : glow * glow * 0.9;
      const b = crimson ? glow * 0.25 : glow * glow * glow * 0.4;
      colors[o] = r;
      colors[o + 1] = g;
      colors[o + 2] = b;
      colors[o + 3] = r * 0.3;
      colors[o + 4] = g * 0.2;
      colors[o + 5] = b * 0.2;
      count++;
    }
    const geometry = this.sparkLines.geometry;
    geometry.setDrawRange(0, count * 2);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    this.sparkLines.visible = count > 0;
    return count;
  }
}
