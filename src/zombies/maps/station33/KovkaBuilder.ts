import * as THREE from 'three';
import { POINT_DOOR_SIZE } from '../../doors/PointDoor';
import type { MapPower } from '../shared/MapPower';
import { UpgradeMachine, type UpgradeMachineLook } from '../shared/UpgradeMachine';
import {
  KOVKA, KOVKA_CORE_COLOR, KOVKA_REACTOR, KOVKA_UPGRADE_MACHINE, KOVKA_UPGRADE_SITE, KOVKA_WEAPON_FINISH, STATION33_DOORS, STATION33_MAINS,
  STATION33_WALL_THICKNESS, STATION33_WEAPONS,
} from '../Station33Config';
import { buildKovkaDressing } from './KovkaDressing';
import { createKovkaMaterials } from './KovkaMaterials';
import { buildKovkaReactor } from './KovkaReactor';
import { buildKovkaShell } from './KovkaShell';
import { buildKovkaWalkways } from './KovkaWalkways';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

const HATCH = STATION33_DOORS.find((door) => door.zone === 'kovka')!;

/**
 * The KOVKA chamber west of the escalator, reached through a corridor from
 * its hatch in the machine room's west wall: the great vault, the deck
 * round the reactor's pit with its rails, catwalks and pipes, the reactor,
 * the forge before it (the shared upgrade machine in the station's dress,
 * returned for the arena to run) and the set dressing.
 */
export function buildKovka(context: Station33BuildContext, lighting: Station33Lighting, power: MapPower): UpgradeMachine {
  const kovka = createKovkaMaterials(context.materials);
  buildKovkaShell(context, kovka);
  buildKovkaWalkways(context, kovka);
  buildKovkaReactor(context, kovka, lighting);
  addHatchSurround(context);
  addUpgradeSite(context);
  buildKovkaDressing(context, kovka, lighting);
  const look: UpgradeMachineLook = {
    materials: { ...context.materials, copper: kovka.copper },
    plate: { geometry: context.signage.signGeometry('kovka', 0.6, 0.3), material: context.signage.material },
    glowColor: KOVKA_CORE_COLOR,
    mainsGlowBoost: STATION33_MAINS.machineGlowBoost,
    finish: KOVKA_WEAPON_FINISH,
    weapons: STATION33_WEAPONS,
  };
  return new UpgradeMachine(context, KOVKA_UPGRADE_MACHINE, look, power);
}

/**
 * Hazard-striped jambs on both faces of the hatch (the machine-room side
 * keeps room for its plate) and a lintel on the corridor side. The door
 * itself is the station's shared paid door.
 */
function addHatchSurround(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { width, height } = POINT_DOOR_SIZE;
  const jamb = width / 2 + 0.18;
  // Along the wall, and box sizes across / along it, whichever axis the wall runs on.
  const alongX = -HATCH.outwardZ;
  const alongZ = HATCH.outwardX;
  const size = (across: number, along: number): { x: number; z: number } =>
    HATCH.outwardX !== 0 ? { x: across, z: along } : { x: along, z: across };
  for (const [side, lintel] of [[-1, false], [1, true]] as const) {
    const out = side * (STATION33_WALL_THICKNESS / 2 + 0.08);
    const x = HATCH.x + HATCH.outwardX * out;
    const z = HATCH.z + HATCH.outwardZ * out;
    const jambSize = size(0.06, 0.16);
    for (const end of [-1, 1]) {
      batch.addBox(materials.hazardPaint, x + alongX * end * jamb, (height + 0.26) / 2, z + alongZ * end * jamb, jambSize.x, height + 0.26, jambSize.z);
    }
    if (lintel) {
      const lintelSize = size(0.06, jamb * 2 + 0.16);
      batch.addBox(materials.hazardPaint, x, height + 0.21, z, lintelSize.x, 0.16, lintelSize.z);
    }
  }
}

/**
 * The upgrade machine's place, kept clear and walkable: a steel base plate
 * on the reactor's axis framed in hazard paint, with a junction box at its
 * back and a feeder cable from the reactor's face over the rail to it.
 */
function addUpgradeSite(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z, width, depth } = KOVKA_UPGRADE_SITE;
  const back = z - depth / 2;
  batch.addBox(materials.checkerPlate, x, 0.015, z, width, 0.03, depth);
  const border = 0.1;
  batch.addBox(materials.hazardPaint, x, 0.006, back - border / 2, width + 2 * border, 0.012, border);
  batch.addBox(materials.hazardPaint, x, 0.006, z + depth / 2 + border / 2, width + 2 * border, 0.012, border);
  for (const side of [-1, 1]) {
    batch.addBox(materials.hazardPaint, x + side * (width / 2 + border / 2), 0.006, z, border, 0.012, depth);
    for (const end of [-1, 1]) {
      batch.add(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 6).translate(x + side * (width / 2 - 0.12), 0.055, z + end * (depth / 2 - 0.12)), materials.greySteel);
    }
  }
  const boxX = x + width / 2 - 0.35;
  batch.addBox(materials.greySteel, boxX, 0.18, back + 0.15, 0.42, 0.3, 0.2);
  const railTop = 1.05;
  const feeder = new THREE.CatmullRomCurve3([
    new THREE.Vector3(boxX - 0.2, KOVKA_REACTOR.axisY - 2.6, KOVKA_REACTOR.frontZ + 0.1),
    new THREE.Vector3(boxX - 0.1, railTop - 0.2, KOVKA.pit.maxZ - 0.25),
    new THREE.Vector3(boxX, railTop + 0.08, KOVKA.pit.maxZ + 0.06),
    new THREE.Vector3(boxX, 0.4, back - 0.02),
    new THREE.Vector3(boxX, 0.2, back + 0.06),
  ]);
  batch.add(new THREE.TubeGeometry(feeder, 20, 0.05, 6), materials.rubber);
}
