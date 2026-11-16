import * as THREE from 'three';
import { BROKEN_PEWS, DIE_KATHEDRALE_DOORS, DIE_KATHEDRALE_SCREENS, NAVE, PEW, type BrokenPew } from '../DieKathedraleConfig';
import { seededRandom } from '../shared/ProceduralNoise';
import { addSolidProxy } from '../shared/SolidProxy';
import { cobwebGeometry } from './CobwebTexture';
import type { DieKathedraleBuildContext } from './DieKathedraleBuildContext';
import { floorDecal } from './NaveDressing';
import { addPew } from './NaveFurniture';

const GRILLE_TOP = 2.5;
const BROKEN_PEW_HEIGHT = 0.7;
const FALLEN_STONES = 36;

/**
 * Traces of what happened here, kept sparse: pews dragged into the aisles
 * and left broken, stone shed by the vault around the collapse, webs where
 * the grilles meet the walls, and blood dragged through every gate.
 */
export function buildNaveRuin(context: DieKathedraleBuildContext): void {
  for (const pew of BROKEN_PEWS) addBrokenPew(context, pew);
  addFallenStones(context);
  addGrilleCobwebs(context);
  addGateTrails(context);
}

/** A pew on its back, with a solid of its own. */
function addBrokenPew(context: DieKathedraleBuildContext, pew: BrokenPew): void {
  const alongX = pew.axis === 'x';
  addPew(context, pew.x, 0.26, pew.z, alongX ? 0.06 : Math.PI / 2 + 0.06, Math.PI / 2, 90);
  const halfX = alongX ? PEW.length / 2 : PEW.depth / 2;
  const halfZ = alongX ? PEW.depth / 2 : PEW.length / 2;
  addSolidProxy(
    context, pew.id,
    { x: pew.x - halfX, y: 0, z: pew.z - halfZ }, { x: pew.x + halfX, y: BROKEN_PEW_HEIGHT, z: pew.z + halfZ },
    'wood', 'none',
  );
}

/** Small stones scattered out from the collapse: too low to stop anyone. */
function addFallenStones(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const collapse = DIE_KATHEDRALE_SCREENS.find((screen) => screen.style === 'rubble');
  if (!collapse) return;
  const random = seededRandom(6402);
  const centerX = (collapse.min + collapse.max) / 2;
  for (let stone = 0; stone < FALLEN_STONES; stone++) {
    const size = 0.08 + random() * 0.2;
    // Thrown wider the smaller they are, more of them towards the nave than towards the wall.
    const reach = 1.4 + random() * 5.5 * (1 - size);
    const angle = random() * Math.PI * 2;
    const x = THREE.MathUtils.clamp(centerX + Math.cos(angle) * reach * 1.3, -NAVE.columnX + 1, NAVE.maxX - 0.4);
    const z = THREE.MathUtils.clamp(collapse.fixed + Math.sin(angle) * reach, NAVE.minZ + 0.4, collapse.fixed + 9);
    batch.addBox(
      stone % 4 === 0 ? materials.dressedStone : materials.wallStone,
      x, size * 0.4, z, size * 1.4, size, size, random() * 0.5, random() * Math.PI, random() * 0.5, stone,
    );
  }
}

/** A web wherever a grille runs into a side wall. */
function addGrilleCobwebs(context: DieKathedraleBuildContext): void {
  for (const screen of DIE_KATHEDRALE_SCREENS) {
    if (screen.style !== 'grille' || screen.axis !== 'x') continue;
    for (const [end, inward] of [[screen.min, 1], [screen.max, -1]] as const) {
      if (Math.abs(end) !== NAVE.maxX) continue;
      context.batch.add(cobwebGeometry({ x: end + inward * 0.03, y: GRILLE_TOP, z: screen.fixed + 0.02 }, inward, 0, 1.6), context.materials.cobweb);
    }
  }
}

/** Something was dragged through every gate, away from the doors. */
function addGateTrails(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const random = seededRandom(6403);
  for (const door of DIE_KATHEDRALE_DOORS) {
    if (door.kind !== 'gate') continue;
    const yaw = Math.atan2(door.outwardX, door.outwardZ) + (random() - 0.5) * 0.3;
    batch.add(floorDecal(0.8 + random() * 0.4, 3, door.x + door.outwardX * 0.9, door.z + door.outwardZ * 0.9, yaw, 0.013), materials.bloodSmear);
    if (random() < 0.5) batch.add(floorDecal(1.6, 1.6, door.x - door.outwardX * 1.3, door.z - door.outwardZ * 1.3, random() * Math.PI, 0.012), materials.bloodSplatter);
  }
}
