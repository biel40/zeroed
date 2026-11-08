import * as THREE from 'three';
import { BILLBOARD_NOISE, BillboardLayer, type BillboardParticle } from '../../rendering/BillboardParticles';

/** Pool sizes at full quality; reduced-effects profiles keep half. Enough for two blasts at once. */
const FIRE_POOL = 90;
const SMOKE_POOL = 90;
const FLASH_POOL = 4;
const SPARK_POOL = 160;
const RING_POOL = 3;
const SCORCH_POOL = 8;

/** One blast, at full quality. Sizes in metres, speeds in m/s, times in seconds. */
const FIREBALL = { count: 26, speed: [5, 11], drag: 5.5, lift: 3.2, size: [0.45, 0.85], growth: [2.4, 3.6], life: [0.45, 0.85] } as const;
/** Fire thrown straight up: the column that crowns the fireball. */
const PLUME = { count: 8, speed: [4, 7.5], size: [0.35, 0.6], growth: [2, 2.8], life: [0.55, 0.9] } as const;
const SMOKE = { count: 22, rise: [0.6, 1.7], spread: [0.4, 2.2], drag: 1.1, size: [0.8, 1.35], growth: [0.9, 1.5], life: [2.8, 4.2], delay: [0.06, 0.32] } as const;
/** Dust kicked out along the floor by the shock front. */
const DUST = { count: 14, speed: [4, 7.5], drag: 3.2, size: [0.35, 0.55], growth: [1.2, 1.7], life: [1.3, 2] } as const;
const SPARK = { count: 70, speed: [9, 26], gravity: 9.81, drag: 0.9, life: [0.45, 1.2], streak: 0.03 } as const;
const FLASH = { size: 3.2, growth: 9, life: 0.16 } as const;
const SHOCKWAVE = { radius: 7, life: 0.38 } as const;
const GROUND_GLOW = { radius: 4.2, life: 0.55 } as const;
const SCORCH = { radius: 1.35, hold: 18, fade: 4 } as const;
/** Smoke seeds below this are soot; above it, the lighter dust. */
const DUST_SEED = 0.75;
/** Lifts surface decals over the floor they lie on. */
const DECAL_LIFT = 0.012;

/** Fireball: white-hot at birth, orange, deep red, then soot. */
const FIRE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vAge;
  varying float vSeed;
  ${BILLBOARD_NOISE}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float n = fbm(p * 2.2 + vec2(vSeed * 17.0, vSeed * 5.3 - uTime * 2.4));
    float shape = 1.0 - smoothstep(0.2, 1.0, length(p) + (n - 0.5) * 0.9);
    float heat = shape * (0.5 + 0.9 * n) * (1.0 - smoothstep(0.45, 1.0, vAge));
    if (heat <= 0.004) discard;
    vec3 color = mix(vec3(1.0, 0.97, 0.85), vec3(1.0, 0.62, 0.18), smoothstep(0.0, 0.22, vAge));
    color = mix(color, vec3(0.75, 0.16, 0.04), smoothstep(0.25, 0.7, vAge));
    color = mix(color, vec3(0.12, 0.05, 0.03), smoothstep(0.65, 1.0, vAge));
    gl_FragColor = vec4(color * heat * 1.4, 1.0);
  }
`;

/** The detonation flash: a blinding bloom that lights the air for a few frames. */
const FLASH_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying float vAge;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float d = dot(p, p);
    float glow = exp(-d * 4.0) + 0.35 * exp(-d * 0.9);
    float fade = (1.0 - vAge) * (1.0 - vAge);
    if (glow * fade <= 0.003) discard;
    gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * glow * fade * 2.2, 1.0);
  }
`;

/** Rolling soot lit from below while the fire lives, and lighter floor dust. */
const SMOKE_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying float vAge;
  varying float vSeed;
  ${BILLBOARD_NOISE}
  void main() {
    if (vAge <= 0.0) discard;
    vec2 p = vUv * 2.0 - 1.0;
    float n = fbm(p * 1.5 + vec2(vSeed * 9.0, vSeed * 4.0 - uTime * 0.35));
    float shape = 1.0 - smoothstep(0.15, 1.0, length(p) + (n - 0.5) * 0.75);
    float dust = step(${DUST_SEED.toFixed(2)}, vSeed);
    float alpha = shape * smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.45, 1.0, vAge)) * mix(0.62, 0.42, dust);
    if (alpha <= 0.004) discard;
    vec3 soot = vec3(0.07, 0.065, 0.06) * (0.65 + n * 0.7);
    vec3 earth = vec3(0.32, 0.27, 0.21) * (0.7 + n * 0.5);
    vec3 glow = vec3(0.9, 0.35, 0.08) * (1.0 - smoothstep(0.0, 0.18, vAge)) * 0.8 * (1.0 - dust);
    gl_FragColor = vec4(mix(soot, earth, dust) + glow, alpha);
  }
`;

const FLAT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Fake light the fireball throws on the floor around it; no real light is added. */
const GLOW_FRAGMENT = /* glsl */ `
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float d = length(vUv * 2.0 - 1.0);
    float glow = (1.0 - smoothstep(0.0, 1.0, d)) * uIntensity;
    if (glow <= 0.003) discard;
    gl_FragColor = vec4(vec3(1.0, 0.5, 0.16) * glow * glow, 1.0);
  }
`;

/** The burnt, ragged ground mark left behind; one instanced draw for every scorch. */
const SCORCH_VERTEX = /* glsl */ `
  attribute float aFade;
  attribute float aSeed;
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  void main() {
    vUv = uv;
    vFade = aFade;
    vSeed = aSeed;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const SCORCH_FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  ${BILLBOARD_NOISE}
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float n = fbm(p * 3.0 + vSeed * 7.0);
    float d = length(p) + (n - 0.5) * 0.55;
    float alpha = (1.0 - smoothstep(0.3, 1.0, d)) * vFade * 0.88;
    if (alpha <= 0.004) discard;
    gl_FragColor = vec4(vec3(0.03, 0.025, 0.02) * (0.6 + n * 0.6), alpha);
  }
`;

interface Spark {
  readonly position: THREE.Vector3;
  readonly velocity: THREE.Vector3;
  age: number;
  life: number;
}

interface Flat {
  readonly mesh: THREE.Mesh;
  age: number;
  life: number;
}

interface Scorch {
  age: number;
}

type Range = readonly [number, number];
const random = (range: Range): number => range[0] + Math.random() * (range[1] - range[0]);

function particles(size: number): BillboardParticle[] {
  return Array.from({ length: size }, () => ({
    position: new THREE.Vector3(), velocity: new THREE.Vector3(),
    age: 0, life: 0, size: 0, growth: 0, seed: 0, spin: 0, spinRate: 0,
  }));
}

/**
 * The world-space blast of a grenade: a blinding flash, a churning fireball
 * crowned by a rising plume, a shock ring racing over the floor with a
 * flash of fake light under it, sparks and fragments streaking out, dust
 * kicked along the ground, soot rolling up for seconds after, and a scorch
 * left where it went off. Fixed pools, no allocation per frame, no lights;
 * every layer hides when it has nothing alive.
 */
export class GrenadeExplosionView {
  public readonly group = new THREE.Group();
  private readonly fire: BillboardParticle[];
  private readonly smoke: BillboardParticle[];
  private readonly flashes: BillboardParticle[];
  private readonly sparks: Spark[];
  private readonly fireLayer: BillboardLayer;
  private readonly smokeLayer: BillboardLayer;
  private readonly flashLayer: BillboardLayer;
  private readonly sparkLines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly sparkPositions: Float32Array;
  private readonly sparkColors: Float32Array;
  private readonly rings: Flat[] = [];
  private readonly glows: Flat[] = [];
  private readonly scorchMesh: THREE.InstancedMesh<THREE.CircleGeometry, THREE.ShaderMaterial>;
  private readonly scorches: Scorch[];
  private readonly scorchFades: Float32Array;
  private readonly scorchFadeAttribute: THREE.InstancedBufferAttribute;
  private readonly scale: number;
  private scorchCursor = 0;
  private ringCursor = 0;
  private time = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly rotation = new THREE.Quaternion();
  private readonly scaleVector = new THREE.Vector3();
  private readonly scorchPosition = new THREE.Vector3();
  private readonly flatUp = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private readonly yAxis = new THREE.Vector3(0, 1, 0);

  public constructor(reduced = false) {
    this.scale = reduced ? 0.5 : 1;
    this.fire = particles(Math.round(FIRE_POOL * this.scale));
    this.smoke = particles(Math.round(SMOKE_POOL * this.scale));
    this.flashes = particles(FLASH_POOL);
    this.sparks = Array.from({ length: Math.round(SPARK_POOL * this.scale) }, () => ({
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), age: 0, life: 0,
    }));
    this.fireLayer = new BillboardLayer('grenade_fireball', this.fire.length, FIRE_FRAGMENT, true);
    this.smokeLayer = new BillboardLayer('grenade_smoke', this.smoke.length, SMOKE_FRAGMENT, false);
    this.flashLayer = new BillboardLayer('grenade_flash', this.flashes.length, FLASH_FRAGMENT, true);
    // Soot under the fire, so the flames read through it.
    this.smokeLayer.mesh.renderOrder = -1;
    this.sparkPositions = new Float32Array(this.sparks.length * 6);
    this.sparkColors = new Float32Array(this.sparks.length * 6);
    const sparkGeometry = new THREE.BufferGeometry();
    sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
    sparkGeometry.setAttribute('color', new THREE.BufferAttribute(this.sparkColors, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparkLines = new THREE.LineSegments(sparkGeometry, new THREE.LineBasicMaterial({
      name: 'grenade_sparks', vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.sparkLines.name = 'grenade_sparks';
    this.sparkLines.frustumCulled = false;

    const ringGeometry = new THREE.RingGeometry(0.82, 1, 48);
    const glowGeometry = new THREE.CircleGeometry(1, 32);
    for (let index = 0; index < RING_POOL; index++) {
      const ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({
        name: 'grenade_shockwave', color: 0xffd9a0, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      const glow = new THREE.Mesh(glowGeometry, new THREE.ShaderMaterial({
        name: 'grenade_ground_glow', uniforms: { uIntensity: { value: 0 } },
        vertexShader: FLAT_VERTEX, fragmentShader: GLOW_FRAGMENT,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        polygonOffset: true, polygonOffsetFactor: -2,
      }));
      ring.quaternion.copy(this.flatUp);
      glow.quaternion.copy(this.flatUp);
      this.rings.push({ mesh: ring, age: 0, life: 0 });
      this.glows.push({ mesh: glow, age: 0, life: 0 });
      this.group.add(ring, glow);
    }

    this.scorches = Array.from({ length: SCORCH_POOL }, () => ({ age: Infinity }));
    this.scorchFades = new Float32Array(SCORCH_POOL);
    const scorchGeometry = new THREE.CircleGeometry(1, 28);
    this.scorchFadeAttribute = new THREE.InstancedBufferAttribute(this.scorchFades, 1).setUsage(THREE.DynamicDrawUsage);
    scorchGeometry.setAttribute('aFade', this.scorchFadeAttribute);
    scorchGeometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(
      Float32Array.from({ length: SCORCH_POOL }, (_, index) => (index * 0.618) % 1), 1));
    this.scorchMesh = new THREE.InstancedMesh(scorchGeometry, new THREE.ShaderMaterial({
      name: 'grenade_scorch', vertexShader: SCORCH_VERTEX, fragmentShader: SCORCH_FRAGMENT,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
    }), SCORCH_POOL);
    this.scorchMesh.name = 'grenade_scorches';
    this.scorchMesh.frustumCulled = false;
    this.scorchMesh.renderOrder = -2;

    this.group.name = 'grenade-explosions';
    this.group.add(this.scorchMesh, this.smokeLayer.mesh, this.fireLayer.mesh, this.flashLayer.mesh, this.sparkLines);
    // Every layer starts visible so the map's shader warm-up compiles it; the first update hides the idle ones.
  }

  /** A blast at `centre`; `surfaceY` is the floor or furniture top it went off on. */
  public explode(centre: THREE.Vector3, surfaceY: number): void {
    const flash = this.take(this.flashes);
    if (flash) this.launch(flash, centre, 0, 0.35, 0, true, FLASH.size, FLASH.growth, FLASH.life, 0, 0.5);
    for (let index = 0; index < Math.round(FIREBALL.count * this.scale); index++) {
      const puff = this.take(this.fire);
      if (!puff) break;
      this.scatter(puff.velocity, 0.15).multiplyScalar(random(FIREBALL.speed));
      this.launch(puff, centre, (Math.random() - 0.5) * 0.4, 0.15 + Math.random() * 0.3, (Math.random() - 0.5) * 0.4,
        false, random(FIREBALL.size), random(FIREBALL.growth), random(FIREBALL.life), 0, Math.random());
    }
    for (let index = 0; index < Math.round(PLUME.count * this.scale); index++) {
      const puff = this.take(this.fire);
      if (!puff) break;
      puff.velocity.set((Math.random() - 0.5) * 1.2, random(PLUME.speed), (Math.random() - 0.5) * 1.2);
      this.launch(puff, centre, 0, 0.3, 0, false, random(PLUME.size), random(PLUME.growth), random(PLUME.life), 0, Math.random());
    }
    for (let index = 0; index < Math.round(SMOKE.count * this.scale); index++) {
      const cloud = this.take(this.smoke);
      if (!cloud) break;
      const angle = Math.random() * Math.PI * 2;
      const spread = random(SMOKE.spread);
      cloud.velocity.set(Math.cos(angle) * spread, random(SMOKE.rise), Math.sin(angle) * spread);
      this.launch(cloud, centre, Math.cos(angle) * 0.4, 0.4 + Math.random() * 0.5, Math.sin(angle) * 0.4,
        false, random(SMOKE.size), random(SMOKE.growth), random(SMOKE.life), -random(SMOKE.delay), Math.random() * DUST_SEED);
    }
    for (let index = 0; index < Math.round(DUST.count * this.scale); index++) {
      const dust = this.take(this.smoke);
      if (!dust) break;
      const angle = (index / DUST.count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = random(DUST.speed);
      dust.velocity.set(Math.cos(angle) * speed, 0.3 + Math.random() * 0.4, Math.sin(angle) * speed);
      this.launch(dust, centre, 0, surfaceY - centre.y + 0.2, 0, false, random(DUST.size), random(DUST.growth), random(DUST.life),
        0, DUST_SEED + Math.random() * (1 - DUST_SEED));
    }
    for (let index = 0; index < Math.round(SPARK.count * this.scale); index++) {
      const spark = this.takeSpark();
      if (!spark) break;
      spark.position.copy(centre);
      this.scatter(spark.velocity, 0.05).multiplyScalar(random(SPARK.speed));
      spark.age = 0;
      spark.life = random(SPARK.life);
    }
    const ring = this.rings[this.ringCursor];
    const glow = this.glows[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % RING_POOL;
    ring.mesh.position.set(centre.x, surfaceY + DECAL_LIFT * 2, centre.z);
    glow.mesh.position.set(centre.x, surfaceY + DECAL_LIFT * 1.5, centre.z);
    ring.age = glow.age = 0;
    ring.life = SHOCKWAVE.life;
    glow.life = GROUND_GLOW.life;
    this.placeScorch(centre, surfaceY);
  }

  public update(dt: number): void {
    this.time += dt;
    const fireDrag = Math.exp(-FIREBALL.drag * dt);
    for (const puff of this.fire) {
      if (puff.age >= puff.life) continue;
      puff.age += dt;
      puff.velocity.multiplyScalar(fireDrag);
      puff.velocity.y += FIREBALL.lift * dt;
      puff.position.addScaledVector(puff.velocity, dt);
      puff.spin += puff.spinRate * dt;
    }
    const smokeDrag = Math.exp(-SMOKE.drag * dt);
    const dustDrag = Math.exp(-DUST.drag * dt);
    for (const cloud of this.smoke) {
      if (cloud.age >= cloud.life) continue;
      cloud.age += dt;
      if (cloud.age < 0) continue;
      cloud.velocity.multiplyScalar(cloud.seed >= DUST_SEED ? dustDrag : smokeDrag);
      cloud.position.addScaledVector(cloud.velocity, dt);
      cloud.spin += cloud.spinRate * dt;
    }
    for (const flash of this.flashes) if (flash.age < flash.life) flash.age += dt;
    this.fireLayer.write(this.fire, this.time);
    this.smokeLayer.write(this.smoke, this.time);
    this.flashLayer.write(this.flashes, this.time);
    this.updateSparks(dt);
    this.updateFlats(dt);
    this.updateScorches(dt);
  }

  /** New run: every blast and scorch is gone. */
  public reset(): void {
    for (const pool of [this.fire, this.smoke, this.flashes]) for (const particle of pool) particle.age = particle.life = 0;
    for (const spark of this.sparks) spark.age = spark.life = 0;
    for (const flat of [...this.rings, ...this.glows]) flat.age = flat.life = 0;
    for (const scorch of this.scorches) scorch.age = Infinity;
    this.update(0);
  }

  public dispose(): void {
    this.fireLayer.dispose();
    this.smokeLayer.dispose();
    this.flashLayer.dispose();
    this.sparkLines.geometry.dispose();
    this.sparkLines.material.dispose();
    this.rings[0].mesh.geometry.dispose();
    this.glows[0].mesh.geometry.dispose();
    for (const flat of [...this.rings, ...this.glows]) (flat.mesh.material as THREE.Material).dispose();
    this.scorchMesh.geometry.dispose();
    this.scorchMesh.material.dispose();
  }

  /** Places a particle at `centre` + (x, y, z); its velocity is kept unless `resetVelocity`. */
  private launch(
    particle: BillboardParticle, centre: THREE.Vector3, x: number, y: number, z: number,
    resetVelocity: boolean, size: number, growth: number, life: number, age: number, seed: number,
  ): void {
    particle.position.set(centre.x + x, centre.y + y, centre.z + z);
    if (resetVelocity) particle.velocity.set(0, 0, 0);
    particle.size = size;
    particle.growth = growth;
    particle.life = life;
    particle.age = age;
    particle.seed = seed;
    particle.spin = Math.random() * Math.PI * 2;
    particle.spinRate = (Math.random() - 0.5) * 2.4;
  }

  /** A random direction over the upper hemisphere, `floor` keeping it that far above the horizon. */
  private scatter(out: THREE.Vector3, floor: number): THREE.Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const up = floor + Math.random() * (1 - floor);
    const across = Math.sqrt(1 - up * up);
    return out.set(Math.cos(angle) * across, up, Math.sin(angle) * across);
  }

  private take(pool: BillboardParticle[]): BillboardParticle | null {
    for (const particle of pool) if (particle.age >= particle.life) return particle;
    return null;
  }

  private takeSpark(): Spark | null {
    for (const spark of this.sparks) if (spark.age >= spark.life) return spark;
    return null;
  }

  /** Streaking white-gold fragments that cool to red as they fall. */
  private updateSparks(dt: number): void {
    const positions = this.sparkPositions;
    const colors = this.sparkColors;
    const drag = Math.exp(-SPARK.drag * dt);
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
      colors[o] = glow * 1.5;
      colors[o + 1] = glow * glow * 0.95;
      colors[o + 2] = glow * glow * glow * 0.45;
      colors[o + 3] = colors[o] * 0.3;
      colors[o + 4] = colors[o + 1] * 0.2;
      colors[o + 5] = colors[o + 2] * 0.2;
      count++;
    }
    const geometry = this.sparkLines.geometry;
    geometry.setDrawRange(0, count * 2);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    this.sparkLines.visible = count > 0;
  }

  /** The shock ring races out and thins; the floor glow flares and dies with the fire. */
  private updateFlats(dt: number): void {
    for (const ring of this.rings) {
      const alive = ring.age < ring.life;
      ring.mesh.visible = alive;
      if (!alive) continue;
      ring.age += dt;
      const t = Math.min(1, ring.age / ring.life);
      const ease = 1 - (1 - t) ** 3;
      ring.mesh.scale.setScalar(0.3 + ease * SHOCKWAVE.radius);
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - t) * (1 - t);
    }
    for (const glow of this.glows) {
      const alive = glow.age < glow.life;
      glow.mesh.visible = alive;
      if (!alive) continue;
      glow.age += dt;
      const t = Math.min(1, glow.age / glow.life);
      glow.mesh.scale.setScalar(GROUND_GLOW.radius * (0.6 + 0.4 * Math.min(1, t * 4)));
      (glow.mesh.material as THREE.ShaderMaterial).uniforms.uIntensity.value = 1.5 * (1 - t) ** 1.5;
    }
  }

  private placeScorch(centre: THREE.Vector3, surfaceY: number): void {
    const index = this.scorchCursor;
    this.scorchCursor = (this.scorchCursor + 1) % SCORCH_POOL;
    this.scorches[index].age = 0;
    this.rotation.setFromAxisAngle(this.yAxis, Math.random() * Math.PI * 2).multiply(this.flatUp);
    const radius = SCORCH.radius * (0.85 + Math.random() * 0.3);
    this.scorchPosition.set(centre.x, surfaceY + DECAL_LIFT, centre.z);
    this.matrix.compose(this.scorchPosition, this.rotation, this.scaleVector.set(radius, radius, 1));
    this.scorchMesh.setMatrixAt(index, this.matrix);
    this.scorchMesh.instanceMatrix.needsUpdate = true;
  }

  private updateScorches(dt: number): void {
    let any = false;
    for (let index = 0; index < this.scorches.length; index++) {
      const scorch = this.scorches[index];
      if (scorch.age < SCORCH.hold + SCORCH.fade) scorch.age += dt;
      const fade = scorch.age <= SCORCH.hold ? 1 : Math.max(0, 1 - (scorch.age - SCORCH.hold) / SCORCH.fade);
      this.scorchFades[index] = fade;
      if (fade > 0) any = true;
    }
    this.scorchFadeAttribute.needsUpdate = true;
    this.scorchMesh.visible = any;
  }
}
