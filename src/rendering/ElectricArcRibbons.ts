import * as THREE from 'three';

/** Size and temper of a set of arcs, in the units of the space they crawl over. */
export interface ElectricArcStyle {
  readonly arcs: number;
  readonly pointsPerArc: number;
  /** Seconds between re-rolled paths: fast enough to crackle, slow enough to read. */
  readonly rerollInterval: number;
  readonly halfWidth: number;
  /** Furthest a bolt's middle strays from the straight line between its ends. */
  readonly jitter: number;
  /** Random offset of each end around its anchor. */
  readonly skinOffset: number;
  readonly color: number;
  /** Chance an arc fires on each re-roll; the others stay dark until the next. */
  readonly activeChance: number;
}

/**
 * Electric charge crawling over an object: a few jagged bolts between random
 * anchors, re-rolled many times a second. Each bolt is a crossed pair of flat
 * ribbons so it reads from any angle without a camera-facing pass. One fixed
 * buffer updated in place; hidden (no draw call) while there is no charge.
 * The random source is injected so the paths are reproducible in tests.
 */
export class ElectricArcRibbons {
  public readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private readonly positions: Float32Array;
  private readonly attribute: THREE.BufferAttribute;
  /** Per arc: two anchor indices. */
  private readonly ends: Uint8Array;
  /** Per arc: 1 when it fired on the last re-roll. */
  private readonly active: Uint8Array;
  /** Per arc and point: two jitter factors in -1..1. */
  private readonly jitter: Float32Array;
  private readonly endOffsets: Float32Array;
  private rerollTimer = 0;
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly sideA = new THREE.Vector3();
  private readonly sideB = new THREE.Vector3();

  /** `anchors` are objects spread over the charged body; at least two light it up. */
  public constructor(
    private readonly anchors: readonly THREE.Object3D[],
    private readonly style: ElectricArcStyle,
    private readonly random: () => number = Math.random,
  ) {
    const { arcs, pointsPerArc } = style;
    this.ends = new Uint8Array(arcs * 2);
    this.active = new Uint8Array(arcs);
    this.jitter = new Float32Array(arcs * pointsPerArc * 2);
    this.endOffsets = new Float32Array(arcs * 6);
    this.positions = new Float32Array(arcs * pointsPerArc * 4 * 3);
    this.attribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    const indices: number[] = [];
    for (let arc = 0; arc < arcs; arc++) {
      for (let p = 0; p < pointsPerArc - 1; p++) {
        const a = (arc * pointsPerArc + p) * 4;
        const b = a + 4;
        // Ribbon A uses vertices 0/1 of each point, ribbon B vertices 2/3.
        for (const side of [0, 2]) indices.push(a + side, a + side + 1, b + side, b + side, a + side + 1, b + side + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', this.attribute);
    geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color: style.color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
      // Additive is order independent: one pass instead of back + front.
      forceSinglePass: true,
    }));
    this.mesh.name = 'electric-arcs';
    this.mesh.visible = false;
    // Animated anchors move far from any static bounds; the buffer is tiny.
    this.mesh.frustumCulled = false;
  }

  /**
   * `strength` 0..1 drives visibility and brightness; positions are written
   * in the space of the mesh's parent, which must be an ancestor of the anchors.
   */
  public update(dt: number, strength: number): void {
    const parent = this.mesh.parent;
    if (strength <= 0 || !parent || this.anchors.length < 2) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.rerollTimer -= dt;
    if (this.rerollTimer <= 0) {
      this.rerollTimer = this.style.rerollInterval;
      this.reroll();
    }
    // Discharges stutter: brightness jumps every frame within the charge.
    this.mesh.material.opacity = strength * (0.65 + 0.35 * this.random());
    for (let arc = 0; arc < this.style.arcs; arc++) this.writeArc(arc, parent);
    this.attribute.needsUpdate = true;
  }

  public hide(): void {
    this.mesh.visible = false;
    this.rerollTimer = 0;
  }

  private reroll(): void {
    const count = this.anchors.length;
    const { random } = this;
    for (let arc = 0; arc < this.style.arcs; arc++) {
      const a = Math.floor(random() * count);
      this.ends[arc * 2] = a;
      this.ends[arc * 2 + 1] = (a + 1 + Math.floor(random() * (count - 1))) % count;
      this.active[arc] = random() < this.style.activeChance ? 1 : 0;
    }
    for (let i = 0; i < this.jitter.length; i++) this.jitter[i] = random() * 2 - 1;
    for (let i = 0; i < this.endOffsets.length; i++) this.endOffsets[i] = (random() * 2 - 1) * this.style.skinOffset;
  }

  private writeArc(arc: number, parent: THREE.Object3D): void {
    const { pointsPerArc, halfWidth, jitter } = this.style;
    this.localPosition(this.anchors[this.ends[arc * 2]], parent, this.from);
    this.localPosition(this.anchors[this.ends[arc * 2 + 1]], parent, this.to);
    const o = arc * 6;
    this.from.x += this.endOffsets[o]; this.from.y += this.endOffsets[o + 1]; this.from.z += this.endOffsets[o + 2];
    this.to.x += this.endOffsets[o + 3]; this.to.y += this.endOffsets[o + 4]; this.to.z += this.endOffsets[o + 5];
    this.tangent.subVectors(this.to, this.from);
    const length = this.tangent.length();
    this.tangent.divideScalar(length || 1);
    // Two sides perpendicular to the bolt and to each other.
    this.sideA.set(0, 1, 0).cross(this.tangent);
    if (this.sideA.lengthSq() < 1e-6) this.sideA.set(1, 0, 0).cross(this.tangent);
    this.sideA.normalize();
    this.sideB.crossVectors(this.tangent, this.sideA);
    // An arc that did not fire collapses onto its chord with no width: no area, no pixels.
    const lit = this.active[arc];
    const amplitude = lit * jitter * Math.min(1, length * 1.5);
    for (let p = 0; p < pointsPerArc; p++) {
      const t = p / (pointsPerArc - 1);
      const envelope = Math.sin(t * Math.PI) * amplitude;
      const j = (arc * pointsPerArc + p) * 2;
      this.point.lerpVectors(this.from, this.to, t)
        .addScaledVector(this.sideA, this.jitter[j] * envelope)
        .addScaledVector(this.sideB, this.jitter[j + 1] * envelope);
      // The bolt tapers to a hair-thin tip at each end.
      const width = lit * halfWidth * (0.35 + 0.65 * Math.sin(t * Math.PI));
      const v = (arc * pointsPerArc + p) * 12;
      this.writeEdge(v, this.sideA, width);
      this.writeEdge(v + 6, this.sideB, width);
    }
  }

  /** Both edges of one ribbon at the current point. */
  private writeEdge(offset: number, side: THREE.Vector3, width: number): void {
    const { positions, point } = this;
    positions[offset] = point.x + side.x * width;
    positions[offset + 1] = point.y + side.y * width;
    positions[offset + 2] = point.z + side.z * width;
    positions[offset + 3] = point.x - side.x * width;
    positions[offset + 4] = point.y - side.y * width;
    positions[offset + 5] = point.z - side.z * width;
  }

  private localPosition(anchor: THREE.Object3D, parent: THREE.Object3D, out: THREE.Vector3): void {
    parent.worldToLocal(anchor.getWorldPosition(out));
  }
}
