import * as THREE from 'three';
import { addSolidProxy } from '../shared/SolidProxy';
import { POWER_LEVER, SUBESTACION } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { addOilDrums } from './OilDrums';

const { hall } = SUBESTACION;
/**
 * Motor-generator sets on concrete plinths, their shafts along Z: one by the
 * west wall, one east of the central aisle that runs from the gallery to
 * the main switch.
 */
export const MOTOR_GENERATORS = [{ x: 6.3, z: -40.4 }, { x: 15.1, z: -40.4 }] as const;
export const MOTOR_GENERATOR = { plinthWidth: 2.6, plinthLength: 6.4, plinthHeight: 0.45, shaftY: 1.4 } as const;
/** Two oil-cooled transformers in the north-east corner, clear of the cable-tunnel door. */
export const TRANSFORMERS = { x: 19.6, zs: [-43.8, -41.4], width: 2.0, depth: 1.6, height: 2.0 } as const;
/** Switchboards along the north wall on either side of the main switch, three panels each. */
export const SWITCHBOARD = { depth: 0.55, height: 2.2, gap: 0.8, length: 2.6, panels: 3 } as const;

/** Span of the switchboard on `side` of the main switch and its panel centres, west to east. */
export function switchboardLayout(side: -1 | 1): { readonly minX: number; readonly maxX: number; readonly front: number; readonly panelXs: readonly number[] } {
  const { depth, gap, length, panels } = SWITCHBOARD;
  const nearX = POWER_LEVER.x + side * gap;
  const farX = nearX + side * length;
  const minX = Math.min(nearX, farX);
  const maxX = Math.max(nearX, farX);
  const panelWidth = (maxX - minX) / panels;
  const panelXs = Array.from({ length: panels }, (_, panel) => minX + panelWidth * (panel + 0.5));
  return { minX, maxX, front: hall.minZ + depth, panelXs };
}
/** Three rusty oil drums huddled in the south-west corner, one dented and leaning. */
const OIL_DRUMS: ReadonlyArray<readonly [number, number]> = [[4.75, -35.0], [5.45, -35.15], [4.95, -35.75]];

/**
 * Solid machinery of the substation. Visuals go to the shared batch; each
 * piece gets one invisible AABB proxy that stops bullets, zombies and the
 * player. They leave a wide aisle from the gallery to the main switch and
 * lanes of at least 1.4 m around both motor-generators.
 */
export function buildSubestacionFurniture(context: Station33BuildContext, lighting: Station33Lighting): void {
  for (const set of MOTOR_GENERATORS) addMotorGenerator(context, set.x, set.z);
  for (const z of TRANSFORMERS.zs) addTransformer(context, z);
  addSolidProxy(context, 'transformers',
    { x: TRANSFORMERS.x - TRANSFORMERS.width / 2 - 0.25, y: 0, z: Math.min(...TRANSFORMERS.zs) - TRANSFORMERS.depth / 2 },
    { x: hall.maxX, y: TRANSFORMERS.height + 0.8, z: Math.max(...TRANSFORMERS.zs) + TRANSFORMERS.depth / 2 }, 'metal', 'none');
  for (const side of [-1, 1] as const) addSwitchboard(context, lighting, side);
  addOilDrums(context, 'oil-drums', OIL_DRUMS);
}

/**
 * Concrete plinth and bedplate, a ribbed motor, the flywheel with its
 * striped rim half sunk in a slot, the generator with its copper
 * commutator, and the terminal box feeding cables down into the floor.
 */
function addMotorGenerator(context: Station33BuildContext, x: number, z: number): void {
  const { batch, materials } = context;
  const { plinthWidth, plinthLength, plinthHeight, shaftY } = MOTOR_GENERATOR;
  const along = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => geometry.rotateX(Math.PI / 2);
  batch.addBox(materials.serviceConcrete, x, plinthHeight / 2, z, plinthWidth, plinthHeight, plinthLength, 0, 0, 0, x + z);
  batch.addBox(materials.greySteel, x, plinthHeight + 0.07, z, plinthWidth - 0.6, 0.14, plinthLength - 0.4);
  const motorZ = z - 1.5;
  batch.add(along(new THREE.CylinderGeometry(0.8, 0.8, 2.4, 20)).translate(x, shaftY, motorZ), materials.paintedSteel);
  for (let rib = 0; rib < 7; rib++) {
    batch.add(along(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 20)).translate(x, shaftY, motorZ - 1.0 + rib * 0.33), materials.greySteel);
  }
  batch.add(along(new THREE.CylinderGeometry(0.55, 0.62, 0.12, 16)).translate(x, shaftY, motorZ - 1.26), materials.greySteel);
  batch.add(along(new THREE.CylinderGeometry(1.15, 1.15, 0.26, 28)).translate(x, shaftY, z), materials.greySteel);
  batch.add(along(new THREE.CylinderGeometry(1.18, 1.18, 0.1, 28)).translate(x, shaftY, z), materials.hazardPaint);
  batch.add(along(new THREE.CylinderGeometry(0.12, 0.12, 3.0, 10)).translate(x, shaftY, z + 0.2), materials.greySteel);
  const generatorZ = z + 1.6;
  batch.add(along(new THREE.CylinderGeometry(0.95, 0.95, 2.2, 22)).translate(x, shaftY, generatorZ), materials.paintedSteel);
  batch.add(along(new THREE.CylinderGeometry(0.5, 0.5, 0.36, 16)).translate(x, shaftY, generatorZ + 1.28), materials.bronze);
  for (const end of [motorZ, generatorZ]) {
    batch.addBox(materials.greySteel, x, (plinthHeight + shaftY) / 2, end, 1.4, shaftY - plinthHeight, 0.5);
  }
  batch.addBox(materials.greySteel, x + 0.5, shaftY + 1.05, generatorZ, 0.5, 0.4, 0.7);
  const feed = new THREE.CatmullRomCurve3([
    new THREE.Vector3(x + 0.7, shaftY + 1.0, generatorZ),
    new THREE.Vector3(x + 1.25, shaftY + 0.4, generatorZ + 0.2),
    new THREE.Vector3(x + 1.32, plinthHeight, generatorZ + 0.4),
  ]);
  batch.add(new THREE.TubeGeometry(feed, 10, 0.05, 6), materials.rubber);
  addSolidProxy(context, 'motor-generator',
    { x: x - plinthWidth / 2, y: 0, z: z - plinthLength / 2 },
    { x: x + plinthWidth / 2, y: shaftY + 1.25, z: z + plinthLength / 2 }, 'metal', 'none');
}

/** Grey tank with radiator fins on its open sides, an oil conservator and porcelain bushings on top. */
function addTransformer(context: Station33BuildContext, z: number): void {
  const { batch, materials } = context;
  const { x, width, depth, height } = TRANSFORMERS;
  batch.addBox(materials.greySteel, x, height / 2, z, width, height, depth);
  for (let fin = 0; fin < 9; fin++) {
    batch.addBox(materials.greySteel, x - width / 2 - 0.12, 0.95, z - depth / 2 + 0.12 + fin * 0.17, 0.24, 1.5, 0.03);
  }
  const conservator = new THREE.CylinderGeometry(0.22, 0.22, depth, 14).rotateX(Math.PI / 2).translate(x + 0.5, height + 0.42, z);
  batch.add(conservator, materials.greySteel);
  batch.addBox(materials.greySteel, x + 0.5, height + 0.12, z, 0.1, 0.24, 0.1);
  for (const offset of [-0.5, 0, 0.5]) {
    for (let shed = 0; shed < 4; shed++) {
      const disc = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12).translate(x - 0.4, height + 0.08 + shed * 0.12, z + offset);
      batch.add(disc, materials.stucco);
    }
    batch.add(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 8).translate(x - 0.4, height + 0.25, z + offset), materials.stucco);
    batch.add(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8).translate(x - 0.4, height + 0.54, z + offset), materials.bronze);
  }
  batch.addBox(materials.hazardPaint, x - width / 2 - 0.25, 0.01, z, 0.08, 0.02, depth + 0.3);
}

/**
 * A row of switchboard panels against the north wall, on one side of the
 * main switch: panel doors, round meters, knife switches and indicator
 * lamps on the substation's own circuit, dark until the power comes back.
 */
function addSwitchboard(context: Station33BuildContext, lighting: Station33Lighting, side: -1 | 1): void {
  const { batch, materials } = context;
  const { depth, height, panels } = SWITCHBOARD;
  const { minX, maxX, front, panelXs } = switchboardLayout(side);
  batch.addBox(materials.greySteel, (minX + maxX) / 2, height / 2, hall.minZ + depth / 2, maxX - minX, height, depth);
  const panelWidth = (maxX - minX) / panels;
  panelXs.forEach((cx, panel) => {
    batch.addBox(materials.greySteel, cx, 1.05, front + 0.01, panelWidth - 0.06, 1.8, 0.02);
    batch.addBox(materials.rubber, cx + panelWidth / 2 - 0.03, 1.05, front + 0.012, 0.012, 1.8, 0.02);
    for (const dx of [-0.2, 0.2]) {
      const meter = new THREE.CylinderGeometry(0.11, 0.11, 0.04, 16).rotateX(Math.PI / 2).translate(cx + dx, 1.65, front + 0.03);
      batch.add(meter, materials.stucco);
      batch.addBox(materials.rubber, cx + dx + 0.02, 1.67, front + 0.055, 0.008, 0.09, 0.005, 0, 0, -0.7 + panel * 0.5);
    }
    batch.addBox(materials.darkGranite, cx, 1.15, front + 0.03, 0.34, 0.28, 0.03);
    for (const dx of [-0.08, 0, 0.08]) batch.addBox(materials.greySteel, cx + dx, 1.18, front + 0.09, 0.012, 0.18, 0.06, 0.6, 0, 0);
    const lamp = new THREE.SphereGeometry(0.03, 10, 6).translate(cx, 1.9, front + 0.035);
    batch.add(lamp, lighting.circuitMaterial('mains'));
  });
  addSolidProxy(context, 'switchboard', { x: minX, y: 0, z: hall.minZ }, { x: maxX, y: height, z: front + 0.05 }, 'metal');
}
