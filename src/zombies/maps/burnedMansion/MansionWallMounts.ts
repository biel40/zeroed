import * as THREE from 'three';
import type { MansionBuildContext } from './MansionBuildContext';
import { MANSION_BUNKER_FACES, MANSION_GROUND_FACES, type MansionWallFace } from './MansionLayout';

/** Placing dressing flush on the mansion's wall faces: lookup, face-local matrices and framed pictures. */

const FACES = new Map([...MANSION_GROUND_FACES, ...MANSION_BUNKER_FACES].map((face) => [face.id, face]));

export function mansionWallFace(id: string): MansionWallFace {
  const found = FACES.get(id);
  if (!found) throw new Error(`Unknown mansion wall face ${id}`);
  return found;
}

/**
 * World matrix of a point on a face: `along` the face, `height` above its
 * floor, `offset` proud of the wall, local +z facing the room and `tilt`
 * turning it about that normal.
 */
export function onFace(target: MansionWallFace, along: number, height: number, offset: number, tilt = 0): THREE.Matrix4 {
  const yaw = target.axis === 'x' ? (target.inward > 0 ? 0 : Math.PI) : target.inward > 0 ? Math.PI / 2 : -Math.PI / 2;
  const across = target.plane + target.inward * offset;
  const x = target.axis === 'x' ? along : across;
  const z = target.axis === 'x' ? across : along;
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, target.floorY + height, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, tilt, 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
}

export function addOnFace(context: MansionBuildContext, geometry: THREE.BufferGeometry, material: THREE.Material, target: MansionWallFace, along: number, height: number, offset: number, tilt = 0): void {
  context.batch.add(geometry, material, onFace(target, along, height, offset, tilt));
}

/** Gilt frame of `width` x `tall` (outer) and `border` around a picture plane, built in face-local space. */
export function addFramedPicture(
  context: MansionBuildContext,
  target: MansionWallFace,
  along: number,
  height: number,
  width: number,
  tall: number,
  picture: THREE.Material,
  tilt: number,
  border = 0.07,
): void {
  const frame = (x: number, y: number, sizeX: number, sizeY: number): void => {
    const geometry = new THREE.BoxGeometry(sizeX, sizeY, 0.045).translate(x, y, 0.0225);
    addOnFace(context, geometry, context.materials.gilt, target, along, height, 0.004, tilt);
  };
  frame(0, tall / 2 - border / 2, width, border);
  frame(0, -tall / 2 + border / 2, width, border);
  frame(-width / 2 + border / 2, 0, border, tall - border * 2);
  frame(width / 2 - border / 2, 0, border, tall - border * 2);
  const canvas = new THREE.PlaneGeometry(width - border * 2 + 0.01, tall - border * 2 + 0.01).translate(0, 0, 0.012);
  addOnFace(context, canvas, picture, target, along, height, 0.004, tilt);
}
