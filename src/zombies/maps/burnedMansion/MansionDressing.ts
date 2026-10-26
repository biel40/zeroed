import * as THREE from 'three';
import { buildGasMaskModel, GAS_MASK_LENS_CENTER } from '../../gasMask/GasMaskModel';
import { seededRandom } from '../shared/ProceduralNoise';
import { MANSION_BUNKER_Y } from '../BurnedMansionConfig';
import { buildBanquetFurniture } from './MansionBanquetHall';
import type { MansionBuildContext } from './MansionBuildContext';
import { addFramedPicture, addOnFace, mansionWallFace as face, onFace } from './MansionWallMounts';

/**
 * Story and wear of the house, all non-solid and kept flat on the floor or
 * flush on the walls: crooked portraits and a mirror, dead sconces, peeling
 * paper, fallen joists, plaster, books and ash, and the banquet hall's laid
 * table; in the bunker, gas masks, junction boxes and abandoned paperwork.
 * Wall pieces avoid windows, doors, wall buys and soul lamps. Returns the one
 * gas mask the player can wear.
 */
export function buildMansionDressing(context: MansionBuildContext): MansionHookedGasMask {
  buildBanquetFurniture(context);
  addWallArt(context);
  addSconces(context);
  addPeelingPaper(context);
  addFallenTimber(context);
  addRubbleAndLitter(context);
  addFloorDecals(context);
  return addBunkerProps(context);
}

function addWallArt(context: MansionBuildContext): void {
  const { materials } = context;
  const [portraitA, portraitB] = materials.portraits;
  addFramedPicture(context, face('start-east'), 6.0, 1.85, 0.72, 0.92, portraitA, 0.05);
  addFramedPicture(context, face('box-east'), 0.4, 1.9, 0.64, 0.82, portraitB, -0.08);
  addFramedPicture(context, face('hall-south'), 2.4, 1.8, 0.66, 0.86, portraitA, 0.03);
  // The family looks down on the banquet table from over the sideboard.
  addFramedPicture(context, face('banquet-north'), -1.45, 2.0, 0.95, 1.2, portraitB, -0.02);
  addFramedPicture(context, face('banquet-west'), -16.3, 1.85, 0.7, 0.9, portraitA, 0.06);
  // The mirror over the start room's divider wall, between the two wall buys.
  addFramedPicture(context, face('start-north'), 1.6, 1.8, 0.66, 1.02, materials.mirrorGlass, 0);
  for (const [x, y, length, angle] of [[1.52, 1.95, 0.5, 0.9], [1.72, 1.62, 0.42, -0.6], [1.58, 1.62, 0.3, 2.2]] as const) {
    const crack = new THREE.BoxGeometry(length, 0.006, 0.002).rotateZ(angle).translate(x - 1.6, y - 1.8, 0.019);
    addOnFace(context, crack, materials.ash, face('start-north'), 1.6, 1.8, 0.004);
  }
  // A portrait that fell face up and burnt where it landed.
  const fallen = new THREE.Matrix4().compose(
    new THREE.Vector3(6.4, 0.025, 0.6),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.7, 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
  context.batch.add(new THREE.BoxGeometry(0.7, 0.9, 0.04), materials.gilt, fallen.clone());
  context.batch.add(new THREE.PlaneGeometry(0.56, 0.76).translate(0, 0, 0.021), portraitB, fallen);
}

/** Dead brass wall lights between the windows, some shades long gone. */
function addSconces(context: MansionBuildContext): void {
  const { materials } = context;
  const sconces: ReadonlyArray<readonly [string, number, boolean]> = [
    ['start-south', -4.5, true],
    ['start-west', 4.3, false],
    ['box-north', -5.9, true],
    ['box-west', -1.4, true],
    ['hall-north', 3.3, false],
    ['start-east', 3.6, true],
    ['banquet-west', -9.9, true],
    ['banquet-west', -14.2, false],
    ['banquet-east', -9.9, true],
  ];
  for (const [faceId, along, shaded] of sconces) {
    const target = face(faceId);
    addOnFace(context, new THREE.BoxGeometry(0.1, 0.2, 0.02).translate(0, 0, 0.01), materials.brass, target, along, 2.1, 0);
    addOnFace(context, new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6).rotateX(Math.PI / 2).translate(0, 0, 0.09), materials.brass, target, along, 2.08, 0);
    addOnFace(context, new THREE.CylinderGeometry(0.03, 0.022, 0.04, 8).translate(0, 0.02, 0.17), materials.brass, target, along, 2.08, 0);
    if (shaded) {
      addOnFace(context, new THREE.CylinderGeometry(0.065, 0.032, 0.1, 12, 1, true).translate(0, 0.09, 0.17), materials.shadeGlass, target, along, 2.08, 0);
    }
  }
}

/** Strips of wallpaper that came unstuck: flat at the top, curling into the room below. */
function addPeelingPaper(context: MansionBuildContext): void {
  const { wallpaper } = context.materials;
  const tile = wallpaper.userData.metersPerTile as number;
  const strips: ReadonlyArray<readonly [string, number, number, number]> = [
    ['start-west', 7.6, 3.0, 0.3],
    ['start-south', 0.6, 2.95, 0.26],
    ['start-north', 6.9, 2.95, 0.34],
    ['box-north', -1.0, 2.9, 0.28],
    ['hall-east', 0.7, 3.0, 0.3],
    ['box-west', -6.9, 2.95, 0.24],
    ['banquet-north', 3.6, 2.95, 0.3],
    ['banquet-south', -6.2, 3.0, 0.28],
  ];
  strips.forEach(([faceId, along, top, width], index) => {
    const target = face(faceId);
    const flat = 0.35 + (index % 3) * 0.08;
    const curl = 0.3 + (index % 2) * 0.12;
    const upper = new THREE.PlaneGeometry(width, flat).translate(0, -flat / 2, 0.006);
    const lower = new THREE.PlaneGeometry(width, curl).translate(0, -curl / 2, 0).rotateX(-0.55 - index * 0.06).translate(0, -flat, 0.006);
    for (const piece of [upper, lower]) {
      const uv = piece.getAttribute('uv') as THREE.BufferAttribute;
      for (let vertex = 0; vertex < uv.count; vertex++) uv.setXY(vertex, (uv.getX(vertex) * width + index * 0.37) / tile, (uv.getY(vertex) * flat + top) / tile);
      addOnFace(context, piece, wallpaper, target, along, top, 0);
    }
    // The curl shows its pale backing from below, 2 mm behind the printed side.
    const backing = new THREE.PlaneGeometry(width, curl).translate(0, -curl / 2, -0.002).rotateX(-0.55 - index * 0.06).translate(0, -flat, 0.006);
    addOnFace(context, backing, context.materials.paper, target, along, top, 0);
  });
}

/** Charred joists that fell through the ceiling, lying flat. */
function addFallenTimber(context: MansionBuildContext): void {
  const { batch, materials } = context;
  const beams: ReadonlyArray<readonly [number, number, number, number]> = [
    [2.6, 7.8, 1.7, 0.5],
    [6.6, 6.0, 1.3, -1.1],
    [-2.0, -6.6, 1.4, 0.3],
    [2.7, -0.7, 1.1, 1.3],
    [7.8, 0.5, 0.9, 0.2],
    [-5.6, -14.2, 1.5, 0.7],
  ];
  beams.forEach(([x, z, length, yaw], index) => {
    batch.addBox(materials.charredWood, x, 0.06, z, 0.13, 0.12, length, 0.02, yaw, index % 2 ? 0.08 : -0.06, index);
  });
}

function addRubbleAndLitter(context: MansionBuildContext): void {
  const { batch, materials } = context;
  const random = seededRandom(5303);
  // Plaster that dropped from the burnt-through ceiling.
  for (const [cx, cz] of [[-4.8, 4.4], [5.6, 8.4], [-2.6, -1.2], [2.9, -6.9], [7.6, 1.0], [-5.0, -9.4], [3.0, -14.6], [-5.6, -16.6]] as const) {
    for (let index = 0; index < 7; index++) {
      const size = 0.06 + random() * 0.16;
      batch.addBox(
        materials.rubble,
        cx + (random() - 0.5) * 1.1, size * 0.22, cz + (random() - 0.5) * 0.9,
        size * 1.3, Math.min(0.1, size * 0.45), size,
        random() * 0.4, random() * Math.PI, random() * 0.4,
      );
    }
  }
  // Letters and pages blown across the floors.
  for (let index = 0; index < 22; index++) {
    const inStartRoom = index < 13;
    const sheet = new THREE.PlaneGeometry(0.2 + random() * 0.1, 0.27 + random() * 0.06).rotateX(-Math.PI / 2).rotateY(random() * Math.PI * 2);
    sheet.translate(
      inStartRoom ? THREE.MathUtils.lerp(-6.4, 8.4, random()) : THREE.MathUtils.lerp(-6.4, 3.6, random()),
      0.003 + index * 0.0002,
      inStartRoom ? THREE.MathUtils.lerp(2.8, 9.4, random()) : THREE.MathUtils.lerp(-7.4, 1.2, random()),
    );
    batch.add(sheet, materials.paper);
  }
  // Books dropped from a shelf that no longer exists, near the east-hall cabinet.
  for (let index = 0; index < 6; index++) {
    batch.addBox(
      index % 2 ? materials.charredWood : materials.trimWood,
      1.0 + random() * 0.9, 0.025 + (index % 3) * 0.045, -6.6 + random() * 1.2,
      0.16, 0.04, 0.23,
      0, random() * Math.PI, 0,
    );
  }
}

function addFloorDecal(context: MansionBuildContext, material: THREE.Material, x: number, y: number, z: number, width: number, depth: number, yaw: number): void {
  const decal = new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2).rotateY(yaw);
  decal.translate(x, y, z);
  context.batch.add(decal, material);
}

function addFloorDecals(context: MansionBuildContext): void {
  const { floorScorch, ashDrift } = context.materials;
  // Burn marks under the worst of the ceiling damage.
  const scorches: ReadonlyArray<readonly [number, number, number, number]> = [
    [-3.7, 5.2, 2.8, 0.35], [6.2, 5.0, 1.8, 1.2], [-2.8, -3.6, 2.0, 2.1], [2.0, -4.0, 1.6, 0.6], [6.8, -1.8, 1.4, 2.6],
    [-1.5, -12.95, 3.4, 0.1], [2.4, -10.0, 1.5, 1.8], [2.9, -16.4, 1.3, 0.9],
  ];
  scorches.forEach(([x, z, size, yaw], index) => addFloorDecal(context, floorScorch, x, 0.004 + index * 0.0003, z, size, size * 0.8, yaw));
  // Ash drifted against the skirting and into the corners.
  const drifts: ReadonlyArray<readonly [number, number, number, number]> = [
    [-6.4, 9.3, 1.6, 0.4], [8.3, 2.8, 1.4, 1.2], [-6.3, -7.3, 1.5, 0.9], [-0.8, 1.3, 1.2, 0.2],
    [3.4, -7.4, 1.3, 1.9], [8.4, 1.3, 1.2, 0.6], [0.9, 9.4, 1.8, 0.1], [-6.4, 0.9, 1.1, 2.4],
    [-6.4, -17.1, 1.4, 0.5], [3.5, -8.8, 1.3, 1.4], [3.3, -12.0, 1.2, 1.6],
  ];
  drifts.forEach(([x, z, size, yaw], index) => addFloorDecal(context, ashDrift, x, 0.006 + index * 0.0003, z, size, size * 0.6, yaw));
  // Bunker: dust and grime where nobody has swept for decades.
  const bunkerFloor = MANSION_BUNKER_Y + 0.004;
  const grime: ReadonlyArray<readonly [number, number, number, number]> = [
    [-6.2, -8.7, 1.6, 0.4], [7.9, 1.1, 1.4, 1.0], [0.6, -8.8, 1.8, 2.2], [-6.2, 1.1, 1.3, 0.8], [4.6, -2.2, 1.5, 1.6],
  ];
  grime.forEach(([x, z, size, yaw], index) => addFloorDecal(context, ashDrift, x, bunkerFloor + index * 0.0003, z, size, size * 0.6, yaw));
}

/** The bunker mask the player can take down and wear; the other masks are static dressing. */
export interface MansionHookedGasMask {
  readonly object: THREE.Object3D;
  /** World centre of its eyepieces. */
  readonly position: THREE.Vector3;
}

/** Gas masks on their hooks, junction boxes with conduit, and paperwork left behind. */
function addBunkerProps(context: MansionBuildContext): MansionHookedGasMask {
  const { batch, materials } = context;
  const north = face('bunker-north');
  const maskMaterials = { rubber: materials.rubber, lens: materials.windowGlass, filter: materials.bunkerPaint };
  const hooks = [-2.6, -2.15, -1.7, -1.25];
  let wearable: MansionHookedGasMask | null = null;
  for (const [index, along] of hooks.entries()) {
    const height = 1.62 - (index % 2) * 0.04;
    addOnFace(context, new THREE.BoxGeometry(0.02, 0.02, 0.08).translate(0, 0.12, 0.04), materials.metal, north, along, height, 0);
    const placement = onFace(north, along, height, 0, index * 0.12 - 0.15);
    const mask = buildGasMaskModel(maskMaterials);
    // The last mask on the row is the one the player can wear: it stays a standalone object.
    if (index < hooks.length - 1) {
      for (const mesh of mask.children as THREE.Mesh[]) batch.add(mesh.geometry, mesh.material as THREE.Material, placement);
      continue;
    }
    placement.decompose(mask.position, mask.quaternion, mask.scale);
    mask.name = 'bunker-gas-mask';
    context.group.add(mask);
    wearable = { object: mask, position: GAS_MASK_LENS_CENTER.clone().applyMatrix4(placement) };
  }
  const junctions: ReadonlyArray<readonly [string, number]> = [['bunker-south', -4.2], ['bunker-north', 3.0], ['bunker-west', -7.6]];
  for (const [faceId, along] of junctions) {
    const target = face(faceId);
    const conduit = target.ceilingY - target.floorY - 2.0;
    addOnFace(context, new THREE.BoxGeometry(0.42, 0.55, 0.14).translate(0, 0, 0.07), materials.bunkerPaint, target, along, 1.7, 0);
    addOnFace(context, new THREE.BoxGeometry(0.05, 0.16, 0.05).translate(0.24, -0.05, 0.06), materials.metal, target, along, 1.7, 0);
    addOnFace(context, new THREE.CylinderGeometry(0.02, 0.02, conduit, 6).translate(0, 2.0 - 1.7 + conduit / 2 - 0.02, 0.05), materials.metal, target, along, 1.7, 0);
  }
  const random = seededRandom(5309);
  for (let index = 0; index < 12; index++) {
    const sheet = new THREE.PlaneGeometry(0.21, 0.29).rotateX(-Math.PI / 2).rotateY(random() * Math.PI * 2);
    sheet.translate(THREE.MathUtils.lerp(-6, 3.5, random()), MANSION_BUNKER_Y + 0.003 + index * 0.0002, THREE.MathUtils.lerp(-8.6, 1.2, random()));
    batch.add(sheet, materials.paper);
  }
  return wearable!;
}
