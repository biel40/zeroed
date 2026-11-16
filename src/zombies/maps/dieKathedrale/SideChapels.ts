import * as THREE from 'three';
import { CHAPEL, DIE_KATHEDRALE_CHAPELS, NAVE, chapelArea, naveBayCenter, type DieKathedraleChapel } from '../DieKathedraleConfig';
import { addSolidProxy } from '../shared/SolidProxy';
import { cobwebGeometry } from './CobwebTexture';
import type { DieKathedraleBuildContext } from './DieKathedraleBuildContext';
import { floorDecal } from './NaveDressing';

const RETABLE = { width: 1.7, height: 2.3, bottom: 1.25 } as const;
const GRILLE_TOP = 2.5;
const SHROUD = { length: 1.9, width: 0.56, height: 0.26, spacing: 0.95 } as const;

/**
 * What stands inside the side chapels (their grilles are `NaveDivisions`'):
 * a small altar and its retable against the wall, candles where some still
 * burn, cobwebs in the corners, and in the mortuary chapel the dead laid out
 * under sheets by whoever was still counting.
 */
export function buildSideChapels(context: DieKathedraleBuildContext): void {
  for (const chapel of DIE_KATHEDRALE_CHAPELS) {
    addChapelAltar(context, chapel);
    addCobwebs(context, chapel);
    if (chapel.role === 'mortuary') addShrouds(context, chapel);
  }
}

/** Stone table against the side wall, off the chapel's centre so the wall there stays free for a rifle or a window. */
function addChapelAltar(context: DieKathedraleBuildContext, chapel: DieKathedraleChapel): void {
  const { batch, materials } = context;
  const { altarWidth, altarDepth, altarHeight, altarOffsetZ } = CHAPEL;
  const wall = chapel.side * NAVE.maxX;
  const x = wall - chapel.side * altarDepth / 2;
  const z = naveBayCenter(chapel.bay) + altarOffsetZ;
  batch.addBox(materials.dressedStone, x, altarHeight / 2, z, altarDepth, altarHeight, altarWidth, 0, 0, 0, chapel.bay);
  batch.addBox(materials.dressedStone, x, altarHeight + 0.03, z, altarDepth + 0.1, 0.06, altarWidth + 0.14, 0, 0, 0, chapel.bay + 1);

  const panelX = wall - chapel.side * 0.05;
  batch.addBox(materials.darkWood, panelX, RETABLE.bottom + RETABLE.height / 2, z, 0.08, RETABLE.height, RETABLE.width, 0, 0, 0, chapel.bay + 2);
  for (const edge of [-1, 1]) {
    batch.addBox(materials.gilt, panelX - chapel.side * 0.02, RETABLE.bottom + RETABLE.height / 2, z + edge * RETABLE.width / 2, 0.1, RETABLE.height, 0.07);
  }
  batch.addBox(materials.gilt, panelX - chapel.side * 0.02, RETABLE.bottom + RETABLE.height, z, 0.1, 0.07, RETABLE.width + 0.07);

  for (let candle = 0; candle < 3; candle++) {
    const candleZ = z + (candle - 1) * 0.42;
    const height = 0.3 - Math.abs(candle - 1) * 0.08;
    const candleX = wall - chapel.side * (altarDepth - 0.2);
    batch.add(new THREE.CylinderGeometry(0.026, 0.026, height, 5).translate(candleX, altarHeight + 0.06 + height / 2, candleZ), materials.wax);
    if (chapel.lit) batch.add(new THREE.SphereGeometry(0.032, 5, 4).scale(1, 1.8, 1).translate(candleX, altarHeight + 0.1 + height, candleZ), materials.flame);
  }
  addSolidProxy(
    context, `${chapel.id}-altar`,
    { x: Math.min(wall, wall - chapel.side * altarDepth), y: 0, z: z - altarWidth / 2 },
    { x: Math.max(wall, wall - chapel.side * altarDepth), y: altarHeight + 0.06, z: z + altarWidth / 2 },
    'concrete', 'none',
  );
}

/** A web in each corner where a side grille meets the wall. */
function addCobwebs(context: DieKathedraleBuildContext, chapel: DieKathedraleChapel): void {
  const area = chapelArea(chapel);
  const wall = chapel.side * (NAVE.maxX - 0.03);
  for (const z of [area.minZ, area.maxZ]) {
    context.batch.add(cobwebGeometry({ x: wall, y: GRILLE_TOP, z }, -chapel.side, 0, chapel.lit ? 1 : 1.5), context.materials.cobweb);
  }
}

/** Three bodies under sheets, feet to the grille, and what ran out from under them. */
function addShrouds(context: DieKathedraleBuildContext, chapel: DieKathedraleChapel): void {
  const { batch, materials } = context;
  const x = chapel.side * (NAVE.maxX - 0.3 - SHROUD.length / 2);
  for (let body = 0; body < 3; body++) {
    const z = naveBayCenter(chapel.bay) + 0.2 + body * SHROUD.spacing;
    const form = new THREE.SphereGeometry(0.5, 8, 5).scale(SHROUD.length, SHROUD.height * 2, SHROUD.width).translate(x, 0.02, z);
    batch.add(form, materials.shroud);
    // Head and feet lift the sheet at either end.
    batch.add(new THREE.SphereGeometry(0.13, 6, 4).translate(x + chapel.side * SHROUD.length * 0.34, 0.14, z), materials.shroud);
    batch.add(new THREE.SphereGeometry(0.1, 6, 4).scale(1, 1, 1.6).translate(x - chapel.side * SHROUD.length * 0.38, 0.12, z), materials.shroud);
  }
  const middle = naveBayCenter(chapel.bay) + 0.2 + SHROUD.spacing;
  batch.add(floorDecal(2.2, 2.4, x - chapel.side * 0.9, middle, 0.7, 0.012), materials.bloodSplatter);
  batch.add(floorDecal(0.9, 2.6, chapel.side * (NAVE.maxX - CHAPEL.depth - 0.9), naveBayCenter(chapel.bay), Math.PI / 2, 0.013), materials.bloodSmear);
}
