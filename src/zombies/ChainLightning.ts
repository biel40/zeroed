import * as THREE from 'three';
import type { ArcShotLook } from '../weapons/WeaponShotLook';
import { ElectricArcs } from './guardians/ElectricArcs';
import { CHAIN_MAX_TARGETS } from './ZombieConfig';

// One pooled arc per possible hop: a full chain is CHAIN_MAX_TARGETS zombies
// plus the muzzle, i.e. CHAIN_MAX_TARGETS consecutive segments. Keeping the
// pool derived from the tuning constant prevents the visuals from silently
// truncating a long chain.
const MAX_CHAINS = CHAIN_MAX_TARGETS;
const SEGMENTS_PER_CHAIN = 9;
const ARC_LIFETIME = 0.28;
const ARC_COLOR = 0x9fe0ff;
/** Metres the dark envelope of a restyled arc reaches past its bright core. */
const SHROUD_WIDTH = 0.03;
const SHROUD_OPACITY = 0.6;
/** Forks crackling off each hop of a restyled arc, their reach and how long they live. */
const FORK = { perHop: 2, minReach: 0.35, extraReach: 0.45, jitter: 0.12, life: ARC_LIFETIME * 0.8 } as const;

interface ArcBolt {
  active: boolean;
  life: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  /** Same tube pushed outwards and drawn dark over the scene; shown only for a look. */
  shroud: THREE.Mesh;
  shroudMaterial: THREE.MeshBasicMaterial;
}

/** A dark copy of the arc's material that pushes the tube out along its normals. */
function createShroudMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    blending: THREE.NormalBlending,
    depthWrite: false,
    toneMapped: false,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\ntransformed += normal * ${SHROUD_WIDTH.toFixed(3)};`,
    );
  };
  material.customProgramCacheKey = () => 'chain-lightning-shroud';
  return material;
}

/**
 * Tesla chain-lightning arcs: a pooled set of jagged, additive line-tubes
 * between consecutive electrocuted zombies. Each bolt is a single
 * TubeGeometry rebuilt on fire along a randomized zigzag path — pooled so
 * counts are hard-capped. Zombies-only system constructed for ZEUS-77
 * projectiles. A discharge with an `ArcShotLook` (an upgraded weapon)
 * recolours the arcs, wraps them in a dark envelope sharing their tube and,
 * with `detailed` effects, adds pooled forks; still one light for it all.
 */
export class ChainLightning {
  private readonly arcs: ArcBolt[] = [];
  private readonly forks: ElectricArcs;
  private readonly pointLight: THREE.PointLight;
  private readonly forkFrom = new THREE.Vector3();
  private readonly forkTo = new THREE.Vector3();

  public constructor(parent: THREE.Object3D, private readonly random: () => number = Math.random) {
    for (let i = 0; i < MAX_CHAINS; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: ARC_COLOR,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      // A placeholder tube; replaced on every fire with the fresh zigzag.
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      const shroudMaterial = createShroudMaterial();
      const shroud = new THREE.Mesh(mesh.geometry, shroudMaterial);
      shroud.visible = false;
      shroud.frustumCulled = false;
      // Under the additive core, so the arc burns out of its dark envelope.
      shroud.renderOrder = -1;
      parent.add(shroud, mesh);
      this.arcs.push({ active: false, life: 0, mesh, material, shroud, shroudMaterial });
    }
    this.forks = new ElectricArcs(MAX_CHAINS * FORK.perHop, random);
    parent.add(this.forks.group);
    // One shared light for the whole discharge — never a light per arc.
    this.pointLight = new THREE.PointLight(ARC_COLOR, 0, 14, 1.8);
    parent.add(this.pointLight);
  }

  /**
   * Fires one arc per consecutive pair of points (muzzle → zombie₁ →
   * zombie₂ → …). `points` are world-space; the first is the muzzle or the
   * impact point, the rest the electrocuted zombies' chest positions.
   * `look` restyles the arcs; `detailed` lets it add its forks.
   */
  public discharge(points: readonly THREE.Vector3[], look: ArcShotLook | null = null, detailed = true): void {
    for (let i = 0; i < points.length - 1 && i < MAX_CHAINS; i++) {
      this.spawnArc(points[i], points[i + 1], look);
      if (look && detailed) this.spawnForks(points[i], points[i + 1], look.branch);
    }
    if (points.length > 0) {
      this.pointLight.color.setHex(look?.core ?? ARC_COLOR);
      this.pointLight.position.copy(points[0]);
      this.pointLight.intensity = 8;
    }
  }

  public update(dt: number): void {
    for (const arc of this.arcs) {
      if (!arc.active) continue;
      arc.life -= dt;
      if (arc.life <= 0) {
        arc.active = false;
        arc.mesh.visible = false;
        arc.shroud.visible = false;
        arc.material.opacity = 0;
        arc.shroudMaterial.opacity = 0;
        continue;
      }
      const t = arc.life / ARC_LIFETIME;
      // Flicker: opacity stutters like a real discharge, fading out overall.
      arc.material.opacity = t * (0.55 + 0.45 * Math.abs(Math.sin(arc.life * 90)));
      // The dark energy surges out of step with the light.
      arc.shroudMaterial.opacity = t * SHROUD_OPACITY * (0.7 + 0.3 * Math.abs(Math.sin(arc.life * 53 + 1.3)));
    }
    this.forks.update(dt);
    this.pointLight.intensity =
      this.pointLight.intensity > 0.02 ? this.pointLight.intensity * Math.exp(-20 * dt) : 0;
  }

  private spawnArc(from: THREE.Vector3, to: THREE.Vector3, look: ArcShotLook | null): void {
    const arc = this.arcs.find((a) => !a.active) ?? this.arcs[0];
    arc.active = true;
    arc.life = ARC_LIFETIME;

    // Jagged path: straight spine from→to, midpoints jittered sideways.
    const points: THREE.Vector3[] = [];
    const perp = new THREE.Vector3();
    const up = Math.abs(to.y - from.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const dir = new THREE.Vector3().subVectors(to, from);
    perp.crossVectors(dir, up).normalize();
    for (let s = 0; s <= SEGMENTS_PER_CHAIN; s++) {
      const t = s / SEGMENTS_PER_CHAIN;
      const p = new THREE.Vector3().lerpVectors(from, to, t);
      if (s > 0 && s < SEGMENTS_PER_CHAIN) {
        const jitter = 0.22 * Math.sin(t * Math.PI);
        p.addScaledVector(perp, (this.random() * 2 - 1) * jitter);
        p.y += (this.random() * 2 - 1) * jitter * 0.6;
      }
      points.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, SEGMENTS_PER_CHAIN * 2, 0.012, 4, false);
    arc.mesh.geometry.dispose();
    arc.mesh.geometry = geometry;
    arc.shroud.geometry = geometry;
    arc.material.color.setHex(look?.core ?? ARC_COLOR);
    arc.material.opacity = 1;
    arc.mesh.visible = true;
    arc.shroud.visible = look !== null;
    if (look) {
      arc.shroudMaterial.color.setHex(look.shroud);
      arc.shroudMaterial.opacity = SHROUD_OPACITY;
    }
  }

  /** Short forks off the hop from→to, each from a point along it out in a random direction. */
  private spawnForks(from: THREE.Vector3, to: THREE.Vector3, color: number): void {
    for (let fork = 0; fork < FORK.perHop; fork++) {
      this.forkFrom.lerpVectors(from, to, 0.2 + this.random() * 0.6);
      this.forkTo.set(this.random() * 2 - 1, this.random() * 2 - 1, this.random() * 2 - 1);
      if (this.forkTo.lengthSq() < 1e-6) this.forkTo.set(0, 1, 0);
      this.forkTo.normalize().multiplyScalar(FORK.minReach + this.random() * FORK.extraReach).add(this.forkFrom);
      this.forks.strike(this.forkFrom, this.forkTo, FORK.life, FORK.jitter, color);
    }
  }
}
