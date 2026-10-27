import * as THREE from 'three';

/** Height and width of one tongue of fire, metres, before its anchor's own sway. */
const TONGUE_HEIGHT = 0.42;
const TONGUE_WIDTH = 0.24;
/** The tongue's foot sits a little below its anchor so the fire wraps the limb. */
const TONGUE_SINK = 0.08;
/** Seconds over which a dying burn fades out. */
const FADE_SECONDS = 0.6;
/** Brightest the fire gets: enough to read the burn, never enough to hide the body. */
const MAX_STRENGTH = 0.85;
const VERTICES_PER_TONGUE = 8;

const VERTEX_SHADER = /* glsl */ `
  attribute float tongue;
  varying vec2 vUv;
  varying float vTongue;
  void main() {
    vUv = uv;
    vTongue = tongue;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Licking flame from value noise: narrows to the tip, flickers upwards, orange body and yellow heart. */
const FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  varying vec2 vUv;
  varying float vTongue;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float seed = vTongue * 7.31;
    float n = noise(vec2(vUv.x * 3.0 + seed, vUv.y * 4.0 - uTime * 3.4)) * 0.6
      + noise(vec2(vUv.x * 7.0 - seed, vUv.y * 9.0 - uTime * 5.3)) * 0.4;
    float halfWidth = (1.0 - vUv.y) * 0.42 + 0.06;
    float side = abs(vUv.x - 0.5) + (n - 0.5) * 0.22;
    float body = 1.0 - smoothstep(halfWidth * 0.55, halfWidth, side);
    body *= smoothstep(0.0, 0.14, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y + (n - 0.5) * 0.55));
    float heat = body * (0.55 + 0.65 * n);
    vec3 color = mix(vec3(0.85, 0.16, 0.03), vec3(1.0, 0.74, 0.28), clamp(heat * 1.3 - vUv.y * 0.5, 0.0, 1.0));
    gl_FragColor = vec4(color * heat, uStrength);
  }
`;

/**
 * Fire on one burning zombie (ФАКЕЛ-33): a few tongues of flame standing on
 * animated joints (hips, chest, head, forearms, thighs), each a crossed pair
 * of quads that always rise along world up whatever the body's pose, so
 * they read from any angle and keep burning on a falling corpse. One fixed
 * buffer per pooled zombie, rewritten in place; hidden (no draw call) while
 * the body is not burning. Kept translucent and sparse so the zombie and
 * its movement stay readable through the fire.
 */
export class ZombieFlames {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly positions: Float32Array;
  private readonly attribute: THREE.BufferAttribute;
  private time = Math.random() * 10;
  private readonly anchor = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly sideA = new THREE.Vector3();
  private readonly sideB = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly inverse = new THREE.Matrix4();

  /** `anchors` are animated joints of the body; the mesh's parent must be an ancestor of all of them. */
  constructor(private readonly anchors: readonly THREE.Object3D[]) {
    const count = anchors.length;
    this.positions = new Float32Array(count * VERTICES_PER_TONGUE * 3);
    this.attribute = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    const uvs = new Float32Array(count * VERTICES_PER_TONGUE * 2);
    const tongues = new Float32Array(count * VERTICES_PER_TONGUE);
    const indices: number[] = [];
    for (let tongue = 0; tongue < count; tongue++) {
      for (let quad = 0; quad < 2; quad++) {
        const base = tongue * VERTICES_PER_TONGUE + quad * 4;
        // Corners: bottom-left, bottom-right, top-left, top-right.
        uvs.set([0, 0, 1, 0, 0, 1, 1, 1], base * 2);
        indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      }
      tongues.fill(tongue, tongue * VERTICES_PER_TONGUE, (tongue + 1) * VERTICES_PER_TONGUE);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', this.attribute);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('tongue', new THREE.BufferAttribute(tongues, 1));
    geometry.setIndex(indices);
    this.mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
      name: 'zombie_flames',
      uniforms: { uTime: { value: 0 }, uStrength: { value: 0 } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      forceSinglePass: true,
    }));
    this.mesh.name = 'zombie-flames';
    this.mesh.visible = false;
    // Skinned bodies move far from any static bounds; the buffer is tiny.
    this.mesh.frustumCulled = false;
  }

  /**
   * `burning` is the seconds of fire left on the body; the last ones fade.
   * `opacity` follows the body's own death fade.
   */
  /** `fury` (1 by default) grows the tongues of a body that is burning to death. */
  update(dt: number, burning: number, opacity: number, fury = 1): void {
    const parent = this.mesh.parent;
    const strength = Math.min(1, Math.min(1, burning / FADE_SECONDS) * opacity * MAX_STRENGTH * Math.sqrt(fury));
    if (strength <= 0 || !parent || this.anchors.length === 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    this.time += dt;
    const uniforms = this.mesh.material.uniforms;
    uniforms.uTime.value = this.time;
    uniforms.uStrength.value = strength;

    // World up and metres, expressed in the parent's (possibly scaled and tipped) space.
    parent.updateWorldMatrix(true, false);
    this.inverse.copy(parent.matrixWorld).invert();
    parent.getWorldScale(this.scale);
    const unit = 1 / Math.max(1e-4, this.scale.y);
    this.up.set(0, 1, 0).transformDirection(this.inverse);
    this.sideA.set(1, 0, 0).transformDirection(this.inverse);
    this.sideA.addScaledVector(this.up, -this.sideA.dot(this.up)).normalize();
    this.sideB.crossVectors(this.up, this.sideA);
    for (let tongue = 0; tongue < this.anchors.length; tongue++) {
      this.anchors[tongue].getWorldPosition(this.anchor).applyMatrix4(this.inverse);
      const sway = (Math.sin(this.time * 2.3 + tongue * 1.7) * 0.15 + 0.92) * fury;
      this.writeQuad(tongue * VERTICES_PER_TONGUE, this.sideA, unit, sway);
      this.writeQuad(tongue * VERTICES_PER_TONGUE + 4, this.sideB, unit, sway);
    }
    this.attribute.needsUpdate = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }

  private writeQuad(vertex: number, side: THREE.Vector3, unit: number, sway: number): void {
    const half = TONGUE_WIDTH * 0.5 * unit;
    const bottom = -TONGUE_SINK * unit;
    const top = TONGUE_HEIGHT * sway * unit;
    const { positions, anchor, up } = this;
    for (let corner = 0; corner < 4; corner++) {
      const across = corner % 2 === 0 ? -half : half;
      const along = corner < 2 ? bottom : top;
      const offset = (vertex + corner) * 3;
      positions[offset] = anchor.x + side.x * across + up.x * along;
      positions[offset + 1] = anchor.y + side.y * across + up.y * along;
      positions[offset + 2] = anchor.z + side.z * across + up.z * along;
    }
  }
}
