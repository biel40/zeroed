import * as THREE from 'three';
import { starGeometry } from '../../rendering/StarGeometry';

/** Left and right of the body: the shield arm is the left one (+x, the body faces +z). */
export type Sides<T> = readonly [left: T, right: T];

/**
 * The jointed body of CAPITÁN URSS, feet at the origin of `root`, facing
 * +z, 2.2 m tall. Joints are bare groups the view poses; `shield` is
 * built apart because it leaves the hand when thrown, and `shieldMount`
 * (a child of `root`) is where it sits while held.
 */
export interface CaptainUssrRig {
  readonly root: THREE.Group;
  /** Pivot at the hips: crouch, lean and the death fall. */
  readonly body: THREE.Group;
  /** Pivot at the waist. */
  readonly torso: THREE.Group;
  readonly head: THREE.Group;
  readonly shoulders: Sides<THREE.Group>;
  readonly elbows: Sides<THREE.Group>;
  readonly hips: Sides<THREE.Group>;
  readonly knees: Sides<THREE.Group>;
  readonly shieldMount: THREE.Object3D;
  readonly shield: THREE.Group;
  /** Rags of the torn suit, swaying about their top edge. */
  readonly tatters: readonly THREE.Object3D[];
  /** The suit's fabric: tinted for a moment when a hit lands. */
  readonly fabric: readonly THREE.MeshStandardMaterial[];
  /** The eye slits' glow, brightened with rage. */
  readonly eyes: THREE.MeshBasicMaterial;
  readonly materials: readonly THREE.Material[];
}

/** Body heights over the feet. */
export const CAPTAIN_USSR_BODY = {
  hips: 1.08,
  thigh: 0.5,
  shin: 0.5,
  waist: 0.12,
  shoulderY: 0.62,
  shoulderX: 0.34,
  upperArm: 0.36,
  forearm: 0.34,
  headY: 0.8,
} as const;

export const SHIELD_RADIUS = 0.44;
/** Depth of the shield's rim in front of its back plate. */
const SHIELD_DOME_BASE = 0.02;

interface Palette {
  readonly suitRed: THREE.MeshStandardMaterial;
  readonly suitBlack: THREE.MeshStandardMaterial;
  readonly padding: THREE.MeshStandardMaterial;
  readonly helmet: THREE.MeshStandardMaterial;
  readonly skin: THREE.MeshStandardMaterial;
  readonly wound: THREE.MeshStandardMaterial;
  readonly bone: THREE.MeshStandardMaterial;
  readonly rag: THREE.MeshStandardMaterial;
  readonly shieldRed: THREE.MeshStandardMaterial;
  readonly shieldRim: THREE.MeshStandardMaterial;
  readonly starWhite: THREE.MeshStandardMaterial;
  readonly eyes: THREE.MeshBasicMaterial;
  readonly eyeHalo: THREE.MeshBasicMaterial;
}

/**
 * Builds the zombified super-soldier from primitives: a dark red suit with
 * black flanks and collar, a white star on the chest and one on each
 * shoulder pad, a full black helmet whose slits glow red, a white belt
 * and white padded greaves over white boots, black gloves. The suit is
 * torn at the belly, the right sleeve and the left thigh over rotten,
 * wounded skin, the neck is bare grey-green flesh, and rags hang from the
 * tears. The round red shield carries a white star inside a steel rim.
 */
export function buildCaptainUssr(castShadow: boolean): CaptainUssrRig {
  const palette = createPalette();
  const B = CAPTAIN_USSR_BODY;
  const root = new THREE.Group();
  root.name = 'captain-ussr';
  const body = joint(root, 'body', 0, B.hips, 0);
  const torso = joint(body, 'torso', 0, B.waist, 0);
  const head = joint(torso, 'head', 0, B.headY, 0);
  const tatters: THREE.Object3D[] = [];

  buildPelvis(body, palette, tatters);
  buildTorso(torso, palette, tatters);
  buildHead(head, torso, palette);
  // Index 0 is the left (+x) side throughout.
  const shoulders = [1, -1].map((side) => joint(torso, `shoulder-${side}`, side * B.shoulderX, B.shoulderY, 0)) as unknown as [THREE.Group, THREE.Group];
  const elbows = shoulders.map((shoulder, index) => buildArm(shoulder, palette, index === 0 ? 'left' : 'right', tatters)) as unknown as [THREE.Group, THREE.Group];
  const hips = [1, -1].map((side) => joint(body, `hip-${side}`, side * 0.15, 0, 0)) as unknown as [THREE.Group, THREE.Group];
  const knees = hips.map((hip, index) => buildLeg(hip, palette, index === 0 ? 'left' : 'right')) as unknown as [THREE.Group, THREE.Group];

  const shieldMount = new THREE.Object3D();
  shieldMount.name = 'captain-ussr-shield-mount';
  root.add(shieldMount);
  const shield = buildShield(palette);

  for (const object of [root, shield]) {
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = castShadow && child.material !== palette.eyes && child.material !== palette.eyeHalo;
      child.receiveShadow = false;
    });
  }
  return {
    root, body, torso, head,
    shoulders, elbows, hips, knees,
    shieldMount, shield, tatters,
    fabric: [palette.suitRed, palette.suitBlack, palette.padding],
    eyes: palette.eyes,
    materials: Object.values(palette),
  };
}

function createPalette(): Palette {
  const standard = (color: number, roughness: number, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  return {
    suitRed: standard(0x5a0c10, 0.78),
    suitBlack: standard(0x121215, 0.62),
    padding: standard(0xcfc9ba, 0.82),
    helmet: standard(0x0c0c0f, 0.32, 0.45),
    skin: standard(0x6d7553, 0.92),
    wound: standard(0x3c1512, 0.6),
    bone: standard(0xb9ad8f, 0.7),
    rag: standard(0x4a0b0e, 0.85, 0, { side: THREE.DoubleSide }),
    shieldRed: standard(0x8a1117, 0.42, 0.45),
    shieldRim: standard(0x9ea2a6, 0.32, 0.85),
    starWhite: standard(0xe6e2d6, 0.55, 0.1),
    eyes: new THREE.MeshBasicMaterial({ color: 0xff2414, toneMapped: false }),
    eyeHalo: new THREE.MeshBasicMaterial({
      color: 0xff1a0a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }),
  };
}

function joint(parent: THREE.Object3D, name: string, x: number, y: number, z: number): THREE.Group {
  const group = new THREE.Group();
  group.name = `captain-ussr-${name}`;
  group.position.set(x, y, z);
  parent.add(group);
  return group;
}

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  parent.add(part);
  return part;
}

/** A rag of torn suit hanging from (x, y, z), swaying about its top edge. */
function rag(parent: THREE.Object3D, palette: Palette, tatters: THREE.Object3D[], x: number, y: number, z: number, length: number, yaw: number): void {
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
  mesh(pivot, new THREE.ShapeGeometry(shape), palette.rag);
  parent.add(pivot);
  tatters.push(pivot);
}

/** A tear in the suit over rotten skin: the skin patch, a wound at its heart and ragged fabric lips. */
function tear(parent: THREE.Object3D, palette: Palette, x: number, y: number, z: number, width: number, height: number, yaw: number): void {
  const patch = new THREE.Group();
  patch.position.set(x, y, z);
  patch.rotation.y = yaw;
  mesh(patch, new THREE.CircleGeometry(1, 9).scale(width / 2, height / 2, 1), palette.skin, 0, 0, 0.004);
  mesh(patch, new THREE.CircleGeometry(1, 7).scale(width / 5, height / 4, 1), palette.wound, width * 0.08, -height * 0.05, 0.008);
  for (let lip = 0; lip < 5; lip++) {
    const angle = (lip / 5) * Math.PI * 2 + 0.3;
    const fringe = new THREE.ConeGeometry(0.025, 0.07, 3).rotateZ(angle + Math.PI / 2);
    mesh(patch, fringe, palette.suitRed, Math.cos(angle) * width * 0.5, Math.sin(angle) * height * 0.5, 0.01);
  }
  parent.add(patch);
}

function buildPelvis(body: THREE.Group, palette: Palette, tatters: THREE.Object3D[]): void {
  mesh(body, new THREE.BoxGeometry(0.44, 0.24, 0.28), palette.suitRed, 0, 0.02, 0);
  // The white belt and its buckle.
  mesh(body, new THREE.CylinderGeometry(0.245, 0.235, 0.1, 18).scale(1, 1, 0.66), palette.padding, 0, 0.12, 0);
  mesh(body, new THREE.BoxGeometry(0.13, 0.11, 0.03), palette.padding, 0, 0.12, 0.165);
  mesh(body, new THREE.BoxGeometry(0.07, 0.05, 0.02), palette.suitBlack, 0, 0.12, 0.18);
  for (const side of [-1, 1]) mesh(body, new THREE.BoxGeometry(0.08, 0.1, 0.06), palette.padding, side * 0.2, 0.1, 0.1);
  rag(body, palette, tatters, -0.12, 0.06, -0.17, 0.42, Math.PI);
  rag(body, palette, tatters, 0.08, 0.06, -0.17, 0.3, Math.PI + 0.2);
}

function buildTorso(torso: THREE.Group, palette: Palette, tatters: THREE.Object3D[]): void {
  // The chest: a broad capsule, black flanks over the ribs, a black collar.
  mesh(torso, new THREE.CapsuleGeometry(0.25, 0.32, 6, 16).scale(1.32, 1, 0.82), palette.suitRed, 0, 0.36, 0);
  for (const side of [-1, 1]) {
    mesh(torso, new THREE.CapsuleGeometry(0.12, 0.3, 4, 10).scale(0.6, 1, 1.25), palette.suitBlack, side * 0.27, 0.34, 0);
  }
  mesh(torso, new THREE.CylinderGeometry(0.17, 0.27, 0.12, 16).scale(1.25, 1, 0.9), palette.suitBlack, 0, 0.66, 0);
  mesh(torso, starGeometry(0.16, 0.065, 0.025), palette.starWhite, 0, 0.42, 0.2);
  // Torn at the right of the belly, over a bite wound, with the ribs showing.
  tear(torso, palette, -0.13, 0.13, 0.19, 0.17, 0.2, -0.25);
  for (let rib = 0; rib < 3; rib++) mesh(torso, new THREE.BoxGeometry(0.1, 0.015, 0.012), palette.bone, -0.14, 0.08 + rib * 0.045, 0.215).rotation.z = 0.2;
  rag(torso, palette, tatters, -0.1, 0.04, 0.19, 0.2, 0);
  // Shoulder pads with their stars, tilted out.
  for (const side of [-1, 1]) {
    const pad = new THREE.Group();
    pad.position.set(side * 0.34, 0.66, 0);
    pad.rotation.z = side * -0.35;
    mesh(pad, new THREE.SphereGeometry(0.15, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.15, 0.75, 1.1), palette.suitRed);
    const star = mesh(pad, starGeometry(0.075, 0.03, 0.012), palette.starWhite, 0, 0.11, 0);
    star.rotation.x = -Math.PI / 2;
    torso.add(pad);
  }
}

function buildHead(head: THREE.Group, torso: THREE.Group, palette: Palette): void {
  // A bare, rotten neck between the collar and the helmet.
  mesh(torso, new THREE.CylinderGeometry(0.075, 0.09, 0.16, 10), palette.skin, 0, 0.75, 0);
  mesh(torso, new THREE.BoxGeometry(0.01, 0.1, 0.02), palette.wound, 0.05, 0.76, 0.06).rotation.z = 0.4;
  mesh(head, new THREE.SphereGeometry(0.155, 20, 14).scale(1, 1.15, 1.08), palette.helmet, 0, 0.12, 0);
  // The faceplate's brow ridge and jaw guard.
  mesh(head, new THREE.BoxGeometry(0.27, 0.05, 0.08), palette.helmet, 0, 0.17, 0.13);
  mesh(head, new THREE.BoxGeometry(0.2, 0.08, 0.06), palette.helmet, 0, 0.0, 0.14);
  // Cracked at the cheek: grey flesh and teeth behind the broken visor.
  mesh(head, new THREE.CircleGeometry(0.035, 7), palette.skin, -0.075, 0.05, 0.166).rotation.y = -0.4;
  for (let tooth = 0; tooth < 3; tooth++) mesh(head, new THREE.BoxGeometry(0.012, 0.02, 0.01), palette.bone, -0.088 + tooth * 0.014, 0.038, 0.17);
  for (const side of [-1, 1]) {
    mesh(head, new THREE.BoxGeometry(0.075, 0.022, 0.02), palette.eyes, side * 0.058, 0.13, 0.163).rotation.z = side * -0.18;
    mesh(head, new THREE.SphereGeometry(0.055, 10, 8), palette.eyeHalo, side * 0.058, 0.13, 0.17);
  }
}

/** Upper arm, elbow and forearm; the right sleeve is torn off over a rotten forearm. Returns the elbow. */
function buildArm(shoulder: THREE.Group, palette: Palette, side: 'left' | 'right', tatters: THREE.Object3D[]): THREE.Group {
  const B = CAPTAIN_USSR_BODY;
  mesh(shoulder, new THREE.CylinderGeometry(0.085, 0.075, B.upperArm, 12), palette.suitRed, 0, -B.upperArm / 2, 0);
  const elbow = joint(shoulder, `elbow-${side}`, 0, -B.upperArm, 0);
  mesh(elbow, new THREE.SphereGeometry(0.075, 10, 8), side === 'right' ? palette.skin : palette.suitRed);
  if (side === 'right') {
    mesh(elbow, new THREE.CylinderGeometry(0.06, 0.05, B.forearm, 10), palette.skin, 0, -B.forearm / 2, 0);
    mesh(elbow, new THREE.BoxGeometry(0.012, B.forearm * 0.6, 0.02), palette.wound, 0.04, -B.forearm / 2, 0.035);
    mesh(elbow, new THREE.CylinderGeometry(0.012, 0.012, B.forearm * 0.4, 6), palette.bone, -0.035, -B.forearm * 0.45, 0.03);
    rag(shoulder, palette, tatters, 0, -B.upperArm + 0.02, 0.07, 0.16, 0);
    rag(shoulder, palette, tatters, 0.05, -B.upperArm + 0.02, -0.06, 0.12, Math.PI);
  } else {
    mesh(elbow, new THREE.CylinderGeometry(0.075, 0.065, B.forearm, 12), palette.suitRed, 0, -B.forearm / 2, 0);
  }
  // Black gloves: cuff and fist.
  mesh(elbow, new THREE.CylinderGeometry(0.075, 0.07, 0.09, 12), palette.suitBlack, 0, -B.forearm + 0.04, 0);
  mesh(elbow, new THREE.BoxGeometry(0.1, 0.12, 0.11), palette.suitBlack, 0, -B.forearm - 0.05, 0.01);
  return elbow;
}

/** Thigh, knee and the white padded greave over a white boot; the left thigh is torn. Returns the knee. */
function buildLeg(hip: THREE.Group, palette: Palette, side: 'left' | 'right'): THREE.Group {
  const B = CAPTAIN_USSR_BODY;
  mesh(hip, new THREE.CylinderGeometry(0.12, 0.095, B.thigh, 12), palette.suitRed, 0, -B.thigh / 2, 0);
  if (side === 'left') tear(hip, palette, 0.02, -B.thigh * 0.45, 0.105, 0.11, 0.17, 0.15);
  const knee = joint(hip, `knee-${side}`, 0, -B.thigh, 0);
  // Padded greave: quilted rings from the knee down, a knee cap in front.
  for (let ring = 0; ring < 4; ring++) {
    const radius = 0.105 - ring * 0.006;
    mesh(knee, new THREE.CylinderGeometry(radius, radius - 0.008, 0.1, 14), palette.padding, 0, -0.06 - ring * 0.095, 0.005);
  }
  mesh(knee, new THREE.SphereGeometry(0.1, 12, 8).scale(1, 0.85, 0.7), palette.padding, 0, 0, 0.05);
  // Boot and its black sole.
  mesh(knee, new THREE.BoxGeometry(0.17, 0.12, 0.3), palette.padding, 0, -B.shin + 0.04, 0.06);
  mesh(knee, new THREE.BoxGeometry(0.18, 0.04, 0.32), palette.suitBlack, 0, -B.shin - 0.03, 0.06);
  return knee;
}

/**
 * The round shield, facing +z: a shallow red dome inside a steel rim, a
 * white star in a white ring at its heart, scratches and a dent, and a
 * forearm strap behind.
 */
function buildShield(palette: Palette): THREE.Group {
  const shield = new THREE.Group();
  shield.name = 'captain-ussr-shield';
  // A spherical cap of a sphere 2.2 times the shield's radius, its rim on z = BASE.
  const sphere = SHIELD_RADIUS * 2.2;
  const sink = Math.sqrt(sphere * sphere - SHIELD_RADIUS * SHIELD_RADIUS) - SHIELD_DOME_BASE;
  const surface = (x: number, y: number): number => Math.sqrt(sphere * sphere - x * x - y * y) - sink;
  const dome = new THREE.SphereGeometry(sphere, 32, 6, 0, Math.PI * 2, 0, Math.asin(1 / 2.2)).rotateX(Math.PI / 2).translate(0, 0, -sink);
  mesh(shield, dome, palette.shieldRed);
  mesh(shield, new THREE.CircleGeometry(SHIELD_RADIUS, 32).rotateY(Math.PI), palette.suitBlack, 0, 0, -0.005);
  mesh(shield, new THREE.TorusGeometry(SHIELD_RADIUS, 0.028, 8, 36), palette.shieldRim, 0, 0, SHIELD_DOME_BASE);
  const ring = SHIELD_RADIUS * 0.42;
  mesh(shield, new THREE.TorusGeometry(ring, 0.016, 6, 28), palette.starWhite, 0, 0, surface(ring, 0) + 0.004);
  mesh(shield, starGeometry(SHIELD_RADIUS * 0.36, SHIELD_RADIUS * 0.145, 0.03), palette.starWhite, 0, 0, surface(SHIELD_RADIUS * 0.36, 0) + 0.012);
  for (let scratch = 0; scratch < 4; scratch++) {
    const x = -0.2 + scratch * 0.1;
    const y = 0.22 - scratch * 0.13;
    const mark = mesh(shield, new THREE.BoxGeometry(0.16 - scratch * 0.02, 0.008, 0.006), palette.shieldRim, x, y, surface(x, y) + 0.002);
    mark.rotation.z = 0.5 + scratch * 0.4;
  }
  mesh(shield, new THREE.CircleGeometry(0.05, 10), palette.wound, 0.24, -0.16, surface(0.24, -0.16) + 0.003);
  mesh(shield, new THREE.BoxGeometry(0.06, 0.32, 0.03), palette.suitBlack, 0, 0, -0.04);
  return shield;
}
