import * as THREE from 'three';
import { SUBESTACION } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { MIMIC_LAYOUT, type SignId } from './Station33Signage';
import { MOTOR_GENERATOR, MOTOR_GENERATORS, SWITCHBOARD, switchboardLayout, TRANSFORMERS } from './SubestacionFurniture';

const { gallery, hall, hallHeight } = SUBESTACION;
/** Overhead busway from the transformers to the east switchboards, hung from the slab. */
const BUSWAY = { westX: 14.0, eastX: TRANSFORMERS.x - 0.4, y: 3.75, zs: [-45.5, -45.65, -45.8], hangerXs: [14.4, 15.7, 17.0, 18.3] } as const;
/** Mimic diagram over the west motor-generator, on the west wall. */
const MIMIC_BOARD = { z: -39.6, y: 2.75, width: 2.4, height: 0.6 } as const;
/** Feeders the diagram shows dead (red lamp); the rest light green with the mains. */
const DEAD_FEEDERS = new Set([1, 4]);
/** Cooling-water main along the north wall (built with the shell). */
const COOLING_MAIN = { y: 3.4, z: hall.minZ + 0.25, radius: 0.1 } as const;
const VALVE_XS = [6.0, 16.2] as const;
const GAUGE_X = 9.0;
const TELEPHONE = { x: 15.1, y: 1.45 } as const;

/**
 * Wall and ceiling gear of the machine room, all non-solid: the busway and
 * its slack feeders, danger plates on the machines, the "men at work" tag
 * left on a switchboard, the mimic diagram whose lamps follow the mains,
 * valves and a gauge on the cooling main and the duty telephone.
 */
export function buildSubestacionWallGear(context: Station33BuildContext, lighting: Station33Lighting): void {
  addBusway(context);
  addDangerPlates(context);
  addMenAtWorkTag(context);
  addMimicBoard(context, lighting);
  addCoolingMainFittings(context);
  addTelephone(context);
}

/** Three copper bars on porcelain hangers, dropping to the transformers' bushings and into a switchboard. */
function addBusway(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { westX, eastX, y, zs, hangerXs } = BUSWAY;
  const centerZ = zs[1];
  for (const z of zs) batch.addBox(materials.bronze, (westX + eastX) / 2, y, z, eastX - westX, 0.06, 0.012);
  const rodLength = hallHeight - (y + 0.11);
  for (const x of hangerXs) {
    batch.add(new THREE.CylinderGeometry(0.015, 0.015, rodLength, 6).translate(x, y + 0.11 + rodLength / 2, centerZ), materials.greySteel);
    batch.addBox(materials.greySteel, x, y + 0.11, centerZ, 0.05, 0.04, 0.5);
    for (const z of zs) batch.add(new THREE.CylinderGeometry(0.022, 0.028, 0.08, 8).translate(x, y + 0.06, z), materials.stucco);
  }
  const north = TRANSFORMERS.zs[0];
  zs.forEach((z, index) => {
    const toBushing = new THREE.CatmullRomCurve3([
      new THREE.Vector3(eastX, y, z),
      new THREE.Vector3(eastX + 0.12, y - 0.6, (z + north) / 2),
      new THREE.Vector3(eastX, TRANSFORMERS.height + 0.6, north + (index - 1) * 0.5),
    ]);
    batch.add(new THREE.TubeGeometry(toBushing, 12, 0.028, 6), materials.rubber);
    const intoBoard = new THREE.CatmullRomCurve3([
      new THREE.Vector3(westX, y, z),
      new THREE.Vector3(westX - 0.12, y - 0.8, hall.minZ + 0.45),
      new THREE.Vector3(westX - 0.3 + index * 0.15, SWITCHBOARD.height + 0.01, hall.minZ + 0.28),
    ]);
    batch.add(new THREE.TubeGeometry(intoBoard, 12, 0.028, 6), materials.rubber);
  });
}

function addPlate(context: Station33BuildContext, id: SignId, x: number, y: number, z: number, yaw: number, width: number, height: number): void {
  context.batch.add(context.signage.signGeometry(id, width, height).rotateY(yaw).translate(x, y, z), context.signage.material);
}

/** "Stop! Voltage" on each transformer tank, each motor-generator plinth and by the way in. */
function addDangerPlates(context: Station33BuildContext): void {
  const tankFace = TRANSFORMERS.x - TRANSFORMERS.width / 2 - 0.006;
  for (const z of TRANSFORMERS.zs) addPlate(context, 'high-voltage', tankFace, TRANSFORMERS.height - 0.16, z, -Math.PI / 2, 0.36, 0.18);
  for (const set of MOTOR_GENERATORS) {
    addPlate(context, 'high-voltage', set.x, MOTOR_GENERATOR.plinthHeight * 0.55, set.z + MOTOR_GENERATOR.plinthLength / 2 + 0.006, 0, 0.4, 0.2);
  }
  addPlate(context, 'high-voltage', gallery.minX - 0.6, 1.9, hall.maxZ - 0.03, Math.PI, 0.4, 0.2);
}

/** Someone hung "do not switch on, men at work" on a knife switch and never came back for it. */
function addMenAtWorkTag(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { panelXs, front } = switchboardLayout(-1);
  const x = panelXs[panelXs.length - 1];
  const y = 0.86;
  const z = front + 0.07;
  batch.add(context.signage.signGeometry('men-at-work', 0.28, 0.14).rotateZ(0.05).translate(x, y, z), context.signage.material);
  for (const side of [-1, 1]) batch.addBox(materials.rubber, x + side * 0.07, y + 0.17, z, 0.004, 0.2, 0.004, 0, 0, side * 0.3);
}

/** The diagram on its steel board, a lamp under each feeder: red for the dead ones, green once the mains are back. */
function addMimicBoard(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  const { z, y, width, height } = MIMIC_BOARD;
  const face = hall.minX + 0.045;
  batch.addBox(materials.greySteel, hall.minX + 0.02, y, z, 0.04, height + 0.1, width + 0.1);
  addPlate(context, 'mimic-diagram', face, y, z, Math.PI / 2, width, height);
  const live = lighting.registerMaterial(new THREE.MeshBasicMaterial({ name: 'station33_mimic_live', color: 0x58c070 }), 'mains');
  const dead = lighting.registerMaterial(new THREE.MeshBasicMaterial({ name: 'station33_mimic_dead', color: 0xc23a22 }), 'emergency');
  const lampY = y + height / 2 - MIMIC_LAYOUT.lampRow * height;
  MIMIC_LAYOUT.feeders.forEach((share, index) => {
    // The plate faces +X, so its left-to-right runs towards -Z.
    const lampZ = z - (share - 0.5) * width;
    batch.add(new THREE.SphereGeometry(0.02, 8, 6).translate(face + 0.012, lampY, lampZ), DEAD_FEEDERS.has(index) ? dead : live);
  });
}

/** Gate valves with handwheels and a pressure gauge on the cooling-water main. */
function addCoolingMainFittings(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { y, z, radius } = COOLING_MAIN;
  for (const x of VALVE_XS) {
    batch.add(new THREE.CylinderGeometry(radius + 0.04, radius + 0.04, 0.3, 12).rotateZ(Math.PI / 2).translate(x, y, z), materials.greySteel);
    batch.addBox(materials.greySteel, x, y + 0.17, z, 0.16, 0.12, 0.12);
    batch.add(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 6).translate(x, y + 0.36, z), materials.greySteel);
    const wheelY = y + 0.5;
    batch.add(new THREE.TorusGeometry(0.14, 0.016, 6, 18).rotateX(Math.PI / 2).translate(x, wheelY, z), materials.paintedSteel);
    for (const yaw of [0, Math.PI / 2]) batch.addBox(materials.paintedSteel, x, wheelY, z, 0.28, 0.02, 0.02, 0, yaw, 0);
  }
  const gaugeZ = z + radius + 0.06;
  batch.add(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 6).rotateX(Math.PI / 2).translate(GAUGE_X, y, z + radius + 0.02), materials.greySteel);
  batch.add(new THREE.CylinderGeometry(0.085, 0.085, 0.035, 16).rotateX(Math.PI / 2).translate(GAUGE_X, y, gaugeZ), materials.greySteel);
  batch.add(new THREE.CylinderGeometry(0.07, 0.07, 0.004, 16).rotateX(Math.PI / 2).translate(GAUGE_X, y, gaugeZ + 0.019), materials.stucco);
  batch.addBox(materials.rubber, GAUGE_X + 0.015, y + 0.015, gaugeZ + 0.023, 0.005, 0.06, 0.003, 0, 0, -1.1);
}

/** Steel cabinet of the duty telephone, its handset hanging by its cord. */
function addTelephone(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, y } = TELEPHONE;
  const wall = hall.minZ;
  batch.addBox(materials.greySteel, x, y, wall + 0.06, 0.24, 0.32, 0.12);
  batch.add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14).rotateX(Math.PI / 2).translate(x, y + 0.03, wall + 0.125), materials.rubber);
  batch.addBox(materials.rubber, x - 0.17, y - 0.28, wall + 0.08, 0.05, 0.22, 0.06, 0, 0, 0.12);
  const cord = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x - 0.1, y - 0.12, wall + 0.09),
    new THREE.Vector3(x - 0.13, y - 0.3, wall + 0.1),
    new THREE.Vector3(x - 0.16, y - 0.4, wall + 0.09),
  ]);
  batch.add(new THREE.TubeGeometry(cord, 8, 0.008, 5), materials.rubber);
}
