import * as THREE from 'three';
import { seededRandom } from '../shared/ProceduralNoise';
import { ESCALATOR_PORTAL, STATION33_WALL_THICKNESS, VESTIBULE } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

const PORTAL_HALF = ESCALATOR_PORTAL.width / 2;
const WALL_BACK_Z = VESTIBULE.minZ - STATION33_WALL_THICKNESS;
/** Upper landing between the wall and the first moving step. */
const LANDING_END_Z = WALL_BACK_Z - 2;
/** Slope of the shaft; boxes along it turn by -INCLINE about X so their hall end rises. */
const INCLINE = Math.PI / 6;
const STEP_RISE = 0.2;
const STEP_RUN = STEP_RISE / Math.tan(INCLINE);
const VISIBLE_STEPS = 14;
/** Four escalators separated by balustrades, like the deep Soviet stations. */
const LANE_XS = [-2.1, -0.7, 0.7, 2.1] as const;
const LANE_WIDTH = 1.0;
const BALUSTRADE_XS = [-2.8, -1.4, 0, 1.4, 2.8] as const;
const BALUSTRADE_WIDTH = 0.36;

/**
 * Phase 1 frontier at the north end of the vestibule: the top of the dead
 * escalators, seen through a locked scissor gate and buried a few metres
 * down by a collapse. Only the gate is solid; phase 3 replaces this builder
 * with an open, walkable escalator.
 */
export function buildEscalatorHead(context: Station33BuildContext, lighting: Station33Lighting): void {
  addGate(context);
  addLanding(context);
  addEscalators(context, lighting);
  addTunnel(context);
  addCollapse(context);
}

/** Solid proxy filling the portal, plus the visible lattice, rails, chain and sign. */
function addGate(context: Station33BuildContext): void {
  const { batch, materials, structure, signage, group } = context;
  const z = VESTIBULE.minZ - STATION33_WALL_THICKNESS / 2;
  structure.addBox(ESCALATOR_PORTAL.centerX, ESCALATOR_PORTAL.height / 2, z, ESCALATOR_PORTAL.width, ESCALATOR_PORTAL.height, STATION33_WALL_THICKNESS, materials.collider, {
    name: 'escalator-gate', surface: 'metal', mapRole: 'sealed-frontier', castShadow: false, uvSeed: 0, blocksPlayer: true,
    stainFaces: 'none',
  });
  const latticeZ = VESTIBULE.minZ - 0.08;
  const bars = 34;
  const spacing = ESCALATOR_PORTAL.width / bars;
  for (let index = 0; index <= bars; index++) {
    batch.addBox(materials.paintedSteel, -PORTAL_HALF + index * spacing, 1.45, latticeZ, 0.035, 2.8, 0.035);
  }
  const diagonal = Math.hypot(spacing, 0.7);
  const angle = Math.atan2(0.7, spacing);
  for (let index = 0; index < bars; index++) {
    const x = -PORTAL_HALF + (index + 0.5) * spacing;
    for (let tier = 0; tier < 4; tier++) {
      const y = 0.4 + tier * 0.7;
      batch.addBox(materials.paintedSteel, x, y, latticeZ - 0.02, diagonal, 0.022, 0.02, 0, 0, angle);
      batch.addBox(materials.paintedSteel, x, y, latticeZ - 0.02, diagonal, 0.022, 0.02, 0, 0, -angle);
    }
  }
  batch.addBox(materials.greySteel, 0, 2.92, latticeZ, ESCALATOR_PORTAL.width, 0.12, 0.12);
  batch.addBox(materials.greySteel, 0, 0.03, latticeZ, ESCALATOR_PORTAL.width, 0.06, 0.1);
  // Chain wrapped through the lattice and a padlock at the meeting stiles.
  const chain = new THREE.TorusGeometry(0.035, 0.009, 4, 8);
  for (let link = 0; link < 9; link++) {
    const piece = chain.clone();
    piece.rotateY(link % 2 === 0 ? 0 : Math.PI / 2);
    piece.translate(-0.24 + link * 0.06, 1.18 - Math.sin(link / 8 * Math.PI) * 0.05, VESTIBULE.minZ - 0.02);
    batch.add(piece, materials.greySteel);
  }
  chain.dispose();
  batch.addBox(materials.bronze, 0.02, 1.02, VESTIBULE.minZ - 0.01, 0.1, 0.12, 0.05);
  const sign = new THREE.Mesh(signage.signGeometry('no-entry', 0.9, 0.45), signage.material);
  sign.position.set(-1.6, 1.55, VESTIBULE.minZ + 0.01);
  sign.rotation.z = 0.06;
  sign.userData.mapRole = 'sign';
  group.add(sign);
}

function addLanding(context: Station33BuildContext): void {
  const { batch, materials, signage, group } = context;
  const length = WALL_BACK_Z - LANDING_END_Z;
  const centerZ = (WALL_BACK_Z + LANDING_END_Z) / 2;
  batch.addBox(materials.floorGranite, 0, -0.08, centerZ, ESCALATOR_PORTAL.width, 0.16, length + 0.3);
  batch.addBox(materials.vaultPlaster, 0, ESCALATOR_PORTAL.height + 0.08, centerZ, ESCALATOR_PORTAL.width, 0.16, length + 0.3);
  for (const side of [-1, 1]) {
    batch.addBox(materials.wallMarble, side * (PORTAL_HALF + 0.15), ESCALATOR_PORTAL.height / 2, centerZ, 0.3, ESCALATOR_PORTAL.height, length + 0.3);
  }
  for (const x of LANE_XS) {
    batch.addBox(materials.bronze, x, 0.01, LANDING_END_Z + 0.12, LANE_WIDTH, 0.03, 0.22);
    batch.addBox(materials.greySteel, x, 0.005, LANDING_END_Z + 0.75, LANE_WIDTH, 0.01, 1.0);
  }
  const sign = new THREE.Mesh(signage.signGeometry('do-not-run', 0.34, 0.17), signage.material);
  sign.position.set(0, 1.0, LANDING_END_Z + 0.06);
  sign.userData.mapRole = 'sign';
  group.add(sign);
}

/** Point on the incline `distance` metres down from the landing edge, at a height above the steps' nosing line. */
function inclinePoint(distance: number, height: number): { y: number; z: number } {
  return {
    y: -Math.sin(INCLINE) * distance + height / Math.cos(INCLINE),
    z: LANDING_END_Z - Math.cos(INCLINE) * distance,
  };
}

function addEscalators(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  for (const x of LANE_XS) {
    for (let step = 0; step < VISIBLE_STEPS; step++) {
      const top = -step * STEP_RISE;
      const z = LANDING_END_Z - step * STEP_RUN - STEP_RUN / 2;
      // Each tread is a block down to the next tread so no gaps show from above.
      batch.addBox(materials.greySteel, x, top - STEP_RISE / 2, z, LANE_WIDTH, STEP_RISE, STEP_RUN);
    }
  }
  const length = VISIBLE_STEPS * STEP_RUN / Math.cos(INCLINE);
  const middle = inclinePoint(length / 2, 0);
  for (const x of BALUSTRADE_XS) {
    const outer = Math.abs(x) > 2;
    batch.addBox(outer ? materials.wallMarble : materials.varnishedWood, x, middle.y + 0.45, middle.z, BALUSTRADE_WIDTH, 0.9, length, -INCLINE);
    for (const side of [-1, 1]) {
      if (outer && Math.sign(x) === side) continue;
      batch.addBox(materials.rubber, x + side * (BALUSTRADE_WIDTH / 2 - 0.04), middle.y + 0.95, middle.z, 0.08, 0.1, length, -INCLINE);
    }
    if (outer) continue;
    // Torch lamps on the inner balustrades; some heads were smashed off.
    for (let post = 0; post < 4; post++) {
      const base = inclinePoint(0.6 + post * 1.6, 0.9);
      batch.addBox(materials.bronze, x, base.y + 0.3, base.z, 0.06, 0.6, 0.06);
      const broken = (post + Math.round(x * 10)) % 3 === 0;
      if (broken) continue;
      const head = new THREE.CylinderGeometry(0.09, 0.05, 0.22, 10);
      head.translate(x, base.y + 0.71, base.z);
      batch.add(head, lighting.circuitMaterial(post % 2 === 0 ? 'amber' : 'failing'));
    }
  }
}

/** The inclined shaft: side walls and a ceiling running down parallel to the steps. */
function addTunnel(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const length = VISIBLE_STEPS * STEP_RUN / Math.cos(INCLINE) + 1;
  const ceiling = inclinePoint(length / 2, ESCALATOR_PORTAL.height + 0.1);
  batch.addBox(materials.vaultPlaster, 0, ceiling.y, ceiling.z, ESCALATOR_PORTAL.width + 0.6, 0.2, length, -INCLINE);
  const wall = inclinePoint(length / 2, ESCALATOR_PORTAL.height / 2 - 0.6);
  for (const side of [-1, 1]) {
    batch.addBox(materials.serviceConcrete, side * (PORTAL_HALF + 0.15), wall.y, wall.z, 0.3, ESCALATOR_PORTAL.height + 2.5, length, -INCLINE);
  }
}

/** Ceiling slabs and spoil filling the shaft a few metres down. */
function addCollapse(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const random = seededRandom(3359);
  const front = inclinePoint(4.2, 0);
  for (let index = 0; index < 5; index++) {
    batch.addBox(
      materials.vaultPlaster,
      (random() - 0.5) * 4.5,
      front.y + 0.6 + random() * 1.6,
      front.z - 0.8 - random() * 1.6,
      1.6 + random() * 1.6, 0.22, 1.2 + random(),
      0.4 + random() * 0.6, random() * 0.5, (random() - 0.5) * 0.9,
    );
  }
  for (let index = 0; index < 34; index++) {
    const size = 0.3 + random() * 0.7;
    const depth = random() * 3.5;
    const point = inclinePoint(4.2 + depth, 0);
    batch.addBox(
      materials.rubble,
      (random() - 0.5) * ESCALATOR_PORTAL.width,
      point.y + size * 0.4 + random() * (1.2 + depth * 0.5),
      point.z,
      size, size * 0.8, size,
      random() * Math.PI, random() * Math.PI, random() * Math.PI,
    );
  }
  // A dark backstop so nothing past the spoil ever reads as open space.
  const back = inclinePoint(9, 0);
  batch.addBox(materials.serviceConcrete, 0, back.y + 1.5, back.z, ESCALATOR_PORTAL.width + 0.6, 6, 0.3);
}
