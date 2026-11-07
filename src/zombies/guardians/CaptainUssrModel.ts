import * as THREE from 'three';
import { mergeAssemblies } from '../../weapons/ViewModelBatching';
import { seededRandom } from '../maps/shared/ProceduralNoise';
import { CAPTAIN_USSR_BODY as B, type Sides } from './CaptainUssrPose';
import { facetedStar, profileRadius, rounded, strap, turned, type ProfilePoint } from './CaptainUssrShapes';
import { buildCaptainUssrShield } from './CaptainUssrShield';
import { createCaptainUssrSurfaces, type CaptainUssrSurfaces } from './CaptainUssrSurfaces';

/**
 * The jointed body of CAPITÁN URSS, feet at the origin of `root`, facing
 * +z, about 2.3 m tall. Joints are bare groups the view poses; their
 * meshes are merged per material. `shield` is built apart because it
 * leaves the hand when thrown or dropped; `shieldMount` (on the spine) is
 * where it rides while held.
 */
export interface CaptainUssrRig {
  readonly root: THREE.Group;
  /** The pelvis, at the hips: lunge, drop, lean and the falls. */
  readonly body: THREE.Group;
  /** The spine, at the waist. */
  readonly torso: THREE.Group;
  readonly head: THREE.Group;
  /** The jaw under the beard: it drops to roar and pant. */
  readonly jaw: THREE.Group;
  /** Where its breath leaves its mouth, on the head. */
  readonly mouth: THREE.Object3D;
  readonly shoulders: Sides<THREE.Group>;
  readonly elbows: Sides<THREE.Group>;
  /** Hip joints, rotated `ZXY`: out to the side first, then the swing. */
  readonly hips: Sides<THREE.Group>;
  readonly knees: Sides<THREE.Group>;
  /** Ankles, `CAPTAIN_USSR_BODY.ankle` over the soles. */
  readonly ankles: Sides<THREE.Group>;
  readonly shieldMount: THREE.Object3D;
  readonly shield: THREE.Group;
  /** Rags of the torn suit, swaying about their top edge. */
  readonly tatters: readonly THREE.Object3D[];
  /** Suit and leather: tinted for a moment when a hit lands. */
  readonly fabric: readonly THREE.MeshStandardMaterial[];
  /** Its skin, whose veins glow with fury. */
  readonly skin: THREE.MeshStandardMaterial;
  /** The goggles' lenses, lit by its eyes, and their glow. */
  readonly eyes: THREE.MeshBasicMaterial;
  readonly halo: THREE.MeshBasicMaterial;
  /** The shield's steel lip: it glints as an attack is about to land. */
  readonly rim: THREE.MeshStandardMaterial;
  readonly materials: readonly THREE.Material[];
  readonly textures: readonly THREE.Texture[];
}

/** The trunk under the armour, turned about the spine: height over the waist, radius before `TRUNK_SCALE`. */
const TRUNK: readonly ProfilePoint[] = [
  [-0.2, 0.205], [-0.12, 0.212], [-0.02, 0.222], [0.1, 0.236], [0.22, 0.252], [0.34, 0.266],
  [0.44, 0.27], [0.53, 0.258], [0.6, 0.232], [0.66, 0.19], [0.71, 0.13], [0.745, 0.085],
];
const TRUNK_SCALE = { x: 1.32, z: 0.82 } as const;
/** How far the cuirass stands off the suit. */
const PLATE = 1.055;
const UPPER_ARM: readonly ProfilePoint[] = [[0, 0.098], [-0.05, 0.103], [-0.13, 0.106], [-0.22, 0.098], [-0.3, 0.084], [-0.36, 0.076]];
const FOREARM: readonly ProfilePoint[] = [[0.02, 0.078], [-0.05, 0.085], [-0.13, 0.081], [-0.24, 0.068], [-0.34, 0.06]];
const ROTTEN_FOREARM: readonly ProfilePoint[] = [[-0.06, 0.074], [-0.13, 0.072], [-0.24, 0.062], [-0.34, 0.056]];
const CUFF: readonly ProfilePoint[] = [[-0.335, 0.072], [-0.27, 0.078], [-0.2, 0.088], [-0.19, 0.084]];
const THIGH: readonly ProfilePoint[] = [[0.05, 0.13], [-0.05, 0.142], [-0.16, 0.138], [-0.3, 0.122], [-0.42, 0.102], [-0.5, 0.09]];
const SHIN: readonly ProfilePoint[] = [[0.02, 0.088], [-0.08, 0.093], [-0.14, 0.094]];
const BOOT: readonly ProfilePoint[] = [[-0.13, 0.101], [-0.22, 0.098], [-0.34, 0.086], [-0.44, 0.079], [-0.5, 0.077]];

/**
 * Builds the zombified super-soldier: a hulking body in a red knit suit
 * under an oxblood leather cuirass (a chest plate, segmented belly bands
 * and a back plate) bound by cream webbing around a great faceted
 * gunmetal star; tan leather pauldrons, cream cuffs and tall cream boots
 * with strap bands, black gloves, a webbing belt with a star buckle and
 * pouches. A leather aviator's helmet with a crest and a star badge, a
 * goggle mask whose lenses glow red with the dead eyes behind them, and a
 * full grey beard over rotten grey-green skin. The suit is torn at the
 * right forearm and the left thigh, with rags hanging from the belt.
 */
export function buildCaptainUssr(castShadow: boolean): CaptainUssrRig {
  const surfaces = createCaptainUssrSurfaces();
  const root = new THREE.Group();
  root.name = 'captain-ussr';
  const body = joint(root, 'body', 0, B.hips, 0, 'YXZ');
  const torso = joint(body, 'torso', 0, B.waist, 0, 'YXZ');
  const head = joint(torso, 'head', 0, B.headY, 0, 'YXZ');
  const jaw = joint(head, 'jaw', 0, 0.065, 0.03);
  const mouth = new THREE.Object3D();
  mouth.position.set(0, 0.05, 0.18);
  head.add(mouth);
  const tatters: THREE.Object3D[] = [];

  buildPelvis(body, surfaces, tatters);
  buildTorso(torso, surfaces);
  buildHead(head, jaw, surfaces);
  const shoulders = sides((index, sign) => joint(torso, `shoulder-${index}`, sign * B.shoulderX, B.shoulderY, 0));
  const elbows = sides((index, sign) => buildArm(shoulders[index], index, sign, surfaces, tatters));
  const hips = sides((index, sign) => joint(body, `hip-${index}`, sign * B.hipX, 0, 0, 'ZXY'));
  const legs = sides((index, sign) => buildLeg(hips[index], index, sign, surfaces));

  const shieldMount = new THREE.Object3D();
  shieldMount.name = 'captain-ussr-shield-mount';
  // Turned first, then tipped about its own axis, then spun on its face.
  shieldMount.rotation.order = 'YXZ';
  torso.add(shieldMount);
  const shield = buildCaptainUssrShield(surfaces);

  batchDrawCalls(root, shield);
  for (const object of [root, shield]) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = castShadow && child.material !== surfaces.lens && child.material !== surfaces.halo;
      child.receiveShadow = false;
    });
  }
  return {
    root, body, torso, head, jaw, mouth,
    shoulders, elbows, hips,
    knees: [legs[0].knee, legs[1].knee],
    ankles: [legs[0].ankle, legs[1].ankle],
    shieldMount, shield, tatters,
    fabric: [surfaces.suit, surfaces.rag, surfaces.leather, surfaces.tan],
    skin: surfaces.skin,
    eyes: surfaces.lens,
    halo: surfaces.halo,
    rim: surfaces.rim,
    materials: surfaces.materials,
    textures: surfaces.textures,
  };
}

function sides<T>(make: (index: 0 | 1, sign: 1 | -1) => T): Sides<T> {
  return [make(0, 1), make(1, -1)];
}

function joint(parent: THREE.Object3D, name: string, x: number, y: number, z: number, order: THREE.EulerOrder = 'XYZ'): THREE.Group {
  const group = new THREE.Group();
  group.name = `captain-ussr-${name}`;
  group.position.set(x, y, z);
  group.rotation.order = order;
  parent.add(group);
  return group;
}

function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Merges the meshes of every joint into one per material; the joints stay, since they are what moves. */
function batchDrawCalls(...objects: THREE.Object3D[]): void {
  const holder = new THREE.Group();
  holder.add(...objects);
  const groups: THREE.Group[] = [];
  holder.traverse((child) => {
    if (child instanceof THREE.Group) groups.push(child);
  });
  for (const group of groups) mergeAssemblies(group);
  holder.remove(...objects);
}

/** The trunk's profile between `from` and `to`, pushed out by `scale`. */
function slice(profile: readonly ProfilePoint[], from: number, to: number, scale: number): ProfilePoint[] {
  const heights = [from, ...profile.map(([y]) => y).filter((y) => y > from && y < to), to];
  return heights.map((y) => [y, profileRadius(profile, y) * scale]);
}

/** A point on the trunk at `angle` round the spine (0 faces +z) and height `y`, `lift` of its radius off it. */
function onTrunk(angle: number, y: number, lift: number): THREE.Vector3 {
  const radius = profileRadius(TRUNK, y) * (1 + lift);
  return new THREE.Vector3(Math.sin(angle) * radius * TRUNK_SCALE.x, y, Math.cos(angle) * radius * TRUNK_SCALE.z);
}

/** Away from the spine, tipping up over the shoulders. */
function offTrunk(point: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.set(point.x / TRUNK_SCALE.x, Math.max(0, point.y - 0.62) * 4, point.z / TRUNK_SCALE.z).normalize();
}

/** A rag of torn suit hanging from (x, y, z), swaying about its top edge. */
function rag(parent: THREE.Object3D, material: THREE.Material, tatters: THREE.Object3D[], x: number, y: number, z: number, length: number, yaw: number): void {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  pivot.rotation.y = yaw;
  const shape = new THREE.Shape();
  const width = 0.07 + length * 0.12;
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(width * 0.3, -length * 0.7);
  shape.lineTo(width * 0.45, -length);
  shape.lineTo(0, -length * 0.8);
  shape.lineTo(-width * 0.35, -length * 0.95);
  shape.lineTo(-width * 0.4, -length * 0.5);
  shape.closePath();
  part(pivot, new THREE.ShapeGeometry(shape), material);
  parent.add(pivot);
  tatters.push(pivot);
}

/** A tear in the suit over rotten skin: the skin, a wound at its heart and ragged fabric lips. */
function tear(parent: THREE.Object3D, surfaces: CaptainUssrSurfaces, x: number, y: number, z: number, width: number, height: number, yaw: number): void {
  const patch = new THREE.Group();
  patch.position.set(x, y, z);
  patch.rotation.y = yaw;
  part(patch, new THREE.CircleGeometry(1, 9).scale(width / 2, height / 2, 1), surfaces.skin, 0, 0, 0.004);
  part(patch, new THREE.CircleGeometry(1, 7).scale(width / 5, height / 4, 1), surfaces.wound, width * 0.08, -height * 0.05, 0.008);
  for (let lip = 0; lip < 6; lip++) {
    const angle = (lip / 6) * Math.PI * 2 + 0.3;
    const fringe = new THREE.ConeGeometry(0.022, 0.06, 3).rotateZ(angle + Math.PI / 2);
    part(patch, fringe, surfaces.suit, Math.cos(angle) * width * 0.5, Math.sin(angle) * height * 0.5, 0.01);
  }
  parent.add(patch);
}

function buildPelvis(body: THREE.Group, surfaces: CaptainUssrSurfaces, tatters: THREE.Object3D[]): void {
  part(body, new THREE.SphereGeometry(0.2, 24, 16).scale(1.38, 0.95, 0.95), surfaces.suit);
  // The webbing belt and its steel buckle with a small star.
  part(body, new THREE.CylinderGeometry(0.302, 0.298, 0.085, 40).scale(1, 1, 0.64), surfaces.webbing, 0, 0.1, 0);
  part(body, rounded(0.12, 0.085, 0.024, 0.008), surfaces.steel, 0, 0.1, 0.196);
  part(body, rounded(0.082, 0.052, 0.012, 0.004), surfaces.gunmetal, 0, 0.1, 0.208);
  part(body, facetedStar(0.022, 0.009, 0.005, 0.002), surfaces.steel, 0, 0.1, 0.214);
  // A pouch on each hip, flap buttoned with a steel snap.
  for (const sign of [1, -1]) {
    const yaw = sign * 0.75;
    part(body, rounded(0.1, 0.11, 0.065, 0.016), surfaces.tan, sign * 0.226, 0.035, 0.162).rotation.y = yaw;
    part(body, rounded(0.106, 0.04, 0.072, 0.012), surfaces.tan, sign * 0.228, 0.085, 0.164).rotation.y = yaw;
    part(body, new THREE.SphereGeometry(0.009, 8, 6), surfaces.steel, sign * 0.255, 0.075, 0.192);
  }
  rag(body, surfaces.rag, tatters, -0.12, 0.06, -0.2, 0.42, Math.PI);
  rag(body, surfaces.rag, tatters, 0.08, 0.06, -0.2, 0.3, Math.PI + 0.2);
}

function buildTorso(torso: THREE.Group, surfaces: CaptainUssrSurfaces): void {
  const trunk = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => geometry.scale(TRUNK_SCALE.x, 1, TRUNK_SCALE.z);
  part(torso, trunk(turned(TRUNK, 32)), surfaces.suit);
  // The trapezius slopes from the neck down to each shoulder.
  for (const sign of [1, -1]) {
    part(torso, new THREE.CapsuleGeometry(0.075, 0.2, 4, 12), surfaces.suit, sign * 0.2, 0.69, -0.01).rotation.z = sign * 1.28;
  }

  // The cuirass: a chest plate, four overlapping belly bands studded at their ends, a back plate.
  part(torso, trunk(turned(slice(TRUNK, 0.3, 0.66, PLATE), 28, -1.2, 2.4)), surfaces.leather);
  for (let band = 0; band < 4; band++) {
    const y = -0.02 + band * 0.085;
    const bulge: ProfilePoint[] = [[y, 1.05], [y + 0.042, 1.085], [y + 0.085, 1.05]].map(([at, scale]) => [at, profileRadius(TRUNK, at) * scale]);
    part(torso, trunk(turned(bulge, 24, -1.05, 2.1)), surfaces.leather);
    for (const sign of [1, -1]) part(torso, new THREE.SphereGeometry(0.008, 8, 6), surfaces.steel).position.copy(onTrunk(sign * 0.98, y + 0.042, 0.095));
  }
  part(torso, trunk(turned(slice(TRUNK, 0.18, 0.62, PLATE), 24, Math.PI - 1, 2)), surfaces.leather);
  for (let rivet = 0; rivet < 9; rivet++) {
    const angle = -1.1 + (rivet / 8) * 2.2;
    part(torso, new THREE.SphereGeometry(0.008, 8, 6), surfaces.steel).position.copy(onTrunk(angle, 0.315, PLATE - 1 + 0.012));
  }

  // The great star on the chest, framed by the webbing's U.
  const starY = 0.47;
  part(torso, facetedStar(0.15, 0.062, 0.035, 0.03), surfaces.gunmetal, 0, starY, profileRadius(TRUNK, starY) * TRUNK_SCALE.z * PLATE + 0.004).rotation.x = -0.06;
  const webbing = (path: THREE.Vector3[], width = 0.05, samples = 20): void => {
    part(torso, strap(path, width, 0.012, offTrunk, samples), surfaces.webbing);
  };
  webbing([-0.66, -0.52, -0.3, 0, 0.3, 0.52, 0.66].map((angle) => onTrunk(angle, 0.64 - (1 - Math.abs(angle) / 0.66) ** 0.6 * 0.34, 0.075)), 0.05, 28);
  for (const sign of [1, -1]) {
    // Over each shoulder to the back plate.
    webbing([onTrunk(sign * 0.6, 0.62, 0.08), new THREE.Vector3(sign * 0.2, 0.772, 0.03), new THREE.Vector3(sign * 0.21, 0.77, -0.06), onTrunk(sign * (Math.PI - 0.6), 0.6, 0.08)]);
    // Round the ribs between the plates, buckled at the side.
    webbing([1.12, 1.4, 1.75, 2.1].map((angle) => onTrunk(sign * angle, 0.34, angle < 1.2 || angle > 2 ? 0.07 : 0.03)), 0.045, 12);
    part(torso, rounded(0.05, 0.045, 0.014, 0.004), surfaces.steel).position.copy(onTrunk(sign * 1.57, 0.34, 0.06));
    // Down the belly bands to the belt.
    webbing([onTrunk(sign * 0.22, 0.31, 0.075), onTrunk(sign * 0.26, 0.15, 0.1), onTrunk(sign * 0.28, -0.02, 0.1)], 0.042, 10);
    // Crossed on the back, shoulder to opposite hip.
    webbing([onTrunk(Math.PI - sign * 0.55, 0.6, 0.08), onTrunk(Math.PI, 0.33, 0.085), onTrunk(Math.PI + sign * 0.5, -0.02, 0.07)]);
  }
  const crossing = onTrunk(Math.PI, 0.33, 0.11);
  part(torso, new THREE.TorusGeometry(0.03, 0.008, 6, 16), surfaces.steel, crossing.x, crossing.y, crossing.z);

  // A bare, rotten neck in a high collar trimmed with leather.
  part(torso, new THREE.CylinderGeometry(0.088, 0.104, 0.2, 16), surfaces.skin, 0, 0.79, 0.005);
  part(torso, new THREE.CylinderGeometry(0.13, 0.155, 0.1, 24, 1, true), surfaces.rag, 0, 0.73, 0);
  part(torso, new THREE.TorusGeometry(0.13, 0.012, 6, 24).rotateX(Math.PI / 2), surfaces.leather, 0, 0.78, 0);
}

function buildHead(head: THREE.Group, jaw: THREE.Group, surfaces: CaptainUssrSurfaces): void {
  part(head, new THREE.SphereGeometry(0.125, 24, 18).scale(1, 1.1, 1.08), surfaces.skin, 0, 0.13, 0);
  // The face under the mask: nose, cheeks and, torn open on the left cheek, a glimpse of teeth.
  part(head, new THREE.SphereGeometry(0.026, 12, 10).scale(0.85, 1.25, 1.1), surfaces.skin, 0, 0.098, 0.138);
  part(head, rounded(0.024, 0.04, 0.02, 0.008), surfaces.skin, 0, 0.12, 0.135);
  for (const sign of [1, -1]) part(head, new THREE.SphereGeometry(0.042, 12, 10), surfaces.skin, sign * 0.062, 0.078, 0.104);
  part(head, new THREE.CircleGeometry(0.022, 9), surfaces.wound, 0.08, 0.072, 0.13).rotation.y = 0.55;
  for (let tooth = 0; tooth < 3; tooth++) part(head, rounded(0.008, 0.013, 0.006, 0.002), surfaces.bone, 0.07 + tooth * 0.009, 0.066, 0.137 - tooth * 0.006);
  // The mouth behind the beard, seen when the jaw drops, and the upper teeth under the moustache.
  part(head, new THREE.SphereGeometry(0.038, 12, 10).scale(1.2, 0.8, 0.8), surfaces.mouth, 0, 0.045, 0.1);
  for (let tooth = 0; tooth < 4; tooth++) part(head, rounded(0.011, 0.016, 0.008, 0.003), surfaces.bone, -0.018 + tooth * 0.012, 0.056, 0.132);

  // The goggle mask: a leather band, steel-rimmed lenses lit red by the dead eyes behind them.
  part(head, new THREE.CylinderGeometry(0.139, 0.139, 0.062, 32, 1, true, -1.8, 3.6).scale(1, 1, 1.13), surfaces.leather, 0, 0.132, 0);
  for (const sign of [1, -1]) {
    const yaw = sign * 0.3;
    part(head, new THREE.TorusGeometry(0.03, 0.0075, 8, 22), surfaces.steel, sign * 0.049, 0.133, 0.152).rotation.y = yaw;
    part(head, new THREE.CircleGeometry(0.027, 22), surfaces.lens, sign * 0.049, 0.133, 0.149).rotation.y = yaw;
    part(head, new THREE.SphereGeometry(0.048, 10, 8), surfaces.halo, sign * 0.052, 0.133, 0.162);
  }
  part(head, rounded(0.03, 0.014, 0.01, 0.003), surfaces.steel, 0, 0.136, 0.157);

  // The helmet: a leather cap tipped back off the brow, its crest, the star badge and the ear flaps.
  const cap = { y: 0.14, z: -0.006, tilt: -0.32 } as const;
  const shell = part(head, new THREE.SphereGeometry(0.143, 30, 16, 0, Math.PI * 2, 0, 1.62).scale(1, 1.08, 1.12), surfaces.leather, 0, cap.y, cap.z);
  shell.rotation.x = cap.tilt;
  const crest = part(head, new THREE.TorusGeometry(0.152, 0.012, 6, 28, 2.5).rotateZ(Math.PI / 2 - 1.25).rotateY(Math.PI / 2).scale(1, 1.08, 1.12), surfaces.leather, 0, cap.y, cap.z);
  crest.rotation.x = cap.tilt;
  part(head, facetedStar(0.032, 0.013, 0.008, 0.004), surfaces.steel, 0, 0.275, 0.087).rotation.x = -0.99;
  for (const sign of [1, -1]) {
    part(head, new THREE.CylinderGeometry(0.056, 0.056, 0.02, 20).rotateZ(Math.PI / 2), surfaces.leather, sign * 0.14, 0.108, -0.004);
    part(head, new THREE.SphereGeometry(0.01, 8, 6), surfaces.steel, sign * 0.151, 0.108, -0.004);
  }

  // The beard: a moustache on the lip, the full beard on the jaw, ragged at its tips.
  for (const sign of [1, -1]) {
    const whisker = part(head, new THREE.CapsuleGeometry(0.014, 0.05, 4, 8), surfaces.beard, sign * 0.034, 0.064, 0.139);
    whisker.rotation.set(0.25, -sign * 0.35, sign * 1.15);
  }
  part(head, rounded(0.05, 0.018, 0.02, 0.008), surfaces.beard, 0, 0.073, 0.143);
  part(jaw, beardGeometry(), surfaces.beard, 0, -0.005, 0.03);
  const random = seededRandom(92);
  for (let tuft = 0; tuft < 26; tuft++) {
    const angle = -1.25 + (tuft / 25) * 2.5;
    const length = 0.04 + random() * 0.045;
    const tip = part(jaw, new THREE.ConeGeometry(0.01 + random() * 0.004, length, 5).rotateX(Math.PI), surfaces.beard,
      Math.sin(angle) * 0.085, -0.135 - Math.cos(angle) * 0.02 - length / 2 + 0.02, Math.cos(angle) * 0.1 + 0.05);
    tip.rotation.set(-0.35 - random() * 0.2, 0, Math.sin(angle) * 0.25);
  }
  for (let tooth = 0; tooth < 4; tooth++) part(jaw, rounded(0.011, 0.014, 0.008, 0.003), surfaces.bone, -0.018 + tooth * 0.012, -0.018, 0.098);
}

/** The lower half of a sphere wrapped round the jaw, shagged by seeded noise and jutting forward as it falls. */
function beardGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(0.118, 22, 14, Math.PI / 2 - 1.45, 2.9, Math.PI * 0.44, Math.PI * 0.56).scale(1.08, 1.3, 0.94);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  const random = seededRandom(91);
  for (let index = 0; index < position.count; index++) {
    vertex.fromBufferAttribute(position, index);
    const shag = 1 + random() * 0.09;
    const below = Math.max(0, -vertex.y);
    vertex.set(vertex.x * shag, vertex.y - below * random() * 0.22, vertex.z * shag + below * 0.45);
    position.setXYZ(index, vertex.x, vertex.y, vertex.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** Deltoid, pauldron, upper arm, elbow, forearm, cuff and gloved fist. The right sleeve is torn off a rotten forearm. Returns the elbow. */
function buildArm(shoulder: THREE.Group, index: 0 | 1, sign: 1 | -1, surfaces: CaptainUssrSurfaces, tatters: THREE.Object3D[]): THREE.Group {
  part(shoulder, new THREE.SphereGeometry(0.122, 18, 14).scale(1.02, 1, 1.06), surfaces.suit, 0, -0.02, 0);
  // Three overlapping leather lames, tipped out over the shoulder.
  for (const [radius, y] of [[0.152, 0.01], [0.142, -0.045], [0.13, -0.095]] as const) {
    part(shoulder, new THREE.SphereGeometry(radius, 20, 8, 0, Math.PI * 2, 0, 1.2).scale(1.12, 0.72, 1.08), surfaces.tan, sign * 0.012, y, 0).rotation.z = -sign * 0.32;
  }
  part(shoulder, turned(UPPER_ARM, 18).scale(1, 1, 1.08), surfaces.suit);
  part(shoulder, new THREE.CylinderGeometry(0.111, 0.109, 0.034, 20).scale(1, 1, 1.08), surfaces.webbing, 0, -0.16, 0);
  part(shoulder, rounded(0.012, 0.03, 0.032, 0.003), surfaces.steel, sign * 0.112, -0.16, 0);

  const elbow = joint(shoulder, `elbow-${index}`, 0, -B.upperArm, 0);
  part(elbow, new THREE.SphereGeometry(0.078, 14, 10), surfaces.suit);
  if (index === 1) {
    // The torn sleeve: a ragged stump of suit, rotten skin, an open wound and the bone beneath.
    part(elbow, turned([[0.02, 0.08], [-0.07, 0.085]], 16), surfaces.suit);
    for (let lip = 0; lip < 7; lip++) {
      const angle = (lip / 7) * Math.PI * 2;
      part(elbow, new THREE.ConeGeometry(0.02, 0.05, 3).rotateX(Math.PI), surfaces.suit, Math.sin(angle) * 0.08, -0.085, Math.cos(angle) * 0.08);
    }
    part(elbow, turned(ROTTEN_FOREARM, 14), surfaces.skin);
    part(elbow, rounded(0.012, 0.16, 0.02, 0.005), surfaces.wound, 0.045, -0.18, 0.042);
    part(elbow, new THREE.CylinderGeometry(0.011, 0.011, 0.12, 6), surfaces.bone, -0.04, -0.2, 0.038);
    rag(elbow, surfaces.rag, tatters, 0, -0.06, 0.075, 0.14, 0);
  } else {
    part(elbow, turned(FOREARM, 16), surfaces.suit);
  }
  part(elbow, turned(CUFF, 18), surfaces.boot);
  part(elbow, new THREE.CylinderGeometry(0.0885, 0.0885, 0.01, 18), surfaces.sole, 0, -0.205, 0);
  // The gloved fist, knuckles forward, thumb on the inside.
  const wrist = -B.forearm;
  part(elbow, new THREE.CylinderGeometry(0.058, 0.054, 0.04, 14), surfaces.glove, 0, wrist - 0.005, 0);
  part(elbow, rounded(0.09, 0.1, 0.062, 0.022), surfaces.glove, 0, wrist - 0.06, 0.004);
  part(elbow, rounded(0.088, 0.058, 0.052, 0.02), surfaces.glove, 0, wrist - 0.085, 0.036);
  for (let knuckle = 0; knuckle < 4; knuckle++) part(elbow, new THREE.SphereGeometry(0.0145, 8, 6), surfaces.glove, -0.03 + knuckle * 0.02, wrist - 0.045, 0.052);
  const thumb = part(elbow, new THREE.CapsuleGeometry(0.0165, 0.04, 4, 8), surfaces.glove, -sign * 0.046, wrist - 0.06, 0.035);
  thumb.rotation.set(0.3, 0, sign * 0.5);
  return elbow;
}

/** Thigh, knee pad, shin, the tall strapped boot and the foot. The left thigh is torn, the right carries a pouch. */
function buildLeg(hip: THREE.Group, index: 0 | 1, sign: 1 | -1, surfaces: CaptainUssrSurfaces): { knee: THREE.Group; ankle: THREE.Group } {
  part(hip, turned(THIGH, 20).scale(1.02, 1, 1.08), surfaces.suit);
  if (index === 0) {
    tear(hip, surfaces, 0.02, -0.24, 0.133, 0.11, 0.17, 0.15);
  } else {
    part(hip, new THREE.CylinderGeometry(0.128, 0.126, 0.03, 20), surfaces.webbing, 0, -0.2, 0);
    part(hip, rounded(0.05, 0.1, 0.075, 0.014), surfaces.tan, sign * 0.13, -0.25, 0.01);
  }

  const knee = joint(hip, `knee-${index}`, 0, -B.thigh, 0);
  part(knee, new THREE.SphereGeometry(0.09, 14, 10), surfaces.suit);
  part(knee, turned(SHIN, 16), surfaces.suit);
  part(knee, new THREE.SphereGeometry(0.098, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62).rotateX(Math.PI / 2).scale(1, 1.15, 0.7), surfaces.leather, 0, -0.03, 0.03);
  // The boot: a tall cream shaft with its rolled top and two buckled straps.
  part(knee, turned(BOOT, 20), surfaces.boot);
  part(knee, new THREE.TorusGeometry(0.104, 0.012, 8, 24).rotateX(Math.PI / 2), surfaces.boot, 0, -0.13, 0);
  for (const y of [-0.24, -0.37]) {
    const radius = profileRadius(BOOT, y) + 0.006;
    part(knee, new THREE.CylinderGeometry(radius, radius, 0.028, 20), surfaces.webbing, 0, y, 0);
    part(knee, rounded(0.012, 0.032, 0.03, 0.003), surfaces.steel, sign * (radius + 0.004), y, 0);
  }

  const ankle = joint(knee, `ankle-${index}`, 0, -B.shin, 0);
  part(ankle, new THREE.CylinderGeometry(0.075, 0.08, 0.1, 16), surfaces.boot, 0, -0.01, 0);
  part(ankle, rounded(0.128, 0.09, 0.25, 0.035), surfaces.boot, 0, -0.04, 0.05);
  part(ankle, new THREE.SphereGeometry(0.066, 14, 10).scale(1, 0.62, 1.15), surfaces.boot, 0, -0.05, 0.155);
  part(ankle, rounded(0.142, 0.032, 0.3, 0.01), surfaces.sole, 0, -B.ankle + 0.016, 0.055);
  part(ankle, rounded(0.12, 0.03, 0.085, 0.01), surfaces.sole, 0, -B.ankle + 0.026, -0.055);
  return { knee, ankle };
}
