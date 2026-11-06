import * as THREE from 'three';
import { starGeometry } from '../../../rendering/StarGeometry';
import { placement } from '../shared/StaticMeshBatch';
import { PROTOCOL33_SURFACE, PROTOCOL33_SURFACE_Y, PROTOCOL33_YARD } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';

const GROUND = PROTOCOL33_SURFACE_Y;
const { yard, kiosk } = PROTOCOL33_SURFACE;
/** The red banner tied along the inside of the west fence, between the drums and the lamp. */
const BANNER = { z: -84.2, length: 4.2, height: 1.1, bottom: 1.05 } as const;
/** Flag mast on the stairhead's roof, at its north-east corner. */
const FLAG = { x: kiosk.maxX - 0.35, z: kiosk.minZ + 0.45, mast: 3.2, width: 1.5, height: 0.95 } as const;
/** Top of the stairhead's roof slab (`buildKiosk`). */
const KIOSK_ROOF_TOP = GROUND + kiosk.height + 0.2;

/**
 * The guard post's Soviet trappings, all out of the way of the fight: a
 * pair of horn loudspeakers on the sodium lamp's pole, a faded red banner
 * with a white star tied along the west fence, and a torn red flag on a
 * mast over the stairhead. No real emblems or slogans.
 */
export function buildYardDressing(context: Station33BuildContext): void {
  buildLoudspeakers(context);
  buildFenceBanner(context);
  buildKioskFlag(context);
}

/** Two grey horn speakers clamped under the lamp's arm, one towards the gate and one towards the stairhead. */
function buildLoudspeakers(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z, height } = PROTOCOL33_YARD.lampPost;
  const y = GROUND + height - 0.9;
  batch.addBox(materials.greySteel, x, y, z, 0.3, 0.06, 0.3);
  for (const aim of [Math.PI * 0.85, Math.PI * 0.15]) {
    // Horns open along their local +z, tipped a little down over the yard.
    const horn = new THREE.CylinderGeometry(0.2, 0.05, 0.55, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.32);
    const driver = new THREE.CylinderGeometry(0.07, 0.07, 0.14, 10).rotateX(Math.PI / 2).translate(0, 0, 0.02);
    batch.add(horn, materials.greySteel, placement(x, y - 0.12, z, 0.25, aim, 0));
    batch.add(driver, materials.paintedSteel, placement(x, y - 0.12, z, 0.25, aim, 0));
  }
  // The cable down the pole.
  batch.addBox(materials.rubber, x - 0.13, GROUND + (height - 0.9) / 2, z, 0.025, height - 0.9, 0.025);
}

/** A sagging red banner on the fence's yard face, a white star stitched at its middle, its lower corner torn away. */
function buildFenceBanner(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const faceX = yard.minX + 0.09;
  const cloth = new THREE.PlaneGeometry(BANNER.length, BANNER.height, 12, 3);
  const positions = cloth.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    const along = positions.getX(index) / (BANNER.length / 2);
    const fromTop = 0.5 - positions.getY(index) / BANNER.height;
    // It sags between its ties and billows a little off the fence.
    positions.setY(index, positions.getY(index) - (1 - along * along) * 0.12);
    positions.setZ(index, Math.sin((along + 1) * Math.PI * 1.5) * 0.03 * fromTop + 0.02);
    // The torn lower corner, towards the drums.
    if (along < -0.75 && fromTop > 0.6) positions.setY(index, positions.getY(index) + (fromTop - 0.6) * 0.8);
  }
  cloth.computeVertexNormals();
  const centreY = GROUND + BANNER.bottom + BANNER.height / 2;
  batch.add(cloth.rotateY(Math.PI / 2), materials.redCloth, placement(faceX, centreY, BANNER.z));
  batch.add(starGeometry(0.3, 0.12, 0.01).rotateY(Math.PI / 2), materials.stucco, placement(faceX + 0.05, centreY - 0.08, BANNER.z));
  for (const end of [-1, 1]) {
    batch.addBox(materials.rubber, yard.minX + 0.03, centreY + BANNER.height / 2 - 0.02, BANNER.z + end * (BANNER.length / 2), 0.1, 0.03, 0.03);
  }
}

/** A steel mast with a torn red flag hanging heavy in the cold, on the stairhead's roof. */
function buildKioskFlag(context: Station33BuildContext): void {
  const { batch, materials } = context;
  batch.add(new THREE.CylinderGeometry(0.03, 0.04, FLAG.mast, 8), materials.greySteel, placement(FLAG.x, KIOSK_ROOF_TOP + FLAG.mast / 2, FLAG.z));
  batch.add(new THREE.SphereGeometry(0.06, 8, 6), materials.bronze, placement(FLAG.x, KIOSK_ROOF_TOP + FLAG.mast + 0.04, FLAG.z));
  batch.addBox(materials.greySteel, FLAG.x, KIOSK_ROOF_TOP + 0.05, FLAG.z, 0.3, 0.1, 0.3);
  const flag = new THREE.PlaneGeometry(FLAG.width, FLAG.height, 10, 4).translate(FLAG.width / 2, -FLAG.height / 2, 0);
  const positions = flag.getAttribute('position');
  for (let index = 0; index < positions.count; index++) {
    const out = positions.getX(index) / FLAG.width;
    // Folds grow towards the fly end, which droops and frays.
    positions.setZ(index, Math.sin(out * Math.PI * 3.2) * 0.12 * out);
    positions.setY(index, positions.getY(index) - out * out * 0.35);
    if (out > 0.85) positions.setX(index, positions.getX(index) - (Math.abs(Math.sin(positions.getY(index) * 17)) * 0.18));
  }
  flag.computeVertexNormals();
  // It hangs west of the mast, out over the roof.
  batch.add(flag, materials.redCloth, placement(FLAG.x - 0.03, KIOSK_ROOF_TOP + FLAG.mast - 0.05, FLAG.z, 0, Math.PI + 0.35, 0));
}

