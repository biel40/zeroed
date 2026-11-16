import * as THREE from 'three';
import { POINT_DOOR_SIZE } from '../../doors/PointDoor';
import {
  DIE_KATHEDRALE_CHAPELS,
  DIE_KATHEDRALE_DOOR_CUTS,
  DIE_KATHEDRALE_SCREEN,
  DIE_KATHEDRALE_SCREENS,
  NAVE_COLUMN,
  chapelScreens,
  type DieKathedraleScreen,
} from '../DieKathedraleConfig';
import { wallSpans, type WallOpening } from '../shared/ArenaStructure';
import { wallOpeningsAt } from '../shared/EntrancePassage';
import { seededRandom } from '../shared/ProceduralNoise';
import { addSolidProxy } from '../shared/SolidProxy';
import type { DieKathedraleBuildContext } from './DieKathedraleBuildContext';

/** Iron bars on a stone plinth, spear-tipped, well above head height and far below the vault. */
const GRILLE = { plinthHeight: 0.45, plinthWidth: 0.36, top: 2.5, barSpacing: 0.24, barRadius: 0.018, rail: 0.05, post: 0.12, postTop: 2.85 } as const;
/** A waist-high wall with its coping and a thin iron rail; stone piers frame its gates. */
const PARAPET = { height: 1, copingWidth: 0.4, copingHeight: 0.08, railTop: 1.45, postSpacing: 1.3, pier: 0.42, pierTop: 2.3 } as const;
const RUBBLE_CHUNKS = 30;

/** Every way through a screen: the paid doors on its line and its own free gaps. */
function screenOpenings(screen: DieKathedraleScreen): WallOpening[] {
  return [
    ...wallOpeningsAt(screen.axis, screen.fixed, screen.min, screen.max, DIE_KATHEDRALE_DOOR_CUTS),
    ...(screen.gaps ?? []).map((center) => ({ center, width: DIE_KATHEDRALE_SCREEN.gapWidth, bottom: 0, top: POINT_DOOR_SIZE.height })),
  ];
}

/** World position of a point `along` a screen, `across` off its centre line. */
function screenPoint(screen: DieKathedraleScreen, along: number, across = 0): { x: number; z: number } {
  return screen.axis === 'x' ? { x: along, z: screen.fixed + across } : { x: screen.fixed + across, z: along };
}

/** A box lying along a screen from `from` to `to`, `across` wide. */
function addRun(
  context: DieKathedraleBuildContext, material: THREE.Material, screen: DieKathedraleScreen,
  from: number, to: number, y: number, height: number, across: number, seed = 0,
): void {
  const { x, z } = screenPoint(screen, (from + to) / 2);
  const length = to - from;
  if (screen.axis === 'x') context.batch.addBox(material, x, y, z, length, height, across, 0, 0, 0, seed);
  else context.batch.addBox(material, x, y, z, across, height, length, 0, 0, 0, seed);
}

/** A square upright standing on a screen's line. */
function addUpright(context: DieKathedraleBuildContext, material: THREE.Material, screen: DieKathedraleScreen, along: number, size: number, top: number, seed = 0): void {
  const { x, z } = screenPoint(screen, along);
  context.batch.addBox(material, x, top / 2, z, size, top, size, 0, 0, 0, seed);
}

function addGrilleSpan(context: DieKathedraleBuildContext, screen: DieKathedraleScreen, from: number, to: number, seed: number): void {
  const { batch, materials } = context;
  const { plinthHeight, plinthWidth, top, barSpacing, barRadius, rail } = GRILLE;
  addRun(context, materials.dressedStone, screen, from, to, plinthHeight / 2, plinthHeight, plinthWidth, seed);
  addRun(context, materials.iron, screen, from, to, plinthHeight + 0.14, rail, rail);
  addRun(context, materials.iron, screen, from, to, top - 0.16, rail, rail);
  const barHeight = top - plinthHeight;
  const bars = Math.max(1, Math.round((to - from) / barSpacing));
  for (let bar = 0; bar < bars; bar++) {
    const { x, z } = screenPoint(screen, from + (bar + 0.5) * (to - from) / bars);
    batch.add(new THREE.CylinderGeometry(barRadius, barRadius, barHeight, 4, 1, true).translate(x, plinthHeight + barHeight / 2, z), materials.iron);
    batch.add(new THREE.ConeGeometry(barRadius * 2.2, 0.18, 4, 1, true).translate(x, top + 0.09, z), materials.iron);
  }
}

function addParapetSpan(context: DieKathedraleBuildContext, screen: DieKathedraleScreen, from: number, to: number, seed: number): void {
  const { materials } = context;
  const { height, copingWidth, copingHeight, railTop, postSpacing } = PARAPET;
  addRun(context, materials.wallStone, screen, from, to, height / 2, height, DIE_KATHEDRALE_SCREEN.thickness, seed);
  addRun(context, materials.dressedStone, screen, from, to, height + copingHeight / 2, copingHeight, copingWidth, seed + 1);
  addRun(context, materials.iron, screen, from, to, railTop, 0.04, 0.04);
  const posts = Math.max(2, Math.round((to - from) / postSpacing) + 1);
  for (let post = 0; post < posts; post++) {
    const { x, z } = screenPoint(screen, THREE.MathUtils.lerp(from + 0.1, to - 0.1, post / (posts - 1)));
    context.batch.addBox(materials.iron, x, (height + railTop) / 2, z, 0.035, railTop - height, 0.035);
  }
}

/** A heap of fallen ashlar and two drums of a broken shaft, piled highest on the screen's line. */
function addRubble(context: DieKathedraleBuildContext, screen: DieKathedraleScreen): void {
  const { batch, materials } = context;
  const { rubbleDepth, rubbleHeight } = DIE_KATHEDRALE_SCREEN;
  const random = seededRandom(6400 + Math.round(screen.fixed));
  for (let chunk = 0; chunk < RUBBLE_CHUNKS; chunk++) {
    const across = (random() - 0.5) * rubbleDepth * 1.5;
    const size = 0.3 + random() * 0.6;
    const peak = Math.max(0.1, 1 - Math.abs(across) / (rubbleDepth * 0.75));
    const { x, z } = screenPoint(screen, THREE.MathUtils.lerp(screen.min + 0.4, screen.max - 0.4, random()), across);
    batch.addBox(
      chunk % 3 === 0 ? materials.dressedStone : materials.wallStone,
      x, size * 0.35 + random() * rubbleHeight * 0.8 * peak, z,
      size, size * (0.5 + random() * 0.5), size * (0.6 + random() * 0.6),
      random() * 0.9, random() * Math.PI, random() * 0.9, chunk,
    );
  }
  for (const [share, across, yaw] of [[0.3, 0.9, 0.5], [0.7, -0.7, 2.1]] as const) {
    const { x, z } = screenPoint(screen, THREE.MathUtils.lerp(screen.min, screen.max, share), across);
    const drum = new THREE.CylinderGeometry(NAVE_COLUMN.radius, NAVE_COLUMN.radius, 1.5, 8).rotateZ(Math.PI / 2).rotateY(yaw).translate(x, NAVE_COLUMN.radius * 0.8, z);
    batch.add(drum, materials.dressedStone);
  }
  const from = screenPoint(screen, screen.min, -rubbleDepth / 2);
  const to = screenPoint(screen, screen.max, rubbleDepth / 2);
  addSolidProxy(context, screen.id, { x: from.x, y: 0, z: from.z }, { x: to.x, y: rubbleHeight, z: to.z }, 'concrete', 'none');
}

/** Uprights either side of a way through, joined overhead: iron posts in a grille, stone piers in a parapet. */
function addGateFrame(context: DieKathedraleBuildContext, screen: DieKathedraleScreen, opening: WallOpening): void {
  const { materials } = context;
  const grille = screen.style === 'grille';
  const size = grille ? GRILLE.post : PARAPET.pier;
  const top = grille ? GRILLE.postTop : PARAPET.pierTop;
  const material = grille ? materials.iron : materials.dressedStone;
  const reach = opening.width / 2 + size / 2;
  for (const side of [-1, 1]) addUpright(context, material, screen, opening.center + side * reach, size, top, side);
  addRun(context, materials.iron, screen, opening.center - reach, opening.center + reach, top - 0.08, 0.07, 0.07);
}

/**
 * One division of the nave: its drawn pieces between the ways through it
 * and a low solid under each. The solid stops the player, the horde and low
 * shots; above it the bars are only drawn, so sight and fire carry over.
 */
function addScreen(context: DieKathedraleBuildContext, screen: DieKathedraleScreen): void {
  if (screen.style === 'rubble') {
    addRubble(context, screen);
    return;
  }
  const openings = screenOpenings(screen);
  const half = DIE_KATHEDRALE_SCREEN.thickness / 2;
  wallSpans(screen.min, screen.max, openings).forEach(([from, to], index) => {
    if (screen.style === 'grille') addGrilleSpan(context, screen, from, to, index);
    else addParapetSpan(context, screen, from, to, index);
    const low = screenPoint(screen, from, -half);
    const high = screenPoint(screen, to, half);
    addSolidProxy(
      context, `${screen.id}-${index}`,
      { x: low.x, y: 0, z: low.z }, { x: high.x, y: DIE_KATHEDRALE_SCREEN.solidHeight, z: high.z },
      screen.style === 'grille' ? 'metal' : 'concrete', 'none',
    );
  });
  for (const opening of openings) addGateFrame(context, screen, opening);
}

/**
 * Everything that splits the nave without closing it: the rood and choir
 * grilles, the arcade parapets, the collapse over the east aisle and the
 * grilles of the side chapels.
 */
export function buildNaveDivisions(context: DieKathedraleBuildContext): void {
  for (const screen of DIE_KATHEDRALE_SCREENS) addScreen(context, screen);
  for (const chapel of DIE_KATHEDRALE_CHAPELS) {
    for (const screen of chapelScreens(chapel)) addScreen(context, screen);
  }
}
