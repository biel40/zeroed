import * as THREE from 'three';
import type { StaticMeshBatch } from '../shared/StaticMeshBatch';
import { PROTOCOL33_TRUCK_BUMPER_REACH } from '../Station33Config';
import {
  ARCH, AXLES, BODY, CAB, EXHAUST_TIP, FRONT, flankPanel, REAR, TAIL_LIGHT, TRUCK_LENGTH, TRUCK_WIDTH, type TruckPartBatch, WHEEL_RADIUS,
} from './EscapeTruckLayout';
import type { EscapeTruckMaterials } from './EscapeTruckMaterials';
import { addTruckWheel } from './EscapeTruckWheel';

const SIDES = [-1, 1] as const;
const BODY_MIDDLE = (BODY.front + BODY.back) / 2;
const BODY_DEPTH = BODY.back - BODY.front;
/** The roof's rounded edges sit this low, so the box under them stops short of the roof. */
const BODY_SHOULDER = BODY.top - BODY.edge;

/**
 * Everything rigid on the sprung truck below the cab's window line, and the
 * whole box body: the ladder frame, bumper and tow hooks, the cab's flat
 * face with its slatted grille and lamp pods, flanks cut round the front
 * wheel arches, the step and the exhaust, then the kung with its rounded
 * roof, pressed ribs, small windows, side door, vents, red cross panels,
 * fuel tank, spare wheel and the open back with its ladder. Grime cakes
 * the arches and the lower flanks; snow lies on the roof.
 */
export function buildTruckChassis(parts: TruckPartBatch, batch: StaticMeshBatch, materials: EscapeTruckMaterials): void {
  buildFrame(parts, materials);
  buildBumper(parts, materials);
  buildFrontFace(parts, materials);
  buildCabFlanks(parts, materials);
  buildExhaust(parts, materials);
  buildBody(parts, materials);
  buildBodyFlanks(parts, materials);
  buildUnderBody(parts, batch, materials);
  buildRear(parts, materials);
}

/** The axle beams and their differentials between the wheels. */
export function buildTruckAxleHousings(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  for (const fromNose of AXLES) {
    parts.addFromNose(new THREE.CylinderGeometry(0.07, 0.07, 1.7, 8).rotateZ(Math.PI / 2).translate(0, WHEEL_RADIUS, fromNose), materials.darkSteel);
    parts.addFromNose(new THREE.SphereGeometry(0.17, 8, 6).scale(1, 0.9, 1.1).translate(0.12, WHEEL_RADIUS, fromNose), materials.darkSteel);
  }
}

function buildFrame(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  for (const side of SIDES) {
    parts.box(materials.darkSteel, TRUCK_LENGTH / 2, 0.82, 0.08, 0.22, TRUCK_LENGTH - 0.3, side * 0.45);
    // Leaf springs over every axle.
    for (const fromNose of AXLES) {
      parts.box(materials.grime, fromNose, 0.68, 0.07, 0.05, 1.1, side * 0.45);
      parts.box(materials.grime, fromNose, 0.63, 0.07, 0.05, 0.7, side * 0.45);
    }
  }
  for (const fromNose of [0.5, 2.3, 3.6, 5.6, 6.95]) parts.box(materials.darkSteel, fromNose, 0.82, 0.9, 0.14, 0.08);
}

/** A heavy channel bumper, its face exactly `PROTOCOL33_TRUCK_BUMPER_REACH` ahead of the nose, with two tow hooks. */
function buildBumper(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  const reach = PROTOCOL33_TRUCK_BUMPER_REACH;
  parts.box(materials.darkSteel, -reach + 0.03, 0.97, TRUCK_WIDTH - 0.1, 0.24, 0.06);
  for (const y of [0.86, 1.08]) parts.box(materials.darkSteel, -reach / 2, y, TRUCK_WIDTH - 0.1, 0.03, reach);
  for (const side of SIDES) {
    parts.box(materials.darkSteel, 0.03, 0.97, 0.06, 0.24, 0.2, side * (TRUCK_WIDTH / 2 - 0.07), 0, side * 0.45);
    parts.box(materials.darkSteel, 0.06, 0.9, 0.1, 0.12, 0.2, side * 0.45);
    // Tow hook, an open loop standing on the bumper's top lip.
    parts.addFromNose(
      new THREE.TorusGeometry(0.055, 0.018, 6, 10, Math.PI).rotateY(Math.PI / 2).translate(side * 0.55, 1.09, -reach + 0.075),
      materials.darkSteel,
    );
  }
}

/** The cab's flat face: a crease band under the windscreen, the slatted grille between the lamp pods. */
function buildFrontFace(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  const face = CAB.front + 0.03;
  parts.box(materials.paint, face, 1.79, CAB.halfWidth * 2, 0.32, 0.06);
  parts.box(materials.paint, CAB.front - 0.005, 1.66, CAB.halfWidth * 2, 0.03, 0.03);
  // Grille: surround, dark radiator behind, eleven vertical slats.
  parts.box(materials.paint, face, 1.6, 1.24, 0.05, 0.08);
  parts.box(materials.paint, face, 1.03, 1.24, 0.07, 0.08);
  for (const side of SIDES) parts.box(materials.paint, face, 1.315, 0.06, 0.62, 0.08, side * 0.6);
  parts.box(materials.rubber, face + 0.09, 1.315, 1.14, 0.54, 0.02);
  for (let slat = -5; slat <= 5; slat++) parts.box(materials.paint, face + 0.01, 1.315, 0.035, 0.52, 0.06, slat * 0.1);
  for (const side of SIDES) {
    // Lamp pod faces either side of the grille, grimy at the foot.
    parts.box(materials.paint, face, 1.3, 0.58, 0.66, 0.06, side * 0.92);
    parts.box(materials.grime, CAB.front - 0.004, 1.06, 0.58, 0.14, 0.01, side * 0.92);
  }
}

/** Both cab flanks under the window line, cut round the front wheel, with the arch, louvres, step and grime. */
function buildCabFlanks(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  const sill = 0.97;
  const axle = AXLES[0];
  const rise = sill - WHEEL_RADIUS;
  const halfChord = Math.sqrt(ARCH.radius * ARCH.radius - rise * rise);
  const shape = new THREE.Shape();
  shape.moveTo(CAB.front, sill);
  shape.lineTo(axle - halfChord, sill);
  shape.absarc(axle, WHEEL_RADIUS, ARCH.radius, Math.atan2(rise, -halfChord), Math.atan2(rise, halfChord), true);
  shape.lineTo(CAB.back, sill);
  shape.lineTo(CAB.back, CAB.belt);
  shape.lineTo(CAB.front, CAB.belt);
  shape.closePath();
  const archWidth = CAB.halfWidth - ARCH.inner;
  for (const side of SIDES) {
    parts.addFromNose(flankPanel(shape, side, CAB.halfWidth, 0.04, materials.paint), materials.paint);
    // Arch: a grimy liner over the wheel and a lip round its edge.
    parts.addFromNose(
      new THREE.CylinderGeometry(ARCH.radius, ARCH.radius, archWidth, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2)
        .translate(side * (ARCH.inner + archWidth / 2), WHEEL_RADIUS, axle),
      materials.grime,
    );
    parts.addFromNose(
      new THREE.CylinderGeometry(ARCH.radius + 0.03, ARCH.radius + 0.03, 0.05, 18, 1, true, 0, Math.PI).rotateZ(Math.PI / 2)
        .translate(side * (CAB.halfWidth + 0.005), WHEEL_RADIUS, axle),
      materials.grime,
    );
    const outside = side * (CAB.halfWidth + 0.004);
    parts.box(materials.grime, (CAB.front + axle - halfChord) / 2, 1.06, 0.01, 0.18, axle - halfChord - CAB.front, outside);
    parts.box(materials.grime, (axle + halfChord + CAB.back) / 2, 1.06, 0.01, 0.18, CAB.back - axle - halfChord, outside);
    // Engine louvres low on the flank, ahead of the door.
    for (let slot = 0; slot < 4; slot++) parts.box(materials.rubber, 0.3, 1.36 + slot * 0.06, 0.01, 0.022, 0.24, outside);
    // Step under the door's back edge.
    parts.box(materials.darkSteel, 2.0, 0.74, 0.26, 0.03, 0.34, side * 1.06);
    parts.box(materials.darkSteel, 2.0, 0.86, 0.03, 0.24, 0.3, side * 0.94);
  }
}

/** A muffler under the cab and a rusty pipe out to a turned-down tip under the east flank. */
function buildExhaust(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  parts.addFromNose(new THREE.CylinderGeometry(0.12, 0.12, 0.55, 12).rotateX(Math.PI / 2).translate(0.66, 0.72, 1.45), materials.grime);
  const pipe = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.66, 0.72, 1.72),
    new THREE.Vector3(0.82, 0.7, 2.2),
    new THREE.Vector3(1.0, 0.66, 2.5),
    new THREE.Vector3(EXHAUST_TIP.x, EXHAUST_TIP.y, EXHAUST_TIP.fromNose),
  ]);
  parts.addFromNose(new THREE.TubeGeometry(pipe, 12, 0.04, 6), materials.grime);
}

/** The kung's shell: box, rounded roof edges, roof vent and stovepipe, snow along the roof. */
function buildBody(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  parts.box(materials.paint, BODY_MIDDLE, (BODY.bottom + BODY_SHOULDER) / 2, TRUCK_WIDTH, BODY_SHOULDER - BODY.bottom, BODY_DEPTH);
  const roofWidth = TRUCK_WIDTH - BODY.edge * 2;
  parts.box(materials.paint, BODY_MIDDLE, BODY.top - BODY.edge / 2, roofWidth, BODY.edge, BODY_DEPTH - BODY.edge * 2);
  for (const side of SIDES) {
    parts.addFromNose(
      new THREE.CylinderGeometry(BODY.edge, BODY.edge, BODY_DEPTH - BODY.edge * 2, 8).rotateX(Math.PI / 2)
        .translate(side * (TRUCK_WIDTH / 2 - BODY.edge), BODY_SHOULDER, BODY_MIDDLE),
      materials.paint,
    );
  }
  for (const fromNose of [BODY.front + BODY.edge, BODY.back - BODY.edge]) {
    parts.addFromNose(
      new THREE.CylinderGeometry(BODY.edge, BODY.edge, roofWidth, 8).rotateZ(Math.PI / 2).translate(0, BODY_SHOULDER, fromNose),
      materials.paint,
    );
  }
  parts.addFromNose(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 8).translate(0.2, BODY.top + 0.06, 3.4), materials.darkSteel);
  parts.addFromNose(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 12).translate(0.2, BODY.top + 0.14, 3.4), materials.darkSteel);
  parts.addFromNose(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8).translate(-0.85, BODY.top + 0.25, 6.6), materials.grime);
  parts.addFromNose(new THREE.CylinderGeometry(0.1, 0.06, 0.06, 8).translate(-0.85, BODY.top + 0.52, 6.6), materials.grime);
  parts.snowCap(materials.snow, BODY.top, BODY_MIDDLE, roofWidth, BODY_DEPTH - BODY.edge * 2, 0.1);
}

/** Pressed ribs and rails along the flanks, the small windows, the red cross panels and the side door on the west flank. */
function buildBodyFlanks(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  const ribHeight = BODY_SHOULDER - BODY.bottom - 0.12;
  const ribY = (BODY.bottom + BODY_SHOULDER) / 2;
  for (const side of SIDES) {
    const skin = side * (TRUCK_WIDTH / 2);
    for (let rib = BODY.front + 0.5; rib < BODY.back - 0.3; rib += 0.9) parts.box(materials.paint, rib, ribY, 0.06, ribHeight, 0.06, skin);
    parts.box(materials.paint, BODY_MIDDLE, 2.14, 0.05, 0.05, BODY_DEPTH, skin);
    parts.box(materials.darkSteel, BODY_MIDDLE, BODY.bottom + 0.035, 0.06, 0.07, BODY_DEPTH, skin);
    parts.box(materials.grime, BODY_MIDDLE, BODY.bottom + 0.17, 0.01, 0.2, BODY_DEPTH, skin + side * 0.006);
    for (const fromNose of [BODY.front + 0.28, BODY.front + 0.92]) {
      parts.box(materials.rubber, fromNose, 2.5, 0.03, 0.42, 0.36, skin + side * 0.012);
      parts.box(materials.kungWindow, fromNose, 2.5, 0.02, 0.34, 0.28, skin + side * 0.022);
    }
    const flank = side * (TRUCK_WIDTH / 2 + 0.04);
    parts.box(materials.snow, BODY_MIDDLE, 2.15, 0.02, 0.9, 0.9, flank);
    parts.box(materials.redEnamel, BODY_MIDDLE, 2.15, 0.03, 0.62, 0.2, flank);
    parts.box(materials.redEnamel, BODY_MIDDLE, 2.15, 0.03, 0.2, 0.62, flank);
  }
  // Side door between the last two ribs of the west flank: seams, hinges, handle and a step.
  const door = { from: 5.68, to: 6.42, bottom: BODY.bottom + 0.08, top: 2.58 } as const;
  const seam = -(TRUCK_WIDTH / 2 + 0.006);
  for (const fromNose of [door.from, door.to]) parts.box(materials.rubber, fromNose, (door.bottom + door.top) / 2, 0.012, door.top - door.bottom, 0.014, seam);
  for (const y of [door.bottom, door.top]) parts.box(materials.rubber, (door.from + door.to) / 2, y, 0.012, 0.014, door.to - door.from, seam);
  for (const y of [door.bottom + 0.3, door.top - 0.3]) {
    parts.addFromNose(new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8).translate(seam - 0.012, y, door.from + 0.03), materials.darkSteel);
  }
  parts.box(materials.darkSteel, door.to - 0.12, 1.85, 0.03, 0.035, 0.16, seam - 0.015);
  parts.box(materials.darkSteel, (door.from + door.to) / 2, 0.82, 0.3, 0.03, 0.6, seam - 0.12);
}

/** Subframe, bogie mudguards and flaps, the fuel tank and the spare wheel. */
function buildUnderBody(parts: TruckPartBatch, batch: StaticMeshBatch, materials: EscapeTruckMaterials): void {
  const subframe = BODY.bottom - 0.93;
  for (const side of SIDES) parts.box(materials.darkSteel, BODY_MIDDLE, 0.93 + subframe / 2, 0.1, subframe, BODY_DEPTH, side * 0.45);
  for (let bearer = BODY.front + 0.2; bearer < BODY.back; bearer += 0.9) parts.box(materials.darkSteel, bearer, BODY.bottom - 0.03, TRUCK_WIDTH - 0.2, 0.06, 0.08);
  for (const side of SIDES) {
    parts.box(materials.grime, (AXLES[1] + AXLES[2]) / 2, BODY.bottom - 0.02, 0.5, 0.03, 2.6, side);
    parts.box(materials.rubber, AXLES[2] + 0.72, 0.68, 0.46, 0.5, 0.02, side);
  }
  const tankX = -TRUCK_WIDTH / 2 + 0.2;
  parts.addFromNose(new THREE.CylinderGeometry(0.26, 0.26, 1.1, 14).rotateX(Math.PI / 2).translate(tankX, 0.75, 3.1), materials.paint);
  for (const strap of [2.75, 3.45]) {
    parts.addFromNose(new THREE.CylinderGeometry(0.272, 0.272, 0.04, 14).rotateX(Math.PI / 2).translate(tankX, 0.75, strap), materials.darkSteel);
  }
  parts.addFromNose(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 8).translate(tankX, 1.03, 3.4), materials.darkSteel);
  const spareX = TRUCK_WIDTH / 2 + 0.2;
  addTruckWheel(batch, materials, spareX, 1.72, FRONT + 3.4, 1);
  parts.box(materials.darkSteel, 3.4, 1.72, 0.12, 0.1, 0.1, TRUCK_WIDTH / 2 + 0.02);
}

/** The open back's frame and dark inside, the rear bumper with the light housings, and the ladder. */
function buildRear(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  const back = REAR - FRONT;
  const openingHeight = BODY_SHOULDER - BODY.bottom - 0.16;
  const openingY = (BODY.bottom + BODY_SHOULDER) / 2;
  parts.box(materials.rubber, back - 0.06, openingY, TRUCK_WIDTH - 0.16, openingHeight, 0.02);
  for (const side of SIDES) parts.box(materials.paint, back - 0.08, openingY, 0.08, openingHeight + 0.1, 0.06, side * (TRUCK_WIDTH / 2 - 0.04));
  parts.box(materials.darkSteel, back - 0.02, TAIL_LIGHT.y, TRUCK_WIDTH - 0.2, 0.14, 0.1);
  for (const side of SIDES) parts.box(materials.darkSteel, back + 0.02, TAIL_LIGHT.y, 0.28, 0.16, 0.03, side * TAIL_LIGHT.dx);
  for (const side of [-0.3, 0.3]) parts.box(materials.darkSteel, back + 0.22, 0.55, 0.04, 1.0, 0.04, side);
  for (const rung of [0.3, 0.6, 0.9]) parts.box(materials.darkSteel, back + 0.4 - rung * 0.36, rung, 0.6, 0.03, 0.05);
}
