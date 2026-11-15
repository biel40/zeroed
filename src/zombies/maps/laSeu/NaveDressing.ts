import * as THREE from 'three';
import {
  ALTAR,
  COLUMN_RING_Y,
  LIT_COLUMN_RINGS,
  MOONLIT_LANCET_BAYS,
  NAVE,
  NAVE_COLUMN,
  NAVE_COLUMN_ZS,
  PEW,
  PEW_BLOCKS,
  ROSE_WINDOWS,
  SANCTUARY_LAMP,
  naveBayCenter,
} from '../LaSeuConfig';
import { seededRandom } from '../shared/ProceduralNoise';
import type { LaSeuBuildContext } from './LaSeuBuildContext';
import { pewBlockFootprint } from './NaveFurniture';

const RING_RADIUS = NAVE_COLUMN.radius + 0.6;
const RING_CANDLES = 8;

/** A flat decal on the floor, turned by `yaw`. */
export function floorDecal(width: number, depth: number, x: number, z: number, yaw: number, lift: number): THREE.BufferGeometry {
  return new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2).rotateY(yaw).translate(x, lift, z);
}

/**
 * What tells the story without stopping anyone: the wrought-iron candle
 * rings round the columns, banners, the sanctuary lamp, the cold light the
 * moon still throws through a few windows, and the traces of whoever made a
 * stand in here.
 */
export function buildNaveDressing(context: LaSeuBuildContext): void {
  addColumnRings(context);
  addBanners(context);
  addSanctuaryLamp(context);
  addGlassLight(context);
  addLastStand(context);
}

/** A ring of candles hung round every column on iron brackets; only some still burn. */
function addColumnRings(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  for (const side of [-1, 1] as const) {
    NAVE_COLUMN_ZS.forEach((z, column) => {
      const x = side * NAVE.columnX;
      const lit = LIT_COLUMN_RINGS.some((ring) => ring.side === side && ring.column === column);
      batch.add(new THREE.TorusGeometry(RING_RADIUS, 0.03, 5, 16).rotateX(Math.PI / 2).translate(x, COLUMN_RING_Y, z), materials.iron);
      for (let index = 0; index < RING_CANDLES; index++) {
        const angle = (index + 0.5) / RING_CANDLES * Math.PI * 2;
        const candleX = x + Math.sin(angle) * RING_RADIUS;
        const candleZ = z + Math.cos(angle) * RING_RADIUS;
        if (index % 2 === 0) {
          // Bracket from the shaft out to the ring.
          const reach = RING_RADIUS - NAVE_COLUMN.radius * 0.9;
          batch.addBox(
            materials.iron,
            x + Math.sin(angle) * (RING_RADIUS - reach / 2), COLUMN_RING_Y - 0.02, z + Math.cos(angle) * (RING_RADIUS - reach / 2),
            0.03, 0.03, reach, 0, angle,
          );
        }
        batch.add(new THREE.CylinderGeometry(0.03, 0.03, 0.24, 5).translate(candleX, COLUMN_RING_Y + 0.14, candleZ), materials.wax);
        if (lit && index !== 3) batch.add(new THREE.SphereGeometry(0.04, 5, 4).scale(1, 1.8, 1).translate(candleX, COLUMN_RING_Y + 0.31, candleZ), materials.flame);
      }
    });
  }
}

/** Long red banners on the clerestory shafts nearest the chancel. */
function addBanners(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  for (const side of [-1, 1]) {
    for (const column of [3, 5]) {
      const x = side * (NAVE.columnX - 0.43);
      batch.addBox(materials.redCloth, x, 13.6, NAVE_COLUMN_ZS[column], 0.02, 4.6, 1.1);
      batch.addBox(materials.gilt, x, 15.95, NAVE_COLUMN_ZS[column], 0.05, 0.05, 1.3);
    }
  }
}

/** A red glass lamp on a long chain before the chancel arch: the one light nobody put out. */
function addSanctuaryLamp(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  const { x, y, z } = SANCTUARY_LAMP;
  const chain = 5;
  batch.addBox(materials.iron, x, y + 0.2 + chain / 2, z, 0.02, chain, 0.02);
  batch.add(new THREE.CylinderGeometry(0.11, 0.05, 0.24, 6).translate(x, y, z), materials.redCloth);
  batch.add(new THREE.TorusGeometry(0.11, 0.015, 4, 8).rotateX(Math.PI / 2).translate(x, y + 0.12, z), materials.gilt);
  batch.add(new THREE.SphereGeometry(0.035, 5, 4).scale(1, 1.6, 1).translate(x, y + 0.02, z), materials.flame);
}

/**
 * Moonlight on stone, and nowhere else: a cold pool under each lancet the
 * moon still comes through, and the front rose laid on the floor of the
 * narthex where the run starts.
 */
function addGlassLight(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  for (const bay of MOONLIT_LANCET_BAYS) {
    const pool = new THREE.PlaneGeometry(1.7, 5.2).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(NAVE.maxX - 3.6, 0.014, naveBayCenter(bay) - 1.6);
    batch.add(pool, materials.poolCool);
  }
  const front = ROSE_WINDOWS.front;
  batch.add(floorDecal(front.radius * 1.8, front.radius * 2.6, 0, NAVE.maxZ - 5.4, 0, 0.016), materials.poolRose);
}

/** Blood, dropped books and fallen candlesticks where the pews were dragged away. */
function addLastStand(context: LaSeuBuildContext): void {
  const { batch, materials } = context;
  const random = seededRandom(6301);
  for (const block of PEW_BLOCKS.filter((candidate) => candidate.state === 'cleared')) {
    const footprint = pewBlockFootprint(block);
    const centerX = (footprint.minX + footprint.maxX) / 2;
    const centerZ = (footprint.minZ + footprint.maxZ) / 2;
    batch.add(floorDecal(2.6, 2.6, centerX, centerZ, random() * Math.PI, 0.012), materials.bloodSplatter);
    batch.add(floorDecal(0.9, 2.8, centerX + block.side * 1.2, centerZ - 1.2, random() * 0.6 - 0.3, 0.013), materials.bloodSmear);
    for (let book = 0; book < 7; book++) {
      batch.addBox(
        book % 3 === 0 ? materials.redCloth : materials.darkWood,
        THREE.MathUtils.lerp(footprint.minX, footprint.maxX, random()), 0.02, THREE.MathUtils.lerp(footprint.minZ, footprint.maxZ, random()),
        0.16, 0.04, 0.22, 0, random() * Math.PI,
      );
    }
    // A tall candlestick knocked flat across the gap.
    const stickX = centerX - block.side * 0.6;
    batch.add(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 6).rotateZ(Math.PI / 2).rotateY(0.5).translate(stickX, 0.05, centerZ + 0.9), materials.gilt);
    batch.add(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 8).rotateZ(Math.PI / 2).rotateY(0.5).translate(stickX - 0.66, 0.16, centerZ + 0.9 + 0.36), materials.gilt);
  }
  // The trail leads up the central aisle to the altar steps.
  batch.add(floorDecal(1.1, 3.4, 0.2, NAVE.minZ + 2.4, 0.1, 0.012), materials.bloodSmear);
  batch.add(floorDecal(2, 2, ALTAR.x + 1.4, ALTAR.z + ALTAR.daisDepth / 2 + 1.1, 1.1, 0.012), materials.bloodSplatter);
  // A pew end left standing alone where its block was cleared.
  const lone = PEW_BLOCKS.find((candidate) => candidate.state === 'cleared');
  if (lone) batch.addBox(materials.darkWood, lone.side * (PEW.innerX + 0.2), 0.03, naveBayCenter(lone.bay) + 1.5, 0.92, 0.06, PEW.depth, 0, 0.4);
}
