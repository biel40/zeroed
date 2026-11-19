import * as THREE from 'three';
import { CAB, flankPanel, SCREEN_RAKE, type TruckPartBatch } from './EscapeTruckLayout';
import type { EscapeTruckMaterials } from './EscapeTruckMaterials';

const SIDES = [-1, 1] as const;
const ROOF_FRONT = CAB.screenTop.fromNose;
const ROOF_DEPTH = CAB.back - ROOF_FRONT;
const ROOF_MIDDLE = (ROOF_FRONT + CAB.back) / 2;
const SCREEN_MIDDLE = {
  fromNose: (CAB.screenBottom.fromNose + CAB.screenTop.fromNose) / 2,
  y: (CAB.screenBottom.y + CAB.screenTop.y) / 2,
} as const;
const SCREEN_HEIGHT = Math.hypot(CAB.screenTop.fromNose - CAB.screenBottom.fromNose, CAB.screenTop.y - CAB.screenBottom.y);
const SIDE_WINDOW = { from: 0.42, to: 1.64, bottom: CAB.belt + 0.03, top: 2.43 } as const;
/** The dashboard's face leans back towards the driver by this much. */
const DASH_TILT = -0.35;
const DASH_FACE = { fromNose: 0.54, y: 1.8 } as const;
/** The steering wheel's tilt: well past vertical, the way a forward-control cab sits its driver. */
const WHEEL_TILT = -0.87;
const WHEEL_HUB = { x: -CAB.seatX, y: 1.93, fromNose: 0.8 } as const;
const WHEEL_RIM = 0.21;

/**
 * The cab above the window line and everything inside it: pillars, the
 * split raked windscreen, door glass, roof and back wall with its little
 * window, door seams, handles and hinges, mirrors on their arms, wipers
 * hung from the header, the radio whip; inside, a checker-plate floor,
 * the engine cover between two upholstered seats, a dashboard with an
 * instrument binnacle of analog gauges, toggles and a glovebox, a big
 * thin-rimmed steering wheel on its column, pedals and levers, door cards,
 * the radio set with its cables, and a few things of the crew's.
 */
export function buildTruckCab(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  buildShell(parts, materials);
  buildFlankDetail(parts, materials);
  buildMirrorsAndWipers(parts, materials);
  buildCabFloor(parts, materials);
  buildDashboard(parts, materials);
  buildSteering(parts, materials);
  buildSeats(parts, materials);
  buildTrim(parts, materials);
  buildCrewKit(parts, materials);
}

function buildShell(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  const width = CAB.halfWidth * 2;
  // Windscreen: header, cowl, corner and centre pillars, two panes.
  parts.box(materials.paint, ROOF_FRONT + 0.01, CAB.screenTop.y + 0.02, width, 0.06, 0.08);
  parts.box(materials.paint, CAB.screenBottom.fromNose, CAB.screenBottom.y - 0.02, width, 0.05, 0.1);
  for (const side of SIDES) {
    parts.box(materials.paint, SCREEN_MIDDLE.fromNose, SCREEN_MIDDLE.y, 0.08, SCREEN_HEIGHT + 0.04, 0.07, side * (CAB.halfWidth - 0.04), SCREEN_RAKE);
    parts.box(materials.glass, SCREEN_MIDDLE.fromNose, SCREEN_MIDDLE.y, CAB.halfWidth - 0.1, SCREEN_HEIGHT - 0.03, 0.008, side * (CAB.halfWidth / 2 + 0.01), SCREEN_RAKE);
  }
  parts.box(materials.paint, SCREEN_MIDDLE.fromNose, SCREEN_MIDDLE.y, 0.05, SCREEN_HEIGHT, 0.04, 0, SCREEN_RAKE);
  // Roof with rolled edges and rain gutters.
  parts.box(materials.paint, ROOF_MIDDLE, CAB.top - 0.02, width - 0.08, 0.04, ROOF_DEPTH);
  for (const side of SIDES) {
    parts.addFromNose(
      new THREE.CylinderGeometry(0.05, 0.05, ROOF_DEPTH, 8).rotateX(Math.PI / 2).translate(side * (CAB.halfWidth - 0.05), CAB.top - 0.05, ROOF_MIDDLE),
      materials.paint,
    );
    parts.box(materials.paint, ROOF_MIDDLE, CAB.top - 0.1, 0.03, 0.03, ROOF_DEPTH, side * (CAB.halfWidth + 0.01));
  }
  parts.snowCap(materials.snow, CAB.top, ROOF_MIDDLE, width - 0.14, ROOF_DEPTH - 0.08, 0.05);
  // Back wall round its small window.
  const back = CAB.back;
  parts.box(materials.paint, back, (0.97 + 2.0) / 2, width, 2.0 - 0.97, 0.04);
  parts.box(materials.paint, back, (2.36 + CAB.top - 0.04) / 2, width, CAB.top - 0.04 - 2.36, 0.04);
  for (const side of SIDES) parts.box(materials.paint, back, 2.18, CAB.halfWidth - 0.4, 0.36, 0.04, side * (CAB.halfWidth + 0.4) / 2);
  parts.box(materials.glass, back, 2.18, 0.8, 0.36, 0.008);
  for (const side of SIDES) {
    // Flank over the belt: the quarter under the corner pillar, the door glass, the post and panel behind it.
    const quarter = new THREE.Shape();
    quarter.moveTo(CAB.screenBottom.fromNose, CAB.belt);
    quarter.lineTo(SIDE_WINDOW.from, CAB.belt);
    quarter.lineTo(SIDE_WINDOW.from, CAB.screenTop.y);
    quarter.lineTo(CAB.screenTop.fromNose, CAB.screenTop.y);
    quarter.closePath();
    parts.addFromNose(flankPanel(quarter, side, CAB.halfWidth, 0.04, materials.paint), materials.paint);
    const pane = side * (CAB.halfWidth - 0.02);
    parts.box(materials.glass, (SIDE_WINDOW.from + SIDE_WINDOW.to) / 2, (SIDE_WINDOW.bottom + SIDE_WINDOW.top) / 2, 0.008,
      SIDE_WINDOW.top - SIDE_WINDOW.bottom, SIDE_WINDOW.to - SIDE_WINDOW.from, pane);
    parts.box(materials.rubber, (SIDE_WINDOW.from + SIDE_WINDOW.to) / 2, SIDE_WINDOW.top + 0.015, 0.03, 0.03, SIDE_WINDOW.to - SIDE_WINDOW.from, pane);
    parts.box(materials.paint, (SIDE_WINDOW.from + SIDE_WINDOW.to) / 2, SIDE_WINDOW.bottom - 0.01, 0.06, 0.03, SIDE_WINDOW.to - SIDE_WINDOW.from, pane);
    parts.box(materials.paint, SIDE_WINDOW.to + 0.04, (CAB.belt + CAB.top) / 2, 0.05, CAB.top - CAB.belt, 0.08, side * (CAB.halfWidth - 0.025));
    const rearPanel = CAB.back - SIDE_WINDOW.to - 0.08;
    parts.box(materials.paint, CAB.back - rearPanel / 2, (CAB.belt + CAB.top - 0.04) / 2, 0.04, CAB.top - 0.04 - CAB.belt, rearPanel, side * (CAB.halfWidth - 0.02));
  }
}

/** Door seams, hinges, handles and keyholes, the side marker lamps' bezels and the radio whip on the roof. */
function buildFlankDetail(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  const { door } = CAB;
  for (const side of SIDES) {
    const seam = side * (CAB.halfWidth + 0.003);
    parts.box(materials.rubber, door.from, (door.bottom + CAB.belt) / 2, 0.01, CAB.belt - door.bottom, 0.012, seam);
    parts.box(materials.rubber, door.to, (door.bottom + CAB.top - 0.06) / 2, 0.01, CAB.top - 0.06 - door.bottom, 0.012, seam);
    parts.box(materials.rubber, (door.from + door.to) / 2, door.bottom, 0.01, 0.012, door.to - door.from, seam);
    const outside = side * (CAB.halfWidth + 0.014);
    parts.box(materials.darkSteel, door.to - 0.13, 1.86, 0.03, 0.035, 0.17, outside);
    parts.box(materials.darkSteel, door.to - 0.24, 1.86, 0.026, 0.03, 0.03, outside);
    for (const y of [1.45, 1.85]) {
      parts.addFromNose(new THREE.CylinderGeometry(0.02, 0.02, 0.13, 8).translate(outside, y, door.from + 0.03), materials.darkSteel);
    }
  }
  parts.addFromNose(new THREE.CylinderGeometry(0.035, 0.045, 0.06, 8).translate(0.85, CAB.top + 0.03, 1.95), materials.darkSteel);
  parts.addFromNose(new THREE.CylinderGeometry(0.005, 0.009, 1.3, 5).translate(0, 0.65, 0).rotateX(0.12).translate(0.85, CAB.top + 0.05, 1.95), materials.darkSteel);
}

function buildMirrorsAndWipers(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  for (const side of SIDES) {
    // Mirror on a straight arm and a diagonal brace off the corner pillar.
    parts.box(materials.darkSteel, 0.32, 2.22, 0.36, 0.024, 0.024, side * (CAB.halfWidth + 0.17));
    parts.box(materials.darkSteel, 0.34, 1.98, 0.46, 0.02, 0.02, side * (CAB.halfWidth + 0.15), 0, 0, side * 0.86);
    parts.box(materials.darkSteel, 0.32, 2.12, 0.05, 0.34, 0.2, side * (CAB.halfWidth + 0.37));
    parts.box(materials.glass, 0.426, 2.12, 0.04, 0.3, 0.012, side * (CAB.halfWidth + 0.37));
    // Wiper hung from the header: arm and blade lying on the glass.
    for (const [material, along] of [[materials.darkSteel, 0.012], [materials.rubber, -0.012]] as const) {
      const blade = new THREE.BoxGeometry(0.02, 0.4, 0.01)
        .translate(along, -0.2, 0)
        .rotateZ(side * 0.32)
        .rotateX(SCREEN_RAKE)
        .translate(side * 0.58, CAB.screenTop.y - 0.02, CAB.screenTop.fromNose - 0.014);
      parts.addFromNose(blade, material);
    }
  }
}

/** Checker-plate floor, the padded engine cover between the seats, pedals and the gear and transfer levers. */
function buildCabFloor(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  parts.box(materials.darkSteel, (0.35 + CAB.back) / 2, CAB.floor, CAB.halfWidth * 2 - 0.08, 0.02, CAB.back - 0.37);
  parts.box(materials.cabin, 1.05, (CAB.floor + 1.75) / 2, 0.64, 1.75 - CAB.floor, 1.2);
  parts.box(materials.rubber, 1.05, 1.77, 0.6, 0.04, 1.12);
  for (const dx of [-0.16, 0, 0.16]) {
    parts.box(materials.rubber, 0.5, CAB.floor + 0.1, 0.07, 0.11, 0.025, -CAB.seatX + dx, -0.5);
  }
  const lever = (x: number, fromNose: number, length: number, lean: number): void => {
    parts.addFromNose(new THREE.CylinderGeometry(0.009, 0.012, length, 6).translate(0, length / 2, 0).rotateX(lean).translate(x, 1.77, fromNose), materials.darkSteel);
    parts.addFromNose(new THREE.SphereGeometry(0.028, 6, 4).translate(0, length, 0).rotateX(lean).translate(x, 1.77, fromNose), materials.rubber);
  };
  lever(-0.22, 0.95, 0.42, -0.25);
  lever(-0.12, 1.1, 0.3, -0.1);
}

/** The dashboard and the gauges, toggles and glovebox on its tilted face. */
function buildDashboard(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  const width = CAB.halfWidth * 2 - 0.08;
  parts.box(materials.cabin, 0.42, 1.9, width, 0.1, 0.26);
  parts.box(materials.cabin, DASH_FACE.fromNose, DASH_FACE.y, width, 0.2, 0.03, 0, DASH_TILT);
  parts.box(materials.rubber, DASH_FACE.fromNose - 0.02, DASH_FACE.y + 0.01, 0.64, 0.24, 0.08, -CAB.seatX, DASH_TILT);
  const gauge = (dx: number, du: number, radius: number, reading: number): void => {
    parts.addFromNose(onDash(new THREE.CircleGeometry(radius, 20), -CAB.seatX + dx, du, 0.025), materials.gaugeFace);
    parts.addFromNose(onDash(new THREE.TorusGeometry(radius, 0.007, 3, 12), -CAB.seatX + dx, du, 0.027), materials.darkSteel);
    const needle = new THREE.BoxGeometry(0.005, radius * 0.8, 0.002).translate(0, radius * 0.4, 0).rotateZ(reading);
    parts.addFromNose(onDash(needle, -CAB.seatX + dx, du, 0.028), materials.redEnamel);
  };
  gauge(0, 0, 0.075, 1.9);
  gauge(-0.18, 0.05, 0.038, 0.6);
  gauge(-0.18, -0.05, 0.038, -0.4);
  gauge(0.18, 0.05, 0.038, 1.1);
  gauge(0.18, -0.05, 0.038, -1.2);
  // Toggle switches in a row towards the middle, the glovebox before the passenger.
  for (let toggle = 0; toggle < 6; toggle++) {
    const x = -0.22 + toggle * 0.05;
    parts.addFromNose(onDash(new THREE.CylinderGeometry(0.005, 0.006, 0.035, 5).rotateX(Math.PI / 2 + (toggle % 2 ? 0.3 : -0.3)), x, -0.03, 0.03), materials.darkSteel);
    parts.addFromNose(onDash(new THREE.BoxGeometry(0.03, 0.03, 0.006), x, -0.03, 0.017), materials.darkSteel);
  }
  parts.addFromNose(onDash(new THREE.BoxGeometry(0.42, 0.13, 0.012), CAB.seatX, 0, 0.018), materials.cabin);
  parts.addFromNose(onDash(new THREE.BoxGeometry(0.08, 0.015, 0.02), CAB.seatX, 0.03, 0.028), materials.darkSteel);
}

/** Geometry modelled facing +z at the origin, laid on the dash face at `x`, `up` along it and `lift` off it. */
function onDash(geometry: THREE.BufferGeometry, x: number, up: number, lift: number): THREE.BufferGeometry {
  const sin = Math.sin(DASH_TILT);
  const cos = Math.cos(DASH_TILT);
  // The face's up direction is (0, cos, sin) and its normal (0, -sin, cos).
  return geometry.rotateX(DASH_TILT).translate(
    x,
    DASH_FACE.y + up * cos - lift * sin,
    DASH_FACE.fromNose + up * sin + lift * cos,
  );
}

/** A big thin-rimmed wheel with three spokes, its hub and the column down through the floor. */
function buildSteering(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  const place = (geometry: THREE.BufferGeometry): THREE.BufferGeometry =>
    geometry.rotateX(WHEEL_TILT).translate(WHEEL_HUB.x, WHEEL_HUB.y, WHEEL_HUB.fromNose);
  parts.addFromNose(place(new THREE.TorusGeometry(WHEEL_RIM, 0.017, 5, 22)), materials.rubber);
  for (const angle of [0, Math.PI, -Math.PI / 2]) {
    parts.addFromNose(place(new THREE.BoxGeometry(WHEEL_RIM, 0.024, 0.01).translate(WHEEL_RIM / 2, 0, 0).rotateZ(angle)), materials.rubber);
  }
  // Hub and column run along the wheel's axis, which a cylinder's own axis (y) reaches a quarter turn on.
  parts.addFromNose(place(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 10).rotateX(Math.PI / 2)), materials.rubber);
  parts.addFromNose(place(new THREE.CylinderGeometry(0.03, 0.036, 0.62, 8).translate(0, -0.34, 0).rotateX(Math.PI / 2)), materials.darkSteel);
}

/** Driver's and passenger's seats: steel frame, cushion with a rolled front, a tilted back with stitched rolls. */
function buildSeats(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  const backLean = 0.16;
  for (const side of SIDES) {
    const x = side * CAB.seatX;
    parts.box(materials.darkSteel, 1.8, CAB.floor + 0.13, 0.46, 0.24, 0.42, x);
    parts.box(materials.rubber, 1.78, 1.55, 0.52, 0.12, 0.48, x);
    parts.addFromNose(new THREE.CylinderGeometry(0.06, 0.06, 0.52, 10).rotateZ(Math.PI / 2).translate(x, 1.55, 1.55), materials.rubber);
    parts.box(materials.rubber, 2.1, 1.9, 0.52, 0.58, 0.1, x, backLean);
    for (const y of [1.74, 1.9, 2.06]) parts.box(materials.rubber, 2.04 + (y - 1.9) * backLean, y, 0.48, 0.03, 0.02, x, backLean);
  }
}

/** Roof liner, door cards with their pulls and openers, the lining under the back window, sun visors. */
function buildTrim(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  parts.box(materials.cabin, ROOF_MIDDLE, CAB.top - 0.05, CAB.halfWidth * 2 - 0.12, 0.015, ROOF_DEPTH - 0.04);
  parts.box(materials.cabin, CAB.back - 0.03, (CAB.floor + CAB.belt) / 2, CAB.halfWidth * 2 - 0.1, CAB.belt - CAB.floor, 0.012);
  const { door } = CAB;
  for (const side of SIDES) {
    const card = side * (CAB.halfWidth - 0.055);
    parts.box(materials.cabin, (door.from + door.to) / 2, (door.bottom + CAB.belt) / 2 + 0.02, 0.03, CAB.belt - door.bottom - 0.04, door.to - door.from - 0.06, card);
    parts.box(materials.rubber, 1.2, 1.8, 0.04, 0.04, 0.3, card - side * 0.03);
    parts.box(materials.darkSteel, door.from + 0.16, 1.76, 0.02, 0.02, 0.1, card - side * 0.025);
    parts.addFromNose(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 8).rotateZ(Math.PI / 2).translate(card - side * 0.025, 1.6, 0.85), materials.darkSteel);
    parts.box(materials.darkSteel, 0.85, 1.56, 0.012, 0.09, 0.015, card - side * 0.04);
    parts.box(materials.cabin, ROOF_FRONT + 0.1, CAB.top - 0.1, 0.5, 0.015, 0.2, side * 0.55, -0.4);
  }
}

/** The R-123 set on the engine cover and its cables, a helmet, a map case, a first-aid box and an extinguisher. */
function buildCrewKit(parts: TruckPartBatch, materials: EscapeTruckMaterials): void {
  const radio = { x: 0, y: 1.93, fromNose: 1.42 } as const;
  parts.box(materials.paint, radio.fromNose, radio.y, 0.42, 0.28, 0.26, radio.x);
  parts.box(materials.rubber, radio.fromNose + 0.135, radio.y, 0.38, 0.24, 0.012, radio.x);
  for (const [dx, dy] of [[-0.12, 0.05], [0, 0.05], [0.12, 0.05], [-0.08, -0.06], [0.08, -0.06]] as const) {
    parts.addFromNose(new THREE.CylinderGeometry(0.018, 0.018, 0.025, 8).rotateX(Math.PI / 2).translate(radio.x + dx, radio.y + dy, radio.fromNose + 0.15), materials.darkSteel);
  }
  parts.box(materials.rubber, radio.fromNose - 0.02, radio.y + 0.16, 0.2, 0.04, 0.06, radio.x);
  const cable = (points: ReadonlyArray<readonly [number, number, number]>, radius: number): void => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
    parts.addFromNose(new THREE.TubeGeometry(curve, 10, radius, 4), materials.rubber);
  };
  cable([[0.1, 2.07, 1.38], [0.18, 2.36, 1.48], [0.55, 2.45, 1.72], [0.85, 2.47, 1.92]], 0.008);
  cable([[-0.18, 2.0, 1.32], [-0.3, 1.82, 1.1], [-0.36, 1.78, 0.7], [-0.4, 1.84, 0.55]], 0.007);
  cable([[-CAB.halfWidth + 0.08, 2.45, 0.38], [-CAB.halfWidth + 0.07, 2.2, 0.3], [-CAB.halfWidth + 0.09, 1.92, 0.45]], 0.006);
  // Helmet on the passenger seat, map case on the dash, first-aid box under the back window, extinguisher by the door.
  parts.addFromNose(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(CAB.seatX - 0.08, 1.61, 1.75), materials.paint);
  parts.addFromNose(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 14).translate(CAB.seatX - 0.08, 1.615, 1.75), materials.paint);
  parts.box(materials.rubber, 0.42, 1.965, 0.32, 0.03, 0.2, CAB.seatX - 0.05, 0, 0.15);
  parts.box(materials.snow, CAB.back - 0.08, 1.75, 0.3, 0.2, 0.08, 0);
  parts.box(materials.redEnamel, CAB.back - 0.125, 1.75, 0.12, 0.035, 0.01, 0);
  parts.box(materials.redEnamel, CAB.back - 0.125, 1.75, 0.035, 0.12, 0.01, 0);
  parts.addFromNose(new THREE.CylinderGeometry(0.05, 0.05, 0.32, 10).translate(CAB.halfWidth - 0.16, CAB.floor + 0.17, CAB.back - 0.12), materials.redEnamel);
  parts.addFromNose(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 6).translate(CAB.halfWidth - 0.16, CAB.floor + 0.36, CAB.back - 0.12), materials.darkSteel);
}
