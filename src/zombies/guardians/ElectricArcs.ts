import * as THREE from 'three';

/** Points along each bolt, ends included. */
const POINTS = 9;
/** Below this share of its life a bolt flickers between bright and dim. */
const FLICKER = 0.55;

interface Arc {
  readonly line: THREE.Line;
  readonly material: THREE.LineBasicMaterial;
  readonly positions: Float32Array;
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
  jitter: number;
  life: number;
  age: number;
}

/**
 * Jagged bolts of electricity: a fixed pool of lines, each re-jagged every
 * frame while it lives and fading out, drawn additively. Once all are out,
 * the oldest is reused. Allocation free after construction; the jitter
 * comes from the injected `random`.
 */
export class ElectricArcs {
  public readonly group = new THREE.Group();
  private readonly arcs: Arc[];
  private next = 0;

  public constructor(capacity: number, private readonly random: () => number, color = 0xa8dcff) {
    this.group.name = 'electric-arcs';
    this.arcs = Array.from({ length: capacity }, () => {
      const positions = new Float32Array(POINTS * 3);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const material = new THREE.LineBasicMaterial({
        color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      });
      const line = new THREE.Line(geometry, material);
      // Its points move every frame: no stale bounds may cull it.
      line.frustumCulled = false;
      line.visible = false;
      this.group.add(line);
      return { line, material, positions, from: new THREE.Vector3(), to: new THREE.Vector3(), jitter: 0, life: 1, age: 0 };
    });
  }

  /** A bolt from `from` to `to` for `life` seconds, kinked up to `jitter` metres off its line. */
  public strike(from: THREE.Vector3Like, to: THREE.Vector3Like, life: number, jitter: number): void {
    if (this.arcs.length === 0) return;
    const arc = this.arcs[this.next];
    this.next = (this.next + 1) % this.arcs.length;
    arc.from.set(from.x, from.y, from.z);
    arc.to.set(to.x, to.y, to.z);
    arc.jitter = jitter;
    arc.life = Math.max(0.01, life);
    arc.age = 0;
    arc.line.visible = true;
    this.draw(arc);
  }

  public update(dt: number): void {
    const step = Math.max(0, dt);
    for (const arc of this.arcs) {
      if (!arc.line.visible) continue;
      arc.age += step;
      if (arc.age >= arc.life) {
        arc.line.visible = false;
        continue;
      }
      this.draw(arc);
    }
  }

  public reset(): void {
    for (const arc of this.arcs) arc.line.visible = false;
  }

  public dispose(): void {
    for (const arc of this.arcs) {
      arc.line.geometry.dispose();
      arc.material.dispose();
    }
    this.group.removeFromParent();
  }

  /** A fresh kink of the bolt, widest at its middle, and its fading flicker. */
  private draw(arc: Arc): void {
    const { positions, from, to, jitter } = arc;
    for (let point = 0; point < POINTS; point++) {
      const along = point / (POINTS - 1);
      const swing = jitter * Math.sin(Math.PI * along);
      positions[point * 3] = from.x + (to.x - from.x) * along + (this.random() * 2 - 1) * swing;
      positions[point * 3 + 1] = from.y + (to.y - from.y) * along + (this.random() * 2 - 1) * swing;
      positions[point * 3 + 2] = from.z + (to.z - from.z) * along + (this.random() * 2 - 1) * swing;
    }
    arc.line.geometry.attributes.position.needsUpdate = true;
    const fade = 1 - arc.age / arc.life;
    arc.material.opacity = fade * (fade < FLICKER && this.random() < 0.4 ? 0.35 : 1);
  }
}
