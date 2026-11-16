import { POINT_DOOR_SIZE } from '../../doors/PointDoor';
import { MAIN_PORTAL } from '../DieKathedraleConfig';
import { archPoints, lancetShape, ribGeometries, wallShapeGeometry, type WallFacing } from './GothicVault';
import type { DieKathedraleBuildContext } from './DieKathedraleBuildContext';

const LEAF_THICKNESS = 0.07;

/**
 * One face of the great doors of the main front: two oak leaves closed for
 * good round the wicket (the paid door), iron straps, the carved tympanum
 * and the arch over it. `faceZ` is the wall face it stands on and `facing`
 * the side it looks to; the nave and the plaza each dress their own face.
 */
export function addGreatDoorFace(context: DieKathedraleBuildContext, faceZ: number, facing: Extract<WallFacing, 'pz' | 'nz'>): void {
  const { batch, materials } = context;
  const out = facing === 'pz' ? 1 : -1;
  const z = faceZ + out * LEAF_THICKNESS / 2;
  const half = MAIN_PORTAL.width / 2;
  const wicketHalf = POINT_DOOR_SIZE.width / 2;
  const leafWidth = half - wicketHalf;
  for (const side of [-1, 1]) {
    batch.addBox(materials.darkWood, side * (wicketHalf + leafWidth / 2), MAIN_PORTAL.leafHeight / 2, z, leafWidth, MAIN_PORTAL.leafHeight, LEAF_THICKNESS, 0, 0, 0, side + 2);
  }
  const overHeight = MAIN_PORTAL.leafHeight - POINT_DOOR_SIZE.height;
  batch.addBox(materials.darkWood, 0, POINT_DOOR_SIZE.height + overHeight / 2, z, POINT_DOOR_SIZE.width, overHeight, LEAF_THICKNESS, 0, 0, 0, 5);
  // Iron straps across both leaves and a frame round the wicket.
  for (const y of [0.7, 2.6, 4.1]) {
    for (const side of [-1, 1]) {
      batch.addBox(materials.iron, side * (wicketHalf + leafWidth / 2), y, z + out * 0.045, leafWidth - 0.1, 0.09, 0.02);
    }
  }
  for (const side of [-1, 1]) {
    batch.addBox(materials.iron, side * (wicketHalf + 0.04), POINT_DOOR_SIZE.height / 2, z + out * 0.045, 0.08, POINT_DOOR_SIZE.height, 0.02);
  }
  batch.addBox(materials.iron, 0, POINT_DOOR_SIZE.height + 0.04, z + out * 0.045, POINT_DOOR_SIZE.width + 0.16, 0.08, 0.02);

  const tympanum = lancetShape(MAIN_PORTAL.width, MAIN_PORTAL.leafHeight, MAIN_PORTAL.leafHeight, MAIN_PORTAL.apexY, 8);
  batch.add(wallShapeGeometry(tympanum, facing, 0, faceZ + out * 0.02, materials.roughStone.userData.metersPerTile as number), materials.roughStone);
  batch.addBox(materials.dressedStone, 0, MAIN_PORTAL.leafHeight, z + out * 0.03, MAIN_PORTAL.width, 0.18, 0.14);
  const arch = archPoints(-half - 0.15, z, half + 0.15, z, MAIN_PORTAL.leafHeight, MAIN_PORTAL.apexY - MAIN_PORTAL.leafHeight + 0.15, 8);
  for (const geometry of ribGeometries(arch, 0.3, 0.3)) batch.add(geometry, materials.dressedStone);
  for (const side of [-1, 1]) {
    batch.addBox(materials.dressedStone, side * (half + 0.15), MAIN_PORTAL.leafHeight / 2, z, 0.3, MAIN_PORTAL.leafHeight, 0.3, 0, 0, 0, side + 7);
  }
}
