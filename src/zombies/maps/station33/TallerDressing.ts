import * as THREE from 'three';
import { cobwebGeometry, type CobwebCorner } from '../shared/Cobwebs';
import { seededRandom } from '../shared/ProceduralNoise';
import { placement } from '../shared/StaticMeshBatch';
import { STATION33_BARRIERS, TALLER, TALLER_BOGIE, TALLER_CRANE } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { TALLER_WORKBENCH } from './TallerFurniture';

const { hall, ceilingHeight } = TALLER;
const SERVICE_DOOR = STATION33_BARRIERS.find((barrier) => barrier.id === 'taller-service-door')!;

/**
 * Everything non-solid that makes the workshop feel worked in and then
 * abandoned: the overhead crane parked over the bogie, the shadow board of
 * tools with gaps where tools were grabbed, the bench lamp still burning,
 * the hazard lines of the crane bay, oil, blood from the service door,
 * webs and the shift's paperwork on the floor.
 */
export function buildTallerDressing(context: Station33BuildContext, lighting: Station33Lighting): void {
  addCrane(context);
  addToolBoard(context);
  addBenchLamp(context, lighting);
  addDoorLamp(context, lighting);
  addSigns(context);
  addFloorMarkings(context);
  addDecals(context);
  addCobwebs(context);
  addLitter(context);
}

/**
 * Runway girders on wall brackets along both side walls, the bridge with
 * its end trucks and hazard stripes, and the hoist trolley above the bogie
 * with its hanging pendant. The swinging chain and hook live in the
 * station's atmosphere.
 */
function addCrane(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { runwayY, bridgeZ, hoistX, hoistY } = TALLER_CRANE;
  const length = hall.maxZ - hall.minZ;
  const centerZ = (hall.minZ + hall.maxZ) / 2;
  const runwayXs = [hall.minX + 0.22, hall.maxX - 0.22] as const;
  for (const x of runwayXs) {
    const wallward = x < (hall.minX + hall.maxX) / 2 ? -1 : 1;
    batch.addBox(materials.greySteel, x, runwayY, centerZ, 0.22, 0.3, length - 0.04);
    batch.addBox(materials.railSteel, x, runwayY + 0.18, centerZ, 0.06, 0.06, length - 0.04);
    for (let z = hall.minZ + 1.0; z < hall.maxZ - 0.5; z += 2.9) {
      batch.addBox(materials.greySteel, x + wallward * 0.06, runwayY - 0.28, z, 0.34, 0.26, 0.12);
      batch.addBox(materials.greySteel, x + wallward * 0.1, runwayY - 0.5, z, 0.05, 0.42, 0.1, 0, 0, wallward * 0.6);
    }
  }
  const truckY = runwayY + 0.33;
  for (const x of runwayXs) {
    batch.addBox(materials.paintedSteel, x, truckY, bridgeZ, 0.3, 0.24, 1.7);
    for (const end of [-0.6, 0.6]) {
      batch.add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12).rotateZ(Math.PI / 2).translate(x, runwayY + 0.25, bridgeZ + end), materials.greySteel);
    }
  }
  const span = runwayXs[1] - runwayXs[0] - 0.3;
  const bridgeY = truckY - 0.02;
  const centerX = (runwayXs[0] + runwayXs[1]) / 2;
  batch.addBox(materials.paintedSteel, centerX, bridgeY, bridgeZ, span, 0.36, 0.34);
  for (const side of [-1, 1]) batch.addBox(materials.hazardPaint, centerX, bridgeY, bridgeZ + side * 0.175, span, 0.14, 0.012);
  const trolleyY = bridgeY - 0.18 - 0.14;
  batch.addBox(materials.greySteel, hoistX, trolleyY, bridgeZ, 0.55, 0.28, 0.6);
  batch.add(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 14).rotateZ(Math.PI / 2).translate(hoistX, hoistY + 0.1, bridgeZ), materials.greySteel);
  batch.addBox(materials.paintedSteel, hoistX + 0.36, trolleyY, bridgeZ, 0.2, 0.24, 0.3);
  // Pendant control dangling on its cable beside the hook.
  const pendantX = hoistX + 0.36;
  const pendantZ = bridgeZ + 0.12;
  const pendantY = 1.65;
  const cable = trolleyY - 0.12 - pendantY;
  batch.add(new THREE.CylinderGeometry(0.008, 0.008, cable, 4).translate(pendantX, pendantY + cable / 2, pendantZ), materials.rubber);
  batch.addBox(materials.hazardPaint, pendantX, pendantY - 0.1, pendantZ, 0.08, 0.22, 0.07);
}

/**
 * Pegboard over the workbench with painted outlines: spanners, hammers, a
 * hacksaw and files hang on it, and pale outlines mark the tools taken.
 */
const TOOLS: ReadonlyArray<{ readonly kind: 'spanner' | 'hammer' | 'saw' | 'file'; readonly z: number; readonly y: number; readonly missing?: boolean }> = [
  { kind: 'spanner', z: -52.45, y: 1.75 },
  { kind: 'spanner', z: -52.3, y: 1.75, missing: true },
  { kind: 'spanner', z: -52.15, y: 1.72 },
  { kind: 'spanner', z: -52.0, y: 1.7 },
  { kind: 'hammer', z: -51.7, y: 1.68 },
  { kind: 'hammer', z: -51.45, y: 1.68, missing: true },
  { kind: 'saw', z: -51.0, y: 1.82 },
  { kind: 'file', z: -50.7, y: 1.6 },
  { kind: 'file', z: -50.6, y: 1.6, missing: true },
];

function addToolBoard(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const boardZ = TALLER_WORKBENCH.z;
  const face = hall.minX + 0.03;
  batch.addBox(materials.varnishedWood, hall.minX + 0.015, 1.68, boardZ, 0.03, 0.9, 2.1);
  for (const tool of TOOLS) {
    const [height, width] = tool.kind === 'saw' ? [0.14, 0.48] : tool.kind === 'hammer' ? [0.32, 0.1] : [0.26, 0.04];
    if (tool.missing) {
      batch.addBox(materials.paper, face + 0.002, tool.y, tool.z, 0.004, height, width);
      continue;
    }
    if (tool.kind === 'hammer') {
      batch.addBox(materials.varnishedWood, face + 0.015, tool.y, tool.z, 0.025, height, 0.03);
      batch.addBox(materials.greySteel, face + 0.02, tool.y + height / 2 - 0.02, tool.z, 0.035, 0.045, 0.13);
    } else if (tool.kind === 'saw') {
      batch.addBox(materials.greySteel, face + 0.01, tool.y, tool.z, 0.006, 0.02, width);
      batch.addBox(materials.greySteel, face + 0.01, tool.y - height / 2, tool.z, 0.006, 0.08, width - 0.04);
      batch.addBox(materials.varnishedWood, face + 0.02, tool.y - 0.04, tool.z + width / 2 + 0.03, 0.03, 0.14, 0.05);
    } else {
      batch.addBox(materials.greySteel, face + 0.008, tool.y, tool.z, 0.012, height, width, tool.kind === 'spanner' ? 0.08 : 0);
    }
  }
}

/** Anglepoise lamp clamped to the back of the bench, its bulb still warm. */
function addBenchLamp(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  const baseX = hall.minX + 0.14;
  const z = TALLER_WORKBENCH.z;
  const top = TALLER_WORKBENCH.height + 0.05;
  batch.add(new THREE.CylinderGeometry(0.07, 0.08, 0.04, 12).translate(baseX, top + 0.02, z), materials.greySteel);
  batch.add(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 6), materials.greySteel, placement(baseX + 0.05, top + 0.32, z, 0, 0, -0.18));
  batch.add(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 6), materials.greySteel, placement(baseX + 0.28, top + 0.66, z, 0, 0, -1.2));
  const shadeX = hall.minX + 0.6;
  const shadeY = top + 0.6;
  batch.add(new THREE.ConeGeometry(0.12, 0.16, 14, 1, true).translate(shadeX, shadeY, z), materials.paintedSteel);
  batch.add(new THREE.SphereGeometry(0.045, 10, 6).translate(shadeX, shadeY - 0.06, z), lighting.circuitMaterial('amber'));
}

/** Yellow caged lamp over the doorway from the substation. */
function addDoorLamp(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  const yellowLamp = lighting.registerMaterial(new THREE.MeshBasicMaterial({ color: TALLER.lightColor }), 'amber');
  batch.addBox(materials.greySteel, 5.6, 2.5, hall.maxZ - 0.08, 0.38, 0.24, 0.12);
  batch.addBox(yellowLamp, 5.6, 2.5, hall.maxZ - 0.15, 0.3, 0.16, 0.03);
}

/** The workshop plate over the ring locker, no entry by the service door, no smoking by the gas bottles. */
function addSigns(context: Station33BuildContext): void {
  const { signage, batch } = context;
  batch.add(signage.signGeometry('maintenance', 1.1, 0.45).rotateY(-Math.PI / 2).translate(hall.maxX - 0.02, 2.5, -50.8), signage.material);
  batch.add(signage.signGeometry('no-entry', 0.6, 0.3).translate(SERVICE_DOOR.x - 1.4, 1.8, hall.minZ + 0.035), signage.material);
  batch.add(signage.signGeometry('no-smoking', 0.5, 0.36).rotateY(-Math.PI / 2).translate(hall.maxX - 0.02, 2.0, -56.0), signage.material);
}

/** Worn hazard lines round the crane bay and a walkway line from the substation door. */
function addFloorMarkings(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const minX = TALLER_BOGIE.x - TALLER_BOGIE.width / 2 - 0.6;
  const maxX = TALLER_BOGIE.x + TALLER_BOGIE.width / 2 + 0.6;
  const minZ = TALLER_BOGIE.z - 3.15;
  const maxZ = TALLER_BOGIE.z + 3.15;
  const line = 0.1;
  const y = 0.006;
  batch.addBox(materials.hazardPaint, (minX + maxX) / 2, y, minZ, maxX - minX, 0.012, line);
  batch.addBox(materials.hazardPaint, (minX + maxX) / 2, y, maxZ, maxX - minX, 0.012, line);
  batch.addBox(materials.hazardPaint, minX, y, (minZ + maxZ) / 2, line, 0.012, maxZ - minZ);
  batch.addBox(materials.hazardPaint, maxX, y, (minZ + maxZ) / 2, line, 0.012, maxZ - minZ);
}

function addDecal(context: Station33BuildContext, material: THREE.Material, x: number, y: number, z: number, width: number, height: number, yaw: number | 'floor'): void {
  const decal = new THREE.PlaneGeometry(width, height);
  if (yaw === 'floor') decal.rotateX(-Math.PI / 2).rotateY(x + z);
  else decal.rotateY(yaw);
  decal.translate(x, y, z);
  context.batch.add(decal, material);
}

/** Oil under the bogie, the drill and the drums, seepage down the plaster and the horde's trail from the service door. */
function addDecals(context: Station33BuildContext): void {
  const { materials } = context;
  for (const [x, z, size] of [[TALLER_BOGIE.x, TALLER_BOGIE.z, 2.6], [5.2, -55.3, 1.2], [5.4, -51.4, 1.4], [15.5, -58.0, 1.5], [8.4, -49.2, 1.1]] as const) {
    addDecal(context, materials.floorGrime, x, 0.004, z, size, size * 0.7, 'floor');
  }
  addDecal(context, materials.bloodSmear, SERVICE_DOOR.x + 0.1, 0.008, hall.minZ + 1.3, 1.7, 0.8, 'floor');
  addDecal(context, materials.bloodSmear, SERVICE_DOOR.x - 1.0, 0.009, hall.minZ + 3.0, 1.3, 0.6, 'floor');
  addDecal(context, materials.bloodSplatter, SERVICE_DOOR.x + 1.1, 1.3, hall.minZ + 0.036, 0.9, 1.0, 0);
  const streakY = ceilingHeight - 1.0;
  addDecal(context, materials.waterStreak, 6.4, streakY, hall.minZ + 0.035, 1.2, 1.8, 0);
  addDecal(context, materials.waterStreak, hall.minX + 0.035, streakY, -48.4, 1.0, 1.6, Math.PI / 2);
  addDecal(context, materials.waterStreak, hall.maxX - 0.035, streakY, -58.0, 1.1, 1.8, -Math.PI / 2);
}

/** Web planes as in the other rooms: `yaw` turns the plane, the anchor corner sits at (x, y, z). */
const COBWEBS: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number; readonly yaw: number; readonly width: number; readonly height: number; readonly corner: CobwebCorner }> = [
  { x: hall.minX + 0.01, y: ceilingHeight, z: hall.minZ + 0.02, yaw: -Math.PI / 2, width: 1.0, height: 0.9, corner: 'top-left' },
  { x: hall.maxX - 0.01, y: ceilingHeight, z: hall.minZ + 0.02, yaw: -Math.PI / 2, width: 1.2, height: 1.0, corner: 'top-left' },
  { x: hall.minX + 0.02, y: ceilingHeight, z: hall.maxZ - 0.01, yaw: 0, width: 0.9, height: 0.8, corner: 'top-left' },
  { x: hall.maxX - 0.02, y: ceilingHeight, z: hall.maxZ - 0.01, yaw: Math.PI, width: 1.1, height: 0.9, corner: 'top-left' },
  // Between the parts rack's top shelf and the north wall, and under a runway bracket.
  { x: 8.62, y: 2.4, z: hall.minZ + 0.02, yaw: 0, width: 0.7, height: 0.6, corner: 'bottom-right' },
  { x: hall.minX + 0.01, y: TALLER_CRANE.runwayY - 0.15, z: -52.4, yaw: -Math.PI / 2, width: 0.8, height: 0.7, corner: 'top-left' },
];

function addCobwebs(context: Station33BuildContext): void {
  for (const web of COBWEBS) {
    const geometry = cobwebGeometry(web.width, web.height, web.corner).rotateY(web.yaw).translate(web.x, web.y, web.z);
    context.batch.add(geometry, context.materials.cobweb);
  }
}

/** Job cards blown off the bench, loose nuts by the rack and a spanner dropped on the way to the door. */
function addLitter(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const random = seededRandom(5839);
  for (let index = 0; index < 10; index++) {
    const sheet = new THREE.PlaneGeometry(0.15 + random() * 0.06, 0.2 + random() * 0.06);
    sheet.rotateX(-Math.PI / 2);
    sheet.rotateY(random() * Math.PI * 2);
    sheet.translate(5.3 + random() * 2.2, 0.004 + index * 0.0002, -53.0 + random() * 3.2);
    batch.add(sheet, materials.paper);
  }
  for (let index = 0; index < 14; index++) {
    const nut = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 6).translate(5.0 + random() * 3.4, 0.01, hall.minZ + 0.8 + random() * 1.0);
    batch.add(nut, materials.greySteel);
  }
  batch.addBox(materials.greySteel, 8.9, 0.008, -50.2, 0.04, 0.012, 0.3, 0, 0.7);
}
