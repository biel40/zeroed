import * as THREE from 'three';
import {
  CATACOMB_FLOOR,
  CATACOMB_FLOOR_Y,
  PANTHEON,
  PANTHEON_CRACK,
  PANTHEON_PIER,
  PANTHEON_PIERS,
  ROYAL_TOMB,
  ROYAL_TOMBS,
  pantheonBayCenter,
  pantheonBayLines,
  type RoyalTomb,
} from '../../DieKathedraleCatacombsConfig';
import { DIE_KATHEDRALE_DOORS, DIE_KATHEDRALE_ENTRANCES, DIE_KATHEDRALE_LIGHT_SITES, siteFloor } from '../../DieKathedraleConfig';
import { seededRandom } from '../../shared/ProceduralNoise';
import { addSolidProxy } from '../../shared/SolidProxy';
import { placement } from '../../shared/StaticMeshBatch';
import { cobwebGeometry } from '../CobwebTexture';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { archPoints, ribGeometries } from '../GothicVault';
import { addCandleCluster, addFloorStain, addHangingRoot, addRubble, addWallStain, addWallTorch } from './CatacombDecor';
import { addEffigy } from './RoyalEffigy';
import { slidingLidShift } from './TombLids';

const FLOOR = CATACOMB_FLOOR_Y;
const CROWN = { radius: 1.5, drop: 1.2 } as const;
const SHIELD = { width: 0.72, height: 0.92, y: 2.55 } as const;

/**
 * The royal pantheon: four clustered piers carrying three by three bays of
 * rib vault, half-piers along the walls, and in the four side bays the
 * tombs of the kings, each with its own effigy; the east one stands open
 * and empty below a crack in the wall. Heraldic shields with the pales of
 * the old crown hang between the bays, a crown of candles over the empty
 * central bay, tall candlesticks and votives at two tombs and a torch by the
 * reliquary gate. The west tomb stays dark. The floor darkens under every
 * tomb and pier, a baked contact shadow where no light casts one. A lid the
 * dead push aside is not built here but by `TombLids`, over a dark inside.
 */
export function buildRoyalPantheon(context: DieKathedraleBuildContext): void {
  const random = seededRandom(7301);
  addPiers(context);
  addWallResponds(context);
  for (const tomb of ROYAL_TOMBS) addTomb(context, tomb, random);
  addShields(context, random);
  addCrack(context, random);
  addCandleCrown(context, random);
  addTombCandlesticks(context, random);
  addDecay(context, random);
  addTombVotives(context, random);
  addReliquaryTorch(context);
  addContactShadows(context);
}

/** A square core with a round shaft on each face, on a moulded base under a band of capital. */
function addPiers(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const { halfWidth, shaftRadius } = PANTHEON_PIER;
  const spring = PANTHEON.springY;
  for (const [index, pier] of PANTHEON_PIERS.entries()) {
    batch.addBox(materials.dressedStone, pier.x, FLOOR + 0.18, pier.z, halfWidth * 2, 0.36, halfWidth * 2, 0, 0, 0, index);
    batch.addBox(materials.cryptStone, pier.x, FLOOR + spring / 2, pier.z, 0.9, spring, 0.9, 0, 0, 0, index + 4);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const shaft = new THREE.CylinderGeometry(shaftRadius, shaftRadius, spring - 0.36, 10);
      batch.add(shaft.translate(pier.x + dx * 0.45, FLOOR + 0.36 + (spring - 0.36) / 2, pier.z + dz * 0.45), materials.dressedStone);
    }
    batch.addBox(materials.dressedStone, pier.x, FLOOR + spring - 0.15, pier.z, halfWidth * 2 + 0.1, 0.3, halfWidth * 2 + 0.1, 0, 0, 0, index + 8);
    addSolidProxy(context, `pantheon-pier-${index}`, { x: pier.x - halfWidth, y: FLOOR, z: pier.z - halfWidth }, { x: pier.x + halfWidth, y: FLOOR + spring, z: pier.z + halfWidth }, 'concrete', 'none');
  }
}

/** Half-piers where the bay lines meet the walls, too shallow to stop anyone; none crowds a gate or a door. */
function addWallResponds(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const spring = PANTHEON.springY;
  const openings = [...DIE_KATHEDRALE_DOORS, ...DIE_KATHEDRALE_ENTRANCES].filter((site) => siteFloor(site) === CATACOMB_FLOOR);
  const clear = (x: number, z: number): boolean => openings.every((site) => Math.hypot(site.x - x, site.z - z) > 1.6);
  for (const x of pantheonBayLines('x').slice(1, -1)) {
    for (const [z, facing] of [[PANTHEON.maxZ, -1], [PANTHEON.minZ, 1]] as const) {
      if (!clear(x, z)) continue;
      batch.addBox(materials.dressedStone, x, FLOOR + spring / 2, z + facing * 0.11, 0.62, spring, 0.22, 0, 0, 0, Math.round(x));
    }
  }
  for (const z of pantheonBayLines('z').slice(1, -1)) {
    for (const [x, facing] of [[PANTHEON.minX, 1], [PANTHEON.maxX, -1]] as const) {
      if (!clear(x, z)) continue;
      batch.addBox(materials.dressedStone, x + facing * 0.11, FLOOR + spring / 2, z, 0.22, spring, 0.62, 0, 0, 0, Math.round(z));
    }
  }
}

/** Plinth, chest with a blind arcade on its long sides, lid and effigy; the empty one open with its lid shoved off. */
function addTomb(context: DieKathedraleBuildContext, tomb: RoyalTomb, random: () => number): void {
  const { batch, materials } = context;
  const { width, length, chestHeight, lidHeight, plinthHeight } = ROYAL_TOMB;
  const { x, z } = tomb;
  batch.addBox(materials.dressedStone, x, FLOOR + plinthHeight / 2, z, width + 0.34, plinthHeight, length + 0.34, 0, 0, 0, 1);
  const chestTop = plinthHeight + chestHeight;
  batch.addBox(materials.effigyMarble, x, FLOOR + plinthHeight + chestHeight / 2, z, width, chestHeight, length);
  addArcade(context, tomb);
  // A worn inscription runs round the chest under the lid.
  for (const side of [-1, 1]) {
    batch.addBox(materials.cavity, x + side * (width / 2 + 0.003), FLOOR + chestTop - 0.09, z, 0.01, 0.03, length * 0.86);
  }
  const lidTop = chestTop + lidHeight;
  if (tomb.effigy === 'empty') {
    addOpenedTomb(context, tomb, random);
    return;
  }
  batch.addBox(materials.dressedStone, x, FLOOR + chestTop + 0.01, z, width + 0.16, 0.05, length + 0.16);
  if (slidingLidShift(tomb.id) === null) {
    batch.addBox(materials.effigyMarble, x, FLOOR + chestTop + lidHeight / 2, z, width + 0.1, lidHeight, length + 0.1);
    addEffigy(context, tomb.effigy, placement(x, FLOOR + lidTop, z).clone());
  } else {
    // The dark inside, on the band under the lid: hidden by the lid until it grinds aside.
    batch.addBox(materials.cavity, x, FLOOR + chestTop + 0.04, z, width - 0.16, 0.01, length - 0.16);
  }
  addSolidProxy(context, tomb.id, { x: x - width / 2 - 0.17, y: FLOOR, z: z - length / 2 - 0.17 }, { x: x + width / 2 + 0.17, y: FLOOR + lidTop, z: z + length / 2 + 0.17 }, 'concrete', 'top');
}

/** Small pointed arches carved along both long sides of a chest, each over a mourner's niche. */
function addArcade(context: DieKathedraleBuildContext, tomb: RoyalTomb): void {
  const { batch, materials } = context;
  const { width, length, chestHeight, plinthHeight } = ROYAL_TOMB;
  const arches = 5;
  const span = length / arches;
  for (const side of [-1, 1]) {
    const faceX = tomb.x + side * (width / 2 + 0.015);
    for (let arch = 0; arch < arches; arch++) {
      const from = tomb.z - length / 2 + arch * span + 0.06;
      const to = from + span - 0.12;
      batch.addBox(materials.cavity, faceX - side * 0.008, FLOOR + plinthHeight + chestHeight * 0.42, (from + to) / 2, 0.012, chestHeight * 0.5, span - 0.24);
      const head = archPoints(faceX, from, faceX, to, FLOOR + plinthHeight + chestHeight * 0.66, 0.16, 4);
      for (const geometry of ribGeometries(head, 0.03, 0.04)) batch.add(geometry, materials.dressedStone);
    }
  }
}

/** Nobody lies here: the lid slid off and leans broken against the chest, the effigy's crowned head lies on the floor. */
function addOpenedTomb(context: DieKathedraleBuildContext, tomb: RoyalTomb, random: () => number): void {
  const { batch, materials } = context;
  const { width, length, chestHeight, lidHeight, plinthHeight } = ROYAL_TOMB;
  const chestTop = plinthHeight + chestHeight;
  // The dark inside, under a thin rim: nothing lies in it.
  batch.addBox(materials.cavity, tomb.x, FLOOR + chestTop - 0.005, tomb.z, width - 0.16, 0.012, length - 0.16);
  // The lid was pushed off towards the cracked wall and leans there against the chest, broken across.
  const lean = Math.atan2(chestTop, 0.95);
  const lidX = tomb.x + width / 2 + 0.3;
  for (const [half, offset] of [[-1, -0.04], [1, 0.05]] as const) {
    const pieceLength = length / 2 - 0.03;
    batch.add(
      new THREE.BoxGeometry(width + 0.1, lidHeight, pieceLength),
      materials.effigyMarble,
      placement(lidX, FLOOR + chestTop / 2, tomb.z + half * (pieceLength / 2 + 0.03) + offset, 0, 0, -lean + half * 0.03),
    );
  }
  // All that is left of its effigy: the crowned head, broken off and lying on the floor.
  const headX = tomb.x - width / 2 - 0.45;
  const headZ = tomb.z - length / 2 + 0.2;
  batch.add(new THREE.SphereGeometry(0.12, 9, 7).scale(0.95, 0.85, 1.1).translate(headX, FLOOR + 0.11, headZ), materials.effigyMarble);
  batch.add(new THREE.CylinderGeometry(0.125, 0.12, 0.07, 12, 1, true).rotateZ(1.2).translate(headX + 0.03, FLOOR + 0.15, headZ), materials.effigyMarble);
  addRubble(batch, materials, tomb.x - width / 2 - 0.5, FLOOR, tomb.z + 0.6, 8, 1, random);
  addSolidProxy(
    context, tomb.id,
    { x: tomb.x - width / 2 - 0.17, y: FLOOR, z: tomb.z - length / 2 - 0.17 },
    { x: lidX + 0.55, y: FLOOR + chestTop, z: tomb.z + length / 2 + 0.17 },
    'concrete', 'none',
  );
}

/** A heater shield in stone, its field gilt and the four red pales of the old crown, some chipped and faded. */
function addShields(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  const shape = new THREE.Shape();
  const { width, height } = SHIELD;
  shape.moveTo(-width / 2, height / 2);
  shape.lineTo(width / 2, height / 2);
  shape.lineTo(width / 2, 0);
  shape.quadraticCurveTo(width / 2, -height * 0.3, 0, -height / 2);
  shape.quadraticCurveTo(-width / 2, -height * 0.3, -width / 2, 0);
  shape.closePath();
  const places: ReadonlyArray<readonly [number, number, number]> = [
    // x, z, yaw: west wall, south wall, north wall, east wall.
    [PANTHEON.minX, pantheonBayCenter(0, 0).z, Math.PI / 2], [PANTHEON.minX, pantheonBayCenter(0, 2).z, Math.PI / 2],
    [pantheonBayCenter(0, 0).x, PANTHEON.maxZ, Math.PI],
    [pantheonBayCenter(1, 2).x, PANTHEON.minZ, 0], [pantheonBayCenter(2, 2).x, PANTHEON.minZ, 0],
    [PANTHEON.maxX, pantheonBayCenter(2, 0).z, -Math.PI / 2],
  ];
  for (const [index, [x, z, yaw]] of places.entries()) {
    const tilt = (random() - 0.5) * 0.06;
    const facingX = Math.sin(yaw);
    const facingZ = Math.cos(yaw);
    const matrix = placement(x + facingX * 0.05, FLOOR + SHIELD.y, z + facingZ * 0.05, 0, yaw, tilt).clone();
    batch.add(new THREE.ExtrudeGeometry(shape, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03), materials.dressedStone, matrix);
    batch.add(new THREE.ShapeGeometry(shape).scale(0.86, 0.88, 1).translate(0, 0, 0.032), materials.gilt, matrix);
    const pales = index % 3 === 2 ? 2 : 4;
    for (let pale = 0; pale < pales; pale++) {
      const paleX = (pale - 1.5) * width * 0.19;
      batch.add(new THREE.PlaneGeometry(width * 0.085, height * 0.62).translate(paleX, height * 0.04, 0.034), materials.redCloth, matrix);
    }
  }
}

/** The cracked east wall behind the empty tomb: a black cleft splitting the ashlar, a breath of cold light in it, stone shed below. */
function addCrack(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  const face = PANTHEON_CRACK.x - 0.012;
  let z = PANTHEON_CRACK.z + (random() - 0.5) * 0.2;
  let y = 0.25;
  while (y < PANTHEON_CRACK.height) {
    const step = 0.25 + random() * 0.35;
    const nextZ = PANTHEON_CRACK.z + (random() - 0.5) * PANTHEON_CRACK.width;
    const width = 0.06 + (1 - Math.abs(y - PANTHEON_CRACK.height * 0.45) / PANTHEON_CRACK.height) * 0.2;
    const lean = Math.atan2(nextZ - z, step);
    batch.add(new THREE.BoxGeometry(0.02, Math.hypot(step, nextZ - z) + 0.05, width), materials.cavity, placement(face, FLOOR + y + step / 2, (z + nextZ) / 2, lean, 0, 0));
    if (y > 0.8 && y < 2.6) {
      // Cold light deep in the cleft, a hair in front of its black.
      batch.add(new THREE.BoxGeometry(0.01, step * 0.7, width * 0.35), materials.windGlow, placement(face - 0.018, FLOOR + y + step / 2, (z + nextZ) / 2, lean, 0, 0));
    }
    z = nextZ;
    y += step;
  }
  // Ashlar pushed out of the wall round the cleft.
  for (let block = 0; block < 4; block++) {
    batch.addBox(materials.cryptStone, PANTHEON_CRACK.x - 0.08, FLOOR + 0.6 + block * 0.75, PANTHEON_CRACK.z + (block % 2 ? 0.55 : -0.5), 0.16, 0.36, 0.5, 0, (random() - 0.5) * 0.2, (random() - 0.5) * 0.1, block);
  }
  addRubble(batch, materials, PANTHEON_CRACK.x - 0.6, FLOOR, PANTHEON_CRACK.z, 14, 1.4, random);
}

/** A wrought ring of candles hanging on chains over the central bay. */
function addCandleCrown(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  const site = DIE_KATHEDRALE_LIGHT_SITES.find((candidate) => candidate.id === 'pantheon-crown');
  if (!site) return;
  const ringY = site.y - 0.2;
  batch.add(new THREE.TorusGeometry(CROWN.radius, 0.04, 5, 24).rotateX(Math.PI / 2).translate(site.x, ringY, site.z), materials.iron);
  batch.add(new THREE.TorusGeometry(CROWN.radius * 0.45, 0.03, 5, 16).rotateX(Math.PI / 2).translate(site.x, ringY + 0.22, site.z), materials.iron);
  const apex = FLOOR + PANTHEON.apexY;
  for (let chain = 0; chain < 4; chain++) {
    const angle = chain * Math.PI / 2 + Math.PI / 4;
    const fromX = site.x + Math.cos(angle) * CROWN.radius;
    const fromZ = site.z + Math.sin(angle) * CROWN.radius;
    const length = Math.hypot(CROWN.radius, apex - ringY);
    const chainGeometry = new THREE.CylinderGeometry(0.012, 0.012, length, 4);
    const tilt = Math.atan2(CROWN.radius, apex - ringY);
    // Leaning in from the ring to the crown of the vault.
    batch.add(chainGeometry, materials.iron, placement((fromX + site.x) / 2, (ringY + apex) / 2, (fromZ + site.z) / 2, -Math.sin(angle) * tilt, 0, Math.cos(angle) * tilt));
  }
  for (let candle = 0; candle < 12; candle++) {
    const angle = candle / 12 * Math.PI * 2;
    if (candle === 7) continue;
    addCandleCluster(context, site.x + Math.cos(angle) * CROWN.radius, ringY + 0.04, site.z + Math.sin(angle) * CROWN.radius, 1, 0.06, random);
  }
}

/** Tall iron candlesticks at the warrior king's feet and the crowned king's head. */
function addTombCandlesticks(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  for (const id of ['pantheon-tomb-south-candles', 'pantheon-tomb-north-candles']) {
    const site = DIE_KATHEDRALE_LIGHT_SITES.find((candidate) => candidate.id === id);
    if (!site) continue;
    const top = site.y - 0.18;
    for (let foot = 0; foot < 3; foot++) {
      const angle = foot / 3 * Math.PI * 2;
      batch.addBox(materials.iron, site.x + Math.cos(angle) * 0.14, FLOOR + 0.05, site.z + Math.sin(angle) * 0.14, 0.26, 0.04, 0.04, 0, -angle, 0);
    }
    batch.add(new THREE.CylinderGeometry(0.022, 0.03, top - FLOOR, 6).translate(site.x, (top + FLOOR) / 2, site.z), materials.iron);
    batch.add(new THREE.CylinderGeometry(0.16, 0.1, 0.05, 10).translate(site.x, top, site.z), materials.iron);
    addCandleCluster(context, site.x, top + 0.025, site.z, 3, 0.14, random);
  }
}

/** Votives melted onto the floor at the two corners of each candlelit tomb away from its candlestick. */
function addTombVotives(context: DieKathedraleBuildContext, random: () => number): void {
  const { width, length } = ROYAL_TOMB;
  for (const [id, away] of [['tomb-south', -1], ['tomb-north', 1]] as const) {
    const tomb = ROYAL_TOMBS.find((candidate) => candidate.id === id);
    if (!tomb) continue;
    for (const side of [-1, 1]) {
      addCandleCluster(context, tomb.x + side * (width / 2 + 0.32), FLOOR, tomb.z + away * (length / 2 + 0.28), 3 + Math.floor(random() * 2), 0.12, random);
    }
  }
}

/** An iron torch on the north wall beside the reliquary gate, where its light site burns. */
function addReliquaryTorch(context: DieKathedraleBuildContext): void {
  const site = DIE_KATHEDRALE_LIGHT_SITES.find((candidate) => candidate.id === 'pantheon-reliquary-torch');
  if (site) addWallTorch(context, site.x, site.y, PANTHEON.minZ, 0, 1);
}

/** Soft dark pools on the floor under every tomb and pier, the inner one deeper. */
function addContactShadows(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const { width, length } = ROYAL_TOMB;
  for (const tomb of ROYAL_TOMBS) {
    addFloorStain(batch, materials, tomb.x, FLOOR, tomb.z, width + 1.6, length + 1.6, 0);
    addFloorStain(batch, materials, tomb.x, FLOOR, tomb.z, width + 0.8, length + 0.8, 0);
  }
  for (const pier of PANTHEON_PIERS) addFloorStain(batch, materials, pier.x, FLOOR, pier.z, PANTHEON_PIER.halfWidth * 4, PANTHEON_PIER.halfWidth * 4, 0);
}

function addDecay(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  const springTop = FLOOR + PANTHEON.springY;
  for (const [x, z, facingX, facingZ] of [
    [PANTHEON.maxX, PANTHEON_CRACK.z - 1.4, -1, 0], [PANTHEON.minX, -70.2, 1, 0], [6.2, PANTHEON.minZ, 0, 1],
  ] as const) {
    addHangingRoot(batch, materials, x, springTop + 0.8, z, facingX, facingZ, 2 + random() * 1.4, random);
  }
  for (const [x, z, towardX, towardZ] of [
    [PANTHEON.minX, PANTHEON.maxZ, 1, -1], [PANTHEON.maxX, PANTHEON.minZ, -1, 1], [PANTHEON.minX, PANTHEON.minZ, 1, 1],
  ] as const) {
    batch.add(cobwebGeometry({ x: x + towardX * 0.02, y: springTop, z: z + towardZ * 0.02 }, towardX, towardZ, 1.6), materials.cobweb);
  }
  for (const [x, z, facingX, facingZ] of [
    [PANTHEON.minX, -76.6, 1, 0], [PANTHEON.maxX, -66.2, -1, 0], [-1.2, PANTHEON.minZ, 0, 1], [12.4, PANTHEON.maxZ, 0, -1],
  ] as const) {
    addWallStain(batch, materials, x, FLOOR, z, facingX, facingZ, 1.6 + random(), 1.8 + random() * 1.5);
  }
  for (let patch = 0; patch < 6; patch++) {
    addFloorStain(batch, materials,
      THREE.MathUtils.lerp(PANTHEON.minX + 1.5, PANTHEON.maxX - 1.5, random()), FLOOR,
      THREE.MathUtils.lerp(PANTHEON.minZ + 1.5, PANTHEON.maxZ - 1.5, random()),
      1.4 + random() * 2, 1 + random() * 1.2, random() * Math.PI);
  }
}
