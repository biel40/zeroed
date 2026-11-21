import * as THREE from 'three';
import { resolveSegmentHit } from '../shooting/BallisticsSystem';
import type { WeaponId, WindWeaponConfig } from '../weapons/WeaponTypes';

const MAX_SHOTS = 6;
const MAX_BURSTS = 4;
const MAX_MOTES = 60;
const MOTES_PER_BURST = 10;
/** Collision radius of a shot along its path, metres. */
const SHOT_RADIUS = 0.06;
const FIRST_FRAME_LEAD = 0.5;
const STREAK_LENGTH = 1.5;
const STREAK_RADIUS = 0.045;
/** Two open wind rings turning round the shot in opposite senses. */
const RING_RADIUS = 0.11;
const RING_ARC = Math.PI * 1.35;
const RING_SPIN = 26;
const BURST_SECONDS = 0.38;
/** Share of the burst radius the pressure wave grows to: it reads the reach without filling the screen. */
const WAVE_REACH = 0.7;
const MOTE_SECONDS = 0.55;
const DUST_COLOR = 0x8a8478;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface Shot {
  active: boolean;
  config: WindWeaponConfig | null;
  source: WeaponId | null;
  x: number;
  y: number;
  z: number;
  readonly direction: THREE.Vector3;
  travelled: number;
  readonly group: THREE.Group;
  readonly core: THREE.Mesh;
  readonly coreMaterial: THREE.MeshBasicMaterial;
  readonly streakMaterial: THREE.MeshBasicMaterial;
  readonly rings: readonly THREE.Object3D[];
  readonly ringMaterial: THREE.MeshBasicMaterial;
}

interface Burst {
  life: number;
  radius: number;
  intensity: number;
  readonly wave: THREE.Mesh;
  readonly waveMaterial: THREE.MeshBasicMaterial;
  readonly puff: THREE.Mesh;
  readonly puffMaterial: THREE.MeshBasicMaterial;
}

interface Mote {
  life: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
}

function additive(color: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Wind shots in flight and their bursts (EXHALIS): pooled meshes, no
 * lights and no allocations per shot or per frame. A shot is a pale streak
 * with two open wind rings turning round it; it travels in a straight line,
 * segment-raycast against the shared colliders with the same head priority
 * as bullets, and bursts on the first thing it meets or where its reach
 * runs out: a pressure ring spreading across its path, a soft puff and a
 * scatter of stone dust. Every colour, size and opacity
 * comes from the shot's own `WindWeaponConfig.look`. Reduced effects keep
 * half the dust. What the burst does is the caller's (`onImpact`).
 */
export class WindShots {
  /** A shot burst at `point`: `object` is what it struck (null when its reach ran out), `distance` how far it flew. */
  public onImpact:
    | ((point: THREE.Vector3, object: THREE.Object3D | null, distance: number, config: WindWeaponConfig, source: WeaponId) => void)
    | null = null;

  private readonly shots: Shot[] = [];
  private readonly bursts: Burst[] = [];
  private readonly motes: Mote[] = [];
  private readonly moteMesh: THREE.InstancedMesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly segmentOrigin = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();
  private readonly color = new THREE.Color();
  private readonly tint = new THREE.Color();
  private readonly motesPerBurst: number;
  private shotCursor = 0;
  private burstCursor = 0;
  private moteCursor = 0;
  private time = 0;

  public constructor(
    private readonly colliders: THREE.Object3D[],
    parent: THREE.Object3D,
    reducedEffects = false,
  ) {
    this.motesPerBurst = reducedEffects ? MOTES_PER_BURST / 2 : MOTES_PER_BURST;
    const core = new THREE.SphereGeometry(0.035, 8, 6).scale(1, 1, 3);
    // An open cone: wide at the shot (+Z, its head), thinning to nothing behind it.
    const streak = new THREE.ConeGeometry(STREAK_RADIUS, STREAK_LENGTH, 8, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -STREAK_LENGTH / 2);
    const ring = new THREE.TorusGeometry(RING_RADIUS, 0.007, 4, 18, RING_ARC);
    for (let index = 0; index < MAX_SHOTS; index++) {
      const group = new THREE.Group();
      group.name = 'wind-shot';
      group.visible = false;
      const coreMaterial = additive(0xffffff);
      const streakMaterial = additive(0xffffff);
      const ringMaterial = additive(0xffffff);
      const coreMesh = new THREE.Mesh(core, coreMaterial);
      const streakMesh = new THREE.Mesh(streak, streakMaterial);
      const rings = [0, 1].map((turn) => {
        const mesh = new THREE.Mesh(ring, ringMaterial);
        mesh.position.z = -0.22 - turn * 0.26;
        mesh.scale.setScalar(1 - turn * 0.2);
        return mesh;
      });
      group.add(coreMesh, streakMesh, ...rings);
      for (const mesh of [coreMesh, streakMesh, ...rings]) mesh.frustumCulled = false;
      parent.add(group);
      this.shots.push({
        active: false, config: null, source: null, x: 0, y: 0, z: 0, direction: new THREE.Vector3(0, 0, 1), travelled: 0,
        group, core: coreMesh, coreMaterial, streakMaterial, rings, ringMaterial,
      });
    }

    // Faces along +Z: turned to the shot, it spreads across the shot's path like a pressure front.
    const wave = new THREE.RingGeometry(0.72, 1, 36, 1);
    const puff = new THREE.IcosahedronGeometry(1, 1);
    for (let index = 0; index < MAX_BURSTS; index++) {
      const waveMaterial = additive(0xffffff);
      const puffMaterial = additive(0xffffff);
      const waveMesh = new THREE.Mesh(wave, waveMaterial);
      const puffMesh = new THREE.Mesh(puff, puffMaterial);
      waveMesh.name = 'wind-burst-wave';
      waveMesh.visible = puffMesh.visible = false;
      parent.add(waveMesh, puffMesh);
      this.bursts.push({ life: 0, radius: 1, intensity: 1, wave: waveMesh, waveMaterial, puff: puffMesh, puffMaterial });
    }

    const moteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
    this.moteMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.03, 0), moteMaterial, MAX_MOTES);
    this.moteMesh.name = 'wind-burst-dust';
    this.moteMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.moteMesh.frustumCulled = false;
    this.matrix.makeScale(0, 0, 0);
    for (let index = 0; index < MAX_MOTES; index++) {
      this.moteMesh.setMatrixAt(index, this.matrix);
      this.moteMesh.setColorAt(index, this.color.setHex(0xffffff));
      this.motes.push({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1 });
    }
    parent.add(this.moteMesh);
  }

  /** Looses a shot of `config` from `origin` along `direction` (unit), fired by weapon `source`. */
  public fire(origin: THREE.Vector3, direction: THREE.Vector3, config: WindWeaponConfig, source: WeaponId): void {
    const shot = this.shots[this.shotCursor];
    this.shotCursor = (this.shotCursor + 1) % MAX_SHOTS;
    shot.active = true;
    shot.config = config;
    shot.source = source;
    shot.x = origin.x;
    shot.y = origin.y;
    shot.z = origin.z;
    shot.direction.copy(direction);
    shot.travelled = 0;
    const { look } = config;
    shot.coreMaterial.color.setHex(look.core);
    shot.coreMaterial.opacity = Math.min(1, 0.9 * look.intensity);
    shot.streakMaterial.color.setHex(look.color);
    shot.streakMaterial.opacity = Math.min(1, 0.42 * look.intensity);
    shot.ringMaterial.color.setHex(look.color);
    shot.ringMaterial.opacity = Math.min(1, 0.6 * look.intensity);
    shot.group.scale.setScalar(look.intensity);
    shot.group.quaternion.setFromUnitVectors(Z_AXIS, direction);
    // Shown a little ahead of the eye on its first frame, never over the lens.
    shot.group.position.copy(origin).addScaledVector(direction, FIRST_FRAME_LEAD);
    shot.group.visible = true;
  }

  public update(dt: number): void {
    this.time += dt;
    for (const shot of this.shots) {
      if (shot.active) this.advance(shot, dt);
    }
    for (const burst of this.bursts) {
      if (burst.life > 0) this.updateBurst(burst, dt);
    }
    this.updateMotes(dt);
  }

  public reset(): void {
    for (const shot of this.shots) {
      shot.active = false;
      shot.group.visible = false;
    }
    for (const burst of this.bursts) {
      burst.life = 0;
      burst.wave.visible = burst.puff.visible = false;
    }
    this.matrix.makeScale(0, 0, 0);
    for (let index = 0; index < MAX_MOTES; index++) {
      this.motes[index].life = 0;
      this.moteMesh.setMatrixAt(index, this.matrix);
    }
    this.moteMesh.instanceMatrix.needsUpdate = true;
  }

  private advance(shot: Shot, dt: number): void {
    const config = shot.config as WindWeaponConfig;
    const step = Math.min(config.projectileSpeed * dt, config.range - shot.travelled);
    this.segmentOrigin.set(shot.x, shot.y, shot.z);
    this.raycaster.set(this.segmentOrigin, shot.direction);
    this.raycaster.near = 0;
    this.raycaster.far = step + SHOT_RADIUS;
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.colliders, false, this.hits);
    const hit = this.hits.length > 0 ? resolveSegmentHit(this.hits) ?? this.hits[0] : null;
    if (hit) {
      this.land(shot, hit.point, hit.object, shot.travelled + hit.distance);
      return;
    }
    shot.x += shot.direction.x * step;
    shot.y += shot.direction.y * step;
    shot.z += shot.direction.z * step;
    shot.travelled += step;
    if (shot.travelled >= config.range - 1e-6) {
      this.land(shot, this.point.set(shot.x, shot.y, shot.z), null, shot.travelled);
      return;
    }
    shot.group.position.set(shot.x, shot.y, shot.z);
    const spin = this.time * RING_SPIN;
    shot.rings[0].rotation.z = spin;
    shot.rings[1].rotation.z = -spin * 0.8;
    shot.core.scale.setScalar(1 + 0.12 * Math.sin(this.time * 41));
  }

  private land(shot: Shot, point: THREE.Vector3, object: THREE.Object3D | null, distance: number): void {
    const config = shot.config as WindWeaponConfig;
    const source = shot.source as WeaponId;
    shot.active = false;
    shot.group.visible = false;
    this.spawnBurst(point, shot.direction, config);
    this.onImpact?.(point, object, distance, config, source);
  }

  private spawnBurst(point: THREE.Vector3, direction: THREE.Vector3, config: WindWeaponConfig): void {
    const burst = this.bursts[this.burstCursor];
    this.burstCursor = (this.burstCursor + 1) % MAX_BURSTS;
    const { look } = config;
    burst.life = BURST_SECONDS;
    burst.radius = config.burstRadius * WAVE_REACH;
    burst.intensity = look.intensity;
    burst.waveMaterial.color.setHex(look.color);
    burst.puffMaterial.color.setHex(look.core);
    burst.wave.position.copy(point);
    burst.wave.quaternion.setFromUnitVectors(Z_AXIS, direction);
    burst.puff.position.copy(point);
    burst.wave.visible = burst.puff.visible = true;
    this.updateBurst(burst, 0);
    // Stone dust stirred by the wind: grey, tinged with the shot's colour.
    this.color.setHex(DUST_COLOR).lerp(this.tint.setHex(look.color), 0.45);
    for (let index = 0; index < this.motesPerBurst; index++) {
      const mote = this.motes[this.moteCursor];
      this.moteMesh.setColorAt(this.moteCursor, this.color);
      this.moteCursor = (this.moteCursor + 1) % MAX_MOTES;
      const angle = (index / this.motesPerBurst) * Math.PI * 2 + this.time * 3.1;
      const speed = 2.4 + (index % 3) * 0.9;
      mote.life = MOTE_SECONDS;
      mote.x = point.x;
      mote.y = point.y;
      mote.z = point.z;
      mote.vx = Math.cos(angle) * speed;
      mote.vy = 0.6 + (index % 4) * 0.35;
      mote.vz = Math.sin(angle) * speed;
      mote.size = 0.7 + (index % 3) * 0.3;
    }
    if (this.moteMesh.instanceColor) this.moteMesh.instanceColor.needsUpdate = true;
  }

  private updateBurst(burst: Burst, dt: number): void {
    burst.life = Math.max(0, burst.life - dt);
    if (burst.life <= 0) {
      burst.wave.visible = burst.puff.visible = false;
      return;
    }
    const t = 1 - burst.life / BURST_SECONDS;
    const out = 1 - (1 - t) * (1 - t);
    const fade = (1 - t) * (1 - t);
    burst.wave.scale.setScalar(0.25 + out * (burst.radius - 0.25));
    burst.waveMaterial.opacity = Math.min(1, 0.55 * fade * burst.intensity);
    burst.puff.scale.setScalar((0.15 + 0.5 * out) * burst.intensity);
    burst.puffMaterial.opacity = Math.min(1, 0.35 * fade * burst.intensity);
  }

  private updateMotes(dt: number): void {
    let dirty = false;
    const drag = Math.exp(-4 * dt);
    for (let index = 0; index < MAX_MOTES; index++) {
      const mote = this.motes[index];
      if (mote.life <= 0) continue;
      dirty = true;
      mote.life -= dt;
      if (mote.life <= 0) {
        this.matrix.makeScale(0, 0, 0);
        this.moteMesh.setMatrixAt(index, this.matrix);
        continue;
      }
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      mote.z += mote.vz * dt;
      mote.vx *= drag;
      mote.vy = mote.vy * drag - 1.2 * dt;
      mote.vz *= drag;
      const scale = mote.size * (mote.life / MOTE_SECONDS);
      this.matrix.makeRotationY(mote.life * 9 + index).scale(this.point.set(scale, scale, scale)).setPosition(mote.x, mote.y, mote.z);
      this.moteMesh.setMatrixAt(index, this.matrix);
    }
    if (dirty) this.moteMesh.instanceMatrix.needsUpdate = true;
  }
}
