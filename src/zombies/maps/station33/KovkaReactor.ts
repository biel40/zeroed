import * as THREE from 'three';
import { addSolidProxy } from '../shared/SolidProxy';
import type { StaticMeshBatch } from '../shared/StaticMeshBatch';
import { KOVKA, KOVKA_CORE_COLOR, KOVKA_REACTOR } from '../Station33Config';
import type { KovkaMaterials } from './KovkaMaterials';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

const { x: AXIS_X, axisY: AXIS_Y, radius: RADIUS, frontZ: FRONT_Z, backZ: BACK_Z } = KOVKA_REACTOR;
const { pit } = KOVKA;
const LENGTH = FRONT_Z - BACK_Z;
const SEGMENTS = 32;
/** Inner drum the yoke wheels clamp, and the wheels themselves. */
const CRYOSTAT_RADIUS = 4.3;
const WHEEL = { count: 5, width: 1.8 } as const;
/** Lattice ring framing the face, just proud of the wheels. */
const TRUSS = { inner: 4.98, outer: 5.45, tube: 0.06, bays: 16 } as const;
/** Radial plates between the bore and the outer winding, stepped like an iris. */
const PETALS = { count: 16, inner: 1.95, outer: 4.25, depth: 0.1, step: 0.15 } as const;
/** The bore narrowing in steps towards the core: [inner radius, outer radius, depth behind the face]. */
const BORE_STEPS: ReadonlyArray<readonly [number, number, number]> = [[1.45, 1.95, 0.35], [1.0, 1.45, 1.0], [0.62, 1.0, 1.8]];
const CORE_DEPTH = 2.6;
/** Lattice masts carrying the high-voltage feed, either side of the face, standing on the pit floor. */
const MAST = { offset: 5.9, z: FRONT_Z + 0.45, half: 0.22, top: 4.6, panel: 1.24 } as const;

/**
 * Where the face's live parts sit, for the forge's show (`KovkaReactorForge`):
 * the iris of plates between `boreRadius` and `irisRadius`, the coils on
 * `coilRadius` round the lattice ring at `ringZ`, and the electrodes'
 * ball ends `electrodeReach` from the axis.
 */
export const KOVKA_REACTOR_FACE = {
  boreRadius: PETALS.inner,
  irisRadius: PETALS.outer,
  coilRadius: (TRUSS.inner + TRUSS.outer) / 2,
  electrodeReach: TRUSS.outer + 0.42,
  ringZ: FRONT_Z + 0.1,
} as const;

/** Angles of the electrodes, one between each pair of coils, except under the busbars' arch at the top. */
export function kovkaElectrodeAngles(): number[] {
  const angles: number[] = [];
  for (let index = 0; index < 8; index++) {
    const tilt = (index * Math.PI) / 4 + Math.PI / 8;
    if (Math.sin(tilt) <= 0.8) angles.push(tilt);
  }
  return angles;
}

const UP = new THREE.Vector3(0, 1, 0);
const scratchDirection = new THREE.Vector3();
const scratchMiddle = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchMatrix = new THREE.Matrix4();
const scratchScale = new THREE.Vector3(1, 1, 1);

/** Point on the reactor's face plane at polar (`radius`, `angle`) round its axis. */
function onFace(radius: number, angle: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(AXIS_X + Math.cos(angle) * radius, AXIS_Y + Math.sin(angle) * radius, z);
}

/** A box `thickness` square from `from` to `to`. */
function addBeam(batch: StaticMeshBatch, material: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, thickness: number): void {
  scratchDirection.subVectors(to, from);
  const length = scratchDirection.length();
  scratchQuaternion.setFromUnitVectors(UP, scratchDirection.normalize());
  scratchMiddle.addVectors(from, to).multiplyScalar(0.5);
  batch.add(new THREE.BoxGeometry(thickness, length, thickness), material, scratchMatrix.compose(scratchMiddle, scratchQuaternion, scratchScale));
}

/**
 * The KOVKA reactor, dormant in its pit: a horizontal drum of yoke wheels
 * wound in copper, its face a high-voltage iris (lattice ring with coils
 * and electrodes, stepped radial plates and a bore narrowing to the core)
 * fed by busbars from two lattice masts, with an articulated arm on each
 * mast reaching for it. The core glows in the mains' circuit, dark until
 * the main switch is thrown. Static batch geometry; a few AABB proxies
 * stop bullets.
 */
export function buildKovkaReactor(context: Station33BuildContext, kovka: KovkaMaterials, lighting: Station33Lighting): void {
  const core = lighting.registerMaterial(new THREE.MeshBasicMaterial({ name: 'station33_kovka_core', color: KOVKA_CORE_COLOR }), 'mains');
  addDrum(context, kovka);
  addFace(context, kovka, core);
  for (const side of [-1, 1] as const) addMast(context, kovka, lighting, side);
  addProxies(context);
}

/** Inner drum, yoke wheels with copper windings between them, tie rods, back cap and cradles on the pit floor. */
function addDrum(context: Station33BuildContext, kovka: KovkaMaterials): void {
  const { batch, materials } = context;
  const centerZ = (FRONT_Z + BACK_Z) / 2;
  const alongAxis = (geometry: THREE.BufferGeometry, z: number): THREE.BufferGeometry => geometry.rotateX(Math.PI / 2).translate(AXIS_X, AXIS_Y, z);
  batch.add(alongAxis(new THREE.CylinderGeometry(CRYOSTAT_RADIUS, CRYOSTAT_RADIUS, LENGTH, SEGMENTS, 1, true), centerZ), materials.greySteel);
  batch.add(new THREE.CircleGeometry(RADIUS, SEGMENTS).rotateY(Math.PI).translate(AXIS_X, AXIS_Y, BACK_Z), kovka.reactorSteel);
  const pitch = (LENGTH - WHEEL.width) / (WHEEL.count - 1);
  for (let wheel = 0; wheel < WHEEL.count; wheel++) {
    const z = FRONT_Z - WHEEL.width / 2 - wheel * pitch;
    batch.add(alongAxis(new THREE.CylinderGeometry(RADIUS, RADIUS, WHEEL.width, SEGMENTS, 1, true), z), kovka.reactorSteel);
    for (const facing of [1, -1]) {
      const ring = new THREE.RingGeometry(CRYOSTAT_RADIUS, RADIUS, SEGMENTS);
      if (facing < 0) ring.rotateY(Math.PI);
      batch.add(ring.translate(AXIS_X, AXIS_Y, z + facing * WHEEL.width / 2), kovka.reactorSteel);
    }
    if (wheel > 0) {
      const gap = pitch - WHEEL.width;
      batch.add(alongAxis(new THREE.CylinderGeometry(CRYOSTAT_RADIUS + 0.12, CRYOSTAT_RADIUS + 0.12, gap * 0.8, SEGMENTS, 1, true), z + pitch / 2), kovka.copper);
    }
    if (wheel % 2 === 0) {
      // A cradle under every other wheel, on a plinth on the pit floor.
      const saddleTop = AXIS_Y - RADIUS + 0.5;
      batch.addBox(kovka.primer, AXIS_X, (pit.floorY + saddleTop) / 2, z, 6.4, saddleTop - pit.floorY, 1.0);
      batch.addBox(materials.serviceConcrete, AXIS_X, pit.floorY + 0.15, z, 7.2, 0.3, 1.6);
    }
  }
  for (let rod = 0; rod < 8; rod++) {
    const angle = Math.PI / 8 + (rod * Math.PI) / 4;
    const at = onFace(RADIUS + 0.08, angle, centerZ);
    batch.addBox(materials.greySteel, at.x, at.y, at.z, 0.12, 0.12, LENGTH + 0.2);
  }
}

/** The high-voltage face: lattice ring with coils and electrodes, stepped plates, the bore and its core. */
function addFace(context: Station33BuildContext, kovka: KovkaMaterials, core: THREE.MeshBasicMaterial): void {
  const { batch, materials } = context;
  const { ringZ } = KOVKA_REACTOR_FACE;
  for (const radius of [TRUSS.inner, TRUSS.outer]) {
    batch.add(new THREE.TorusGeometry(radius, TRUSS.tube, 3, SEGMENTS).translate(AXIS_X, AXIS_Y, ringZ), kovka.reactorSteel);
  }
  for (let bay = 0; bay < TRUSS.bays; bay++) {
    const angle = (bay / TRUSS.bays) * Math.PI * 2;
    const next = ((bay + 0.5) / TRUSS.bays) * Math.PI * 2;
    addBeam(batch, kovka.reactorSteel, onFace(TRUSS.inner, angle, ringZ), onFace(TRUSS.outer, angle, ringZ), 0.06);
    addBeam(batch, kovka.reactorSteel, onFace(TRUSS.inner, angle, ringZ), onFace(TRUSS.outer, next, ringZ), 0.05);
  }
  addPetals(batch, materials.greySteel);
  // Dark backing behind the plates, so the gaps between them never show through the open drum.
  const backingZ = FRONT_Z - PETALS.depth - PETALS.step - 0.05;
  batch.add(new THREE.RingGeometry(PETALS.inner, CRYOSTAT_RADIUS, SEGMENTS).translate(AXIS_X, AXIS_Y, backingZ), kovka.boreLining);
  batch.add(new THREE.TorusGeometry(PETALS.outer, 0.09, 4, SEGMENTS).translate(AXIS_X, AXIS_Y, FRONT_Z + 0.05), kovka.copper);
  batch.add(new THREE.TorusGeometry(PETALS.inner, 0.12, 4, SEGMENTS).translate(AXIS_X, AXIS_Y, FRONT_Z + 0.05), core);
  let wallFrom = 0;
  for (const [inner, outer, depth] of BORE_STEPS) {
    batch.add(new THREE.RingGeometry(inner, outer, SEGMENTS).translate(AXIS_X, AXIS_Y, FRONT_Z - depth), kovka.boreLining);
    const wall = new THREE.CylinderGeometry(outer, outer, depth - wallFrom, SEGMENTS, 1, true).rotateX(Math.PI / 2);
    batch.add(wall.translate(AXIS_X, AXIS_Y, FRONT_Z - (wallFrom + depth) / 2), kovka.boreLining);
    wallFrom = depth;
  }
  const coreRadius = BORE_STEPS[BORE_STEPS.length - 1][0];
  const throat = new THREE.CylinderGeometry(coreRadius, coreRadius, CORE_DEPTH - wallFrom, 24, 1, true).rotateX(Math.PI / 2);
  batch.add(throat.translate(AXIS_X, AXIS_Y, FRONT_Z - (wallFrom + CORE_DEPTH) / 2), core);
  batch.add(new THREE.CircleGeometry(coreRadius, 24).translate(AXIS_X, AXIS_Y, FRONT_Z - CORE_DEPTH), core);
  addCoilsAndElectrodes(batch, kovka, ringZ);
}

/** Trapezoidal plates round the bore, every other one set back so the face reads as stepped layers. */
function addPetals(batch: StaticMeshBatch, material: THREE.Material): void {
  const half = (Math.PI / PETALS.count) * 0.86;
  const shape = new THREE.Shape();
  shape.moveTo(PETALS.inner, -Math.tan(half) * PETALS.inner);
  shape.lineTo(PETALS.outer, -Math.tan(half) * PETALS.outer);
  shape.lineTo(PETALS.outer, Math.tan(half) * PETALS.outer);
  shape.lineTo(PETALS.inner, Math.tan(half) * PETALS.inner);
  shape.closePath();
  const petal = new THREE.ExtrudeGeometry(shape, { depth: PETALS.depth, bevelEnabled: false });
  for (let index = 0; index < PETALS.count; index++) {
    const back = index % 2 === 0 ? 0 : PETALS.step;
    const placed = petal.clone().rotateZ((index / PETALS.count) * Math.PI * 2).translate(AXIS_X, AXIS_Y, FRONT_Z - PETALS.depth - back);
    batch.add(placed, material);
  }
  petal.dispose();
}

/**
 * Copper coils wound round the lattice ring, and electrodes with ball ends
 * between them, except under the busbars' arch at the top.
 */
function addCoilsAndElectrodes(batch: StaticMeshBatch, kovka: KovkaMaterials, ringZ: number): void {
  for (let index = 0; index < 8; index++) {
    const angle = (index * Math.PI) / 4;
    const at = onFace(KOVKA_REACTOR_FACE.coilRadius, angle, ringZ);
    batch.add(new THREE.CylinderGeometry(0.32, 0.32, 0.7, 12).rotateZ(angle).translate(at.x, at.y, at.z), kovka.copper);
    batch.add(new THREE.CylinderGeometry(0.335, 0.335, 0.08, 12, 1, true).rotateZ(angle).translate(at.x, at.y, at.z), kovka.boreLining);
  }
  for (const tilt of kovkaElectrodeAngles()) {
    const root = onFace(TRUSS.outer, tilt, ringZ);
    const tip = onFace(KOVKA_REACTOR_FACE.electrodeReach, tilt, ringZ);
    addBeam(batch, kovka.copper, root, tip, 0.06);
    batch.add(new THREE.SphereGeometry(0.1, 6, 4).translate(tip.x, tip.y, tip.z), kovka.copper);
  }
}

/**
 * One lattice mast (`side` -1 west, 1 east) on the pit floor beside the
 * face: corner angles with ties and zigzag bracing, an insulator stack
 * under a copper terminal, a busbar arching onto the ring, a battery pilot
 * lamp and an articulated arm reaching for the face.
 */
function addMast(context: Station33BuildContext, kovka: KovkaMaterials, lighting: Station33Lighting, side: -1 | 1): void {
  const { batch, materials } = context;
  const x = AXIS_X + side * MAST.offset;
  const { z, half, top } = MAST;
  const height = top - pit.floorY;
  for (const [dx, dz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
    batch.addBox(kovka.primer, x + dx * half, pit.floorY + height / 2, z + dz * half, 0.07, height, 0.07);
  }
  const panels = Math.round(height / MAST.panel);
  const panel = height / panels;
  for (let index = 0; index <= panels; index++) {
    const y = pit.floorY + index * panel;
    batch.addBox(kovka.primer, x, y, z + half, half * 2, 0.05, 0.05);
    batch.addBox(kovka.primer, x - side * half, y, z, 0.05, 0.05, half * 2);
    if (index < panels) {
      const flip = index % 2 === 0 ? 1 : -1;
      addBeam(batch, kovka.primer, new THREE.Vector3(x - flip * half, y, z + half), new THREE.Vector3(x + flip * half, y + panel, z + half), 0.04);
    }
  }
  batch.addBox(kovka.primer, x, top + 0.04, z, half * 2 + 0.16, 0.08, half * 2 + 0.16);
  for (let disc = 0; disc < 6; disc++) {
    batch.add(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 8).translate(x, top + 0.16 + disc * 0.09, z), materials.stucco);
  }
  batch.add(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6, 1, true).translate(x, top + 0.38, z), materials.stucco);
  const terminal = new THREE.Vector3(x, top + 0.72, z);
  batch.add(new THREE.SphereGeometry(0.11, 8, 5).translate(terminal.x, terminal.y, terminal.z), kovka.copper);
  // Onto the end of the top coil, over the ring.
  const coilEnd = onFace((TRUSS.inner + TRUSS.outer) / 2, Math.PI / 2, FRONT_Z + 0.1).setX(AXIS_X + side * 0.38);
  const busbar = new THREE.CatmullRomCurve3([terminal, new THREE.Vector3(AXIS_X + side * 3.2, top + 1.6, z - 0.15), coilEnd]);
  batch.add(new THREE.TubeGeometry(busbar, 12, 0.045, 5), kovka.copper);
  batch.add(new THREE.SphereGeometry(0.07, 8, 6).translate(x - side * (half + 0.08), top - 0.2, z + half), lighting.circuitMaterial('emergency'));
  addArm(batch, kovka, x - side * half, side);
}

/** Static two-link manipulator from a mast's inner face towards the plates: shoulder, upper arm, elbow, forearm and a copper electrode tip. */
function addArm(batch: StaticMeshBatch, kovka: KovkaMaterials, mastFaceX: number, side: -1 | 1): void {
  const z = MAST.z - 0.05;
  const shoulder = new THREE.Vector3(mastFaceX - side * 0.18, 2.2, z);
  const elbow = new THREE.Vector3(AXIS_X + side * 4.7, 3.35, z - 0.2);
  const wrist = new THREE.Vector3(AXIS_X + side * 3.4, 2.75, FRONT_Z + 0.3);
  const tip = new THREE.Vector3(AXIS_X + side * 3.1, 2.62, FRONT_Z + 0.22);
  for (const joint of [shoulder, elbow]) {
    batch.add(new THREE.CylinderGeometry(0.15, 0.15, 0.32, 10).rotateX(Math.PI / 2).translate(joint.x, joint.y, joint.z), kovka.reactorSteel);
  }
  addBeam(batch, kovka.primer, shoulder, elbow, 0.2);
  addBeam(batch, kovka.primer, elbow, wrist, 0.14);
  // Hydraulic ram along the upper arm.
  addBeam(batch, kovka.reactorSteel, shoulder.clone().setY(shoulder.y - 0.28), elbow.clone().lerp(shoulder, 0.3), 0.07);
  addBeam(batch, kovka.copper, wrist, tip, 0.06);
}

/** Bullets stop on the drum (three slabs round its axis) and on both masts; the rails keep bodies off all of it. */
function addProxies(context: Station33BuildContext): void {
  const frontFace = FRONT_Z + 0.1;
  const slabs: ReadonlyArray<readonly [string, number, number, number]> = [
    ['middle', 4.6, -2.4, 2.4],
    ['upper', 3.2, 2.4, RADIUS - 0.3],
    ['lower', 3.2, 0.3 - RADIUS, -2.4],
  ];
  for (const [name, halfWidth, fromY, toY] of slabs) {
    addSolidProxy(context, `kovka-reactor-${name}`,
      { x: AXIS_X - halfWidth, y: AXIS_Y + fromY, z: BACK_Z }, { x: AXIS_X + halfWidth, y: AXIS_Y + toY, z: frontFace }, 'metal', 'none');
  }
  for (const side of [-1, 1]) {
    const x = AXIS_X + side * MAST.offset;
    addSolidProxy(context, `kovka-reactor-mast-${side < 0 ? 'west' : 'east'}`,
      { x: x - MAST.half, y: pit.floorY, z: MAST.z - MAST.half }, { x: x + MAST.half, y: MAST.top, z: MAST.z + MAST.half }, 'metal', 'none');
  }
}
