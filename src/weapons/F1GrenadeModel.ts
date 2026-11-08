import * as THREE from 'three';

/** Half the length of the cast body along its axis (+Y towards the fuse), metres. */
export const F1_BODY_HALF_LENGTH = 0.045;
const BODY_RADIUS = 0.0275;
/** Eight lengthwise and six crosswise grooves cut the "limonka" lattice. */
const LONG_GROOVES = 8;
const CROSS_GROOVES = 6;
const GROOVE_DEPTH = 0.11;

interface F1Geometries {
  readonly body: THREE.BufferGeometry;
  readonly collar: THREE.BufferGeometry;
  readonly fuse: THREE.BufferGeometry;
  readonly striker: THREE.BufferGeometry;
  readonly lever: THREE.BufferGeometry;
  readonly leverTop: THREE.BufferGeometry;
  readonly ring: THREE.BufferGeometry;
  readonly pin: THREE.BufferGeometry;
}

let shared: F1Geometries | null = null;

/** Egg-shaped cast body whose lattice of grooves is pressed into the lathe surface. */
function bodyGeometry(): THREE.BufferGeometry {
  const points: THREE.Vector2[] = [];
  const rows = 28;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    // A flat boss underneath and the neck of the fuse well on top.
    const radius = Math.max(0.006, BODY_RADIUS * Math.pow(Math.sin(Math.PI * (0.05 + 0.9 * t)), 0.62));
    points.push(new THREE.Vector2(radius, (t - 0.5) * 2 * F1_BODY_HALF_LENGTH));
  }
  const geometry = new THREE.LatheGeometry(points, 40);
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    vertex.fromBufferAttribute(position, index);
    const t = vertex.y / (2 * F1_BODY_HALF_LENGTH) + 0.5;
    const band = THREE.MathUtils.smoothstep(t, 0.08, 0.16) * (1 - THREE.MathUtils.smoothstep(t, 0.84, 0.92));
    const angle = Math.atan2(vertex.z, vertex.x);
    const lengthwise = Math.pow(Math.cos(angle * LONG_GROOVES / 2) ** 2, 14);
    const crosswise = Math.pow(Math.cos(Math.PI * t * CROSS_GROOVES) ** 2, 14);
    const scale = 1 - GROOVE_DEPTH * band * Math.max(lengthwise, crosswise);
    position.setXYZ(index, vertex.x * scale, vertex.y, vertex.z * scale);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function geometries(): F1Geometries {
  if (shared) return shared;
  const top = F1_BODY_HALF_LENGTH;
  const collar = new THREE.CylinderGeometry(0.0118, 0.0124, 0.008, 18);
  collar.translate(0, top + 0.002, 0);
  const fuse = new THREE.CylinderGeometry(0.0092, 0.0098, 0.021, 16);
  fuse.translate(0, top + 0.016, 0);
  const striker = new THREE.CylinderGeometry(0.0072, 0.0082, 0.006, 14);
  striker.translate(0.002, top + 0.029, 0);
  // The spoon runs down the body from the fuse head, bowed out over the lattice.
  const lever = new THREE.BoxGeometry(0.0026, 0.07, 0.011);
  lever.translate(0, -0.035, 0);
  lever.rotateZ(-0.12);
  lever.translate(BODY_RADIUS + 0.004, top + 0.026, 0);
  const leverTop = new THREE.BoxGeometry(0.02, 0.0026, 0.011);
  leverTop.translate(BODY_RADIUS * 0.45, top + 0.03, 0);
  const ring = new THREE.TorusGeometry(0.0115, 0.0016, 8, 22);
  ring.translate(-0.026, top + 0.017, 0);
  const pin = new THREE.CylinderGeometry(0.0009, 0.0009, 0.024, 6);
  pin.rotateZ(Math.PI / 2);
  pin.translate(-0.009, top + 0.017, 0);
  shared = { body: bodyGeometry(), collar, fuse, striker, lever, leverTop, ring, pin };
  return shared;
}

/**
 * The F-1 view: a segmented cast-iron body under the UZRGM fuse, its spoon
 * along the side and the pull ring. Geometry is shared; every call gets its
 * own materials, so a first-person copy can be depth-compressed without
 * touching the grenades thrown into the world. `outline` paints every part
 * with one shared material instead (a wall's chalk outline). Origin at the
 * body's centre, +Y towards the fuse.
 */
export class F1GrenadeModel {
  public readonly root = new THREE.Group();
  private readonly lever = new THREE.Group();
  private readonly pullRing = new THREE.Group();

  public constructor(castShadow = false, outline?: THREE.Material) {
    const parts = geometries();
    const iron = outline ?? new THREE.MeshStandardMaterial({ name: 'f1_iron', color: 0x4a5130, roughness: 0.82, metalness: 0.32 });
    const fuseSteel = outline ?? new THREE.MeshStandardMaterial({ name: 'f1_fuse', color: 0x75705f, roughness: 0.42, metalness: 0.72 });
    const spoonSteel = outline ?? new THREE.MeshStandardMaterial({ name: 'f1_spoon', color: 0x5d6048, roughness: 0.55, metalness: 0.6 });
    const ringSteel = outline ?? new THREE.MeshStandardMaterial({ name: 'f1_ring', color: 0xa39d86, roughness: 0.35, metalness: 0.85 });
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D): void => {
      const part = new THREE.Mesh(geometry, material);
      part.castShadow = castShadow;
      parent.add(part);
    };
    this.root.name = 'f1-grenade';
    mesh(parts.body, iron, this.root);
    mesh(parts.collar, fuseSteel, this.root);
    mesh(parts.fuse, fuseSteel, this.root);
    mesh(parts.striker, fuseSteel, this.root);
    this.lever.name = 'f1-lever';
    mesh(parts.lever, spoonSteel, this.lever);
    mesh(parts.leverTop, spoonSteel, this.lever);
    this.pullRing.name = 'f1-pull-ring';
    mesh(parts.ring, ringSteel, this.pullRing);
    mesh(parts.pin, ringSteel, this.pullRing);
    this.root.add(this.lever, this.pullRing);
  }

  /** The pull ring and its pin come out; the spoon stays held against the body. */
  public setPinPulled(pulled: boolean): void {
    this.pullRing.visible = !pulled;
  }

  /** Thrown: the spoon has flown off and the fuse is burning. */
  public setLive(live: boolean): void {
    this.lever.visible = !live;
    this.pullRing.visible = !live;
  }
}
