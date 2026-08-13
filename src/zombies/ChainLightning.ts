import * as THREE from 'three';

const MAX_CHAINS = 10;
const SEGMENTS_PER_CHAIN = 9;
const ARC_LIFETIME = 0.28;
const ARC_COLOR = 0x9fe0ff;

interface ArcBolt {
  active: boolean;
  life: number;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
}

/**
 * Tesla chain-lightning arcs: a pooled set of jagged, additive line-tubes
 * between consecutive electrocuted zombies. Each bolt is a single
 * TubeGeometry rebuilt on fire along a randomized zigzag path — pooled so
 * counts are hard-capped and nothing allocates per shot after warm-up.
 * Zombies mode only; the shooting range never constructs this.
 */
export class ChainLightning {
  private readonly arcs: ArcBolt[] = [];
  private readonly pointLight: THREE.PointLight;

  constructor(parent: THREE.Object3D) {
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
      parent.add(mesh);
      this.arcs.push({ active: false, life: 0, mesh, material });
    }
    // One shared light for the whole discharge — never a light per arc.
    this.pointLight = new THREE.PointLight(ARC_COLOR, 0, 14, 1.8);
    parent.add(this.pointLight);
  }

  /**
   * Fires one arc per consecutive pair of points (muzzle → zombie₁ →
   * zombie₂ → …). `points` are world-space; the first is the muzzle or the
   * impact point, the rest the electrocuted zombies' chest positions.
   */
  discharge(points: readonly THREE.Vector3[]): void {
    for (let i = 0; i < points.length - 1 && i < MAX_CHAINS; i++) {
      this.spawnArc(points[i], points[i + 1]);
    }
    if (points.length > 0) {
      this.pointLight.position.copy(points[0]);
      this.pointLight.intensity = 8;
    }
  }

  private spawnArc(from: THREE.Vector3, to: THREE.Vector3): void {
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
        p.addScaledVector(perp, (Math.random() * 2 - 1) * jitter);
        p.y += (Math.random() * 2 - 1) * jitter * 0.6;
      }
      points.push(p);
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, SEGMENTS_PER_CHAIN * 2, 0.012, 4, false);
    arc.mesh.geometry.dispose();
    arc.mesh.geometry = geometry;
    arc.material.opacity = 1;
    arc.mesh.visible = true;
  }

  update(dt: number): void {
    for (const arc of this.arcs) {
      if (!arc.active) continue;
      arc.life -= dt;
      if (arc.life <= 0) {
        arc.active = false;
        arc.mesh.visible = false;
        arc.material.opacity = 0;
        continue;
      }
      const t = arc.life / ARC_LIFETIME;
      // Flicker: opacity stutters like a real discharge, fading out overall.
      arc.material.opacity = t * (0.55 + 0.45 * Math.abs(Math.sin(arc.life * 90)));
    }
    this.pointLight.intensity =
      this.pointLight.intensity > 0.02 ? this.pointLight.intensity * Math.exp(-20 * dt) : 0;
  }
}
