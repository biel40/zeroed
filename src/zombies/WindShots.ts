import * as THREE from 'three';
import { resolveSegmentHit } from '../shooting/BallisticsSystem';
import { buildExhalisArrowGeometry, EXHALIS_ARROW } from '../weapons/ExhalisArrow';
import type { WeaponId, WindWeaponConfig } from '../weapons/WeaponTypes';
import { createWindShotStats, resolveWindShot, type WindShotStats } from './WindShotStats';

const MAX_SHOTS = 6;
const MAX_BURSTS = 4;
const MAX_MOTES = 72;
const MOTES_PER_BURST = 12;
/** Collision radius of a shot along its path, metres. */
const SHOT_RADIUS = 0.06;
/** The arrow in flight: the first-person arrow scaled up so it reads at range. */
const ARROW_SCALE = 1.7;
const ARROW_LENGTH = EXHALIS_ARROW.length * ARROW_SCALE;
/** Shown this far ahead of the eye on its first frame: the whole arrow clears the lens. */
const FIRST_FRAME_LEAD = ARROW_LENGTH + 0.3;
const STREAK_LENGTH = 1.5;
const STREAK_RADIUS = 0.045;
/** Two open wind rings turning round the shot in opposite senses. */
const RING_RADIUS = 0.11;
const RING_ARC = Math.PI * 1.35;
const RING_SPIN = 26;
/** Arrowhead colour of a quick shot; a full draw brightens it towards the shot's core colour. */
const HEAD_COLOR = 0xb08a4e;
const SHAFT_COLOR = 0xcfc4ab;
const BURST_SECONDS = 0.42;
/**
 * The burst's air-pressure rings: flat, spreading across the floor plane of
 * the impact, the last reaching the burst's gameplay radius as it fades;
 * each starts `RING_STAGGER` seconds after the one before.
 */
const PRESSURE_RINGS = 3;
const RING_STAGGER = 0.06;
/** Share of the burst radius the pressure front across the shot's path grows to: it never fills the screen. */
const FRONT_REACH = 0.45;
const MOTE_SECONDS = 0.6;
/** How much of a mote's speed follows the shot rather than the radial spread. */
const MOTE_DRIFT = 0.55;
const DUST_COLOR = 0x8a8478;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface Shot {
  active: boolean;
  config: WindWeaponConfig | null;
  source: WeaponId | null;
  /** The shot as loosed: the config scaled by its charge. */
  readonly stats: WindShotStats;
  x: number;
  y: number;
  z: number;
  readonly direction: THREE.Vector3;
  travelled: number;
  readonly group: THREE.Group;
  /** The trail (streak, core and rings), scaled with the shot's intensity; the arrow keeps its size. */
  readonly trail: THREE.Group;
  readonly core: THREE.Mesh;
  readonly coreMaterial: THREE.MeshBasicMaterial;
  readonly streakMaterial: THREE.MeshBasicMaterial;
  readonly rings: readonly THREE.Object3D[];
  readonly ringMaterial: THREE.MeshBasicMaterial;
  readonly headMaterial: THREE.MeshBasicMaterial;
  readonly runeMaterial: THREE.MeshBasicMaterial;
}

interface Burst {
  life: number;
  radius: number;
  intensity: number;
  readonly front: THREE.Mesh;
  readonly frontMaterial: THREE.MeshBasicMaterial;
  readonly rings: readonly THREE.Mesh[];
  readonly ringMaterials: readonly THREE.MeshBasicMaterial[];
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
 * lights and no allocations per shot or per frame. A shot is the bow's
 * arrow, scaled up to read at range, riding a pale streak with two open
 * wind rings turning round it; it travels in a straight line,
 * segment-raycast against the shared colliders with the same head priority
 * as bullets, and bursts on the first thing it meets or where its reach
 * runs out: flat air-pressure rings spreading across the floor plane out to
 * the burst's gameplay radius, a smaller pressure front across its path, a
 * soft puff and stone dust blown on along the shot. The charge it was drawn
 * to scales its speed, reach and every effect (`WindShotStats`), and every
 * colour comes from the shot's own `WindWeaponConfig.look`. Reduced effects
 * keep half the dust. What the burst does is the caller's (`onImpact`).
 */
export class WindShots {
  /**
   * A shot burst at `point`: `object` is what it struck (null when its reach
   * ran out), `distance` how far it flew, `stats` the shot as loosed and
   * `direction` its unit flight direction. Both are pooled: read them, never keep them.
   */
  public onImpact:
    | ((point: THREE.Vector3, object: THREE.Object3D | null, distance: number, stats: WindShotStats,
      direction: THREE.Vector3, source: WeaponId) => void)
    | null = null;

  private readonly shots: Shot[] = [];
  private readonly bursts: Burst[] = [];
  private readonly motes: Mote[] = [];
  private readonly moteMesh: THREE.InstancedMesh;
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly segmentOrigin = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly drift = new THREE.Vector3();
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
    // The arrow points along the group's +Z with its tip on the shot's position.
    const arrow = buildExhalisArrowGeometry();
    for (const geometry of [arrow.body, arrow.metal, arrow.runes]) {
      geometry.rotateY(Math.PI).translate(0, 0, -EXHALIS_ARROW.length).scale(ARROW_SCALE, ARROW_SCALE, ARROW_SCALE);
    }
    const shaftMaterial = new THREE.MeshBasicMaterial({ color: SHAFT_COLOR, side: THREE.DoubleSide });
    for (let index = 0; index < MAX_SHOTS; index++) {
      const group = new THREE.Group();
      group.name = 'wind-shot';
      group.visible = false;
      const trail = new THREE.Group();
      const coreMaterial = additive(0xffffff);
      const streakMaterial = additive(0xffffff);
      const ringMaterial = additive(0xffffff);
      const headMaterial = new THREE.MeshBasicMaterial({ color: HEAD_COLOR });
      const runeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
      const coreMesh = new THREE.Mesh(core, coreMaterial);
      const streakMesh = new THREE.Mesh(streak, streakMaterial);
      const rings = [0, 1].map((turn) => {
        const mesh = new THREE.Mesh(ring, ringMaterial);
        mesh.position.z = -0.22 - turn * 0.26;
        mesh.scale.setScalar(1 - turn * 0.2);
        return mesh;
      });
      trail.add(coreMesh, streakMesh, ...rings);
      const arrowMeshes = [
        new THREE.Mesh(arrow.body, shaftMaterial),
        new THREE.Mesh(arrow.metal, headMaterial),
        new THREE.Mesh(arrow.runes, runeMaterial),
      ];
      group.add(trail, ...arrowMeshes);
      for (const mesh of [coreMesh, streakMesh, ...rings, ...arrowMeshes]) mesh.frustumCulled = false;
      parent.add(group);
      this.shots.push({
        active: false, config: null, source: null, stats: createWindShotStats(), x: 0, y: 0, z: 0,
        direction: new THREE.Vector3(0, 0, 1), travelled: 0,
        group, trail, core: coreMesh, coreMaterial, streakMaterial, rings, ringMaterial, headMaterial, runeMaterial,
      });
    }

    // The front faces along +Z: turned to the shot, it spreads across the shot's path.
    const front = new THREE.RingGeometry(0.72, 1, 36, 1);
    // The pressure rings lie flat: thin, so their overlap stays cheap.
    const pressure = new THREE.RingGeometry(0.93, 1, 48, 1).rotateX(-Math.PI / 2);
    const puff = new THREE.IcosahedronGeometry(1, 1);
    for (let index = 0; index < MAX_BURSTS; index++) {
      const frontMaterial = additive(0xffffff);
      const puffMaterial = additive(0xffffff);
      const frontMesh = new THREE.Mesh(front, frontMaterial);
      const puffMesh = new THREE.Mesh(puff, puffMaterial);
      frontMesh.name = 'wind-burst-wave';
      const ringMaterials = Array.from({ length: PRESSURE_RINGS }, () => additive(0xffffff));
      const ringMeshes = ringMaterials.map((material) => {
        const mesh = new THREE.Mesh(pressure, material);
        mesh.name = 'wind-burst-ring';
        mesh.visible = false;
        return mesh;
      });
      frontMesh.visible = puffMesh.visible = false;
      parent.add(frontMesh, puffMesh, ...ringMeshes);
      this.bursts.push({
        life: 0, radius: 1, intensity: 1, front: frontMesh, frontMaterial, rings: ringMeshes, ringMaterials,
        puff: puffMesh, puffMaterial,
      });
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

  /**
   * Looses a shot of `config` drawn to `charge` (0..1) from `origin` along
   * `direction` (unit), fired by weapon `source`.
   */
  public fire(origin: THREE.Vector3, direction: THREE.Vector3, config: WindWeaponConfig, charge: number, source: WeaponId): void {
    const shot = this.shots[this.shotCursor];
    this.shotCursor = (this.shotCursor + 1) % MAX_SHOTS;
    const stats = resolveWindShot(config, charge, shot.stats);
    shot.active = true;
    shot.config = config;
    shot.source = source;
    shot.x = origin.x;
    shot.y = origin.y;
    shot.z = origin.z;
    shot.direction.copy(direction);
    shot.travelled = 0;
    const { look } = config;
    const intensity = stats.intensity;
    shot.coreMaterial.color.setHex(look.core);
    shot.coreMaterial.opacity = Math.min(1, 0.9 * intensity);
    shot.streakMaterial.color.setHex(look.color);
    shot.streakMaterial.opacity = Math.min(1, 0.42 * intensity);
    shot.ringMaterial.color.setHex(look.color);
    shot.ringMaterial.opacity = Math.min(1, 0.6 * intensity);
    shot.headMaterial.color.setHex(HEAD_COLOR).lerp(this.tint.setHex(look.core), 0.25 + 0.45 * stats.charge);
    shot.runeMaterial.color.setHex(look.color).multiplyScalar(0.7 + 0.6 * stats.charge);
    shot.trail.scale.setScalar(intensity);
    shot.group.quaternion.setFromUnitVectors(Z_AXIS, direction);
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
      this.hideBurst(burst);
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
    const step = Math.min(shot.stats.projectileSpeed * dt, config.range - shot.travelled);
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
    // Never drawn behind its first-frame lead, so the arrow never crosses the lens.
    const shown = Math.max(shot.travelled, FIRST_FRAME_LEAD);
    shot.group.position.set(shot.x, shot.y, shot.z).addScaledVector(shot.direction, shown - shot.travelled);
    const spin = this.time * RING_SPIN;
    shot.rings[0].rotation.z = spin;
    shot.rings[1].rotation.z = -spin * 0.8;
    shot.core.scale.setScalar(1 + 0.12 * Math.sin(this.time * 41));
  }

  private land(shot: Shot, point: THREE.Vector3, object: THREE.Object3D | null, distance: number): void {
    const source = shot.source as WeaponId;
    shot.active = false;
    shot.group.visible = false;
    this.spawnBurst(point, shot.direction, shot.config as WindWeaponConfig, shot.stats);
    this.onImpact?.(point, object, distance, shot.stats, shot.direction, source);
  }

  private spawnBurst(point: THREE.Vector3, direction: THREE.Vector3, config: WindWeaponConfig, stats: WindShotStats): void {
    const burst = this.bursts[this.burstCursor];
    this.burstCursor = (this.burstCursor + 1) % MAX_BURSTS;
    const { look } = config;
    burst.life = BURST_SECONDS;
    burst.radius = stats.burstRadius;
    burst.intensity = stats.intensity;
    burst.frontMaterial.color.setHex(look.color);
    burst.puffMaterial.color.setHex(look.core);
    burst.front.position.copy(point);
    burst.front.quaternion.setFromUnitVectors(Z_AXIS, direction);
    burst.puff.position.copy(point);
    burst.front.visible = burst.puff.visible = true;
    for (let index = 0; index < PRESSURE_RINGS; index++) {
      burst.ringMaterials[index].color.setHex(index === 0 ? look.core : look.color);
      burst.rings[index].position.copy(point);
    }
    this.updateBurst(burst, 0);
    this.blowDust(point, direction, look.color, stats.intensity);
  }

  /** Stone dust stirred by the wind: grey, tinged with the shot's colour, spreading and blown on along the shot. */
  private blowDust(point: THREE.Vector3, direction: THREE.Vector3, color: number, intensity: number): void {
    this.color.setHex(DUST_COLOR).lerp(this.tint.setHex(color), 0.45);
    // Horizontal flight direction: the dust drifts on with the gust, never up or down the shot's pitch.
    this.drift.set(direction.x, 0, direction.z);
    const flat = this.drift.length();
    if (flat > 1e-4) this.drift.divideScalar(flat);
    for (let index = 0; index < this.motesPerBurst; index++) {
      const mote = this.motes[this.moteCursor];
      this.moteMesh.setColorAt(this.moteCursor, this.color);
      this.moteCursor = (this.moteCursor + 1) % MAX_MOTES;
      const angle = (index / this.motesPerBurst) * Math.PI * 2 + this.time * 3.1;
      const speed = (2.4 + (index % 3) * 0.9) * (0.8 + 0.3 * intensity);
      const onward = speed * MOTE_DRIFT;
      mote.life = MOTE_SECONDS;
      mote.x = point.x;
      mote.y = point.y;
      mote.z = point.z;
      mote.vx = Math.cos(angle) * speed + this.drift.x * onward;
      mote.vy = 0.6 + (index % 4) * 0.35;
      mote.vz = Math.sin(angle) * speed + this.drift.z * onward;
      mote.size = 0.7 + (index % 3) * 0.3;
    }
    if (this.moteMesh.instanceColor) this.moteMesh.instanceColor.needsUpdate = true;
  }

  private updateBurst(burst: Burst, dt: number): void {
    burst.life = Math.max(0, burst.life - dt);
    if (burst.life <= 0) {
      this.hideBurst(burst);
      return;
    }
    const elapsed = BURST_SECONDS - burst.life;
    const t = elapsed / BURST_SECONDS;
    const out = 1 - (1 - t) * (1 - t);
    const fade = (1 - t) * (1 - t);
    burst.front.scale.setScalar(0.25 + out * (burst.radius * FRONT_REACH - 0.25));
    burst.frontMaterial.opacity = Math.min(1, 0.5 * fade * burst.intensity);
    burst.puff.scale.setScalar((0.15 + 0.5 * out) * burst.intensity);
    burst.puffMaterial.opacity = Math.min(1, 0.35 * fade * burst.intensity);
    // Each ring has the rest of the burst to grow from nothing to its share of the radius;
    // the last one meets the gameplay edge as it fades out.
    const ringSeconds = BURST_SECONDS - RING_STAGGER * (PRESSURE_RINGS - 1);
    for (let index = 0; index < PRESSURE_RINGS; index++) {
      const ring = burst.rings[index];
      const local = (elapsed - RING_STAGGER * index) / ringSeconds;
      ring.visible = local > 0 && local < 1;
      if (!ring.visible) continue;
      const grow = 1 - (1 - local) * (1 - local);
      const reach = burst.radius * (1 - 0.12 * (PRESSURE_RINGS - 1 - index));
      ring.scale.setScalar(Math.max(0.05, grow * reach));
      burst.ringMaterials[index].opacity = Math.min(1, (0.5 - 0.1 * index) * (1 - local) * burst.intensity);
    }
  }

  private hideBurst(burst: Burst): void {
    burst.front.visible = burst.puff.visible = false;
    for (const ring of burst.rings) ring.visible = false;
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
