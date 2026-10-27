import * as THREE from 'three';
import { addSolidProxy } from '../shared/SolidProxy';
import { CONSIGNA_LOCKER, MILICIA, MILICIA_STAR_COLOR, station33RingLockersIn } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

const { hall } = MILICIA;
/** The red corner on the north wall, between the filing cabinets and the evidence chest. */
const RED_CORNER = { x: -14.2, bannerWidth: 2.8, bannerY: 2.75, starY: 1.75 } as const;
const CLOTH_TABLE = { width: 1.2, depth: 0.55, height: 0.8 } as const;
/** Flags in floor stands either side of the table, leaning back towards the wall. */
const FLAG_OFFSETS = [-1.6, 1.6] as const;
const FLAG = { poleHeight: 2.3, lean: 0.12, clothWidth: 0.85, clothHeight: 0.6 } as const;
/** Height of the ruby star above the Armour locker, over its evidence plate. */
const RUBY_STAR_Y = 2.95;

/**
 * The militia post's Soviet iconography: the red corner (slogan banner,
 * enamel star in relief, cloth-covered table and two flags) and the ruby
 * star over the Armour locker, a lightbox on the substation's `mains`
 * circuit that comes alive with the main switch, like the locker below it.
 * Generic stars and lettering only, no real emblems.
 */
export function buildMiliciaRedCorner(context: Station33BuildContext, lighting: Station33Lighting): void {
  addBanner(context);
  addWallStar(context);
  addClothTable(context);
  // Each flag's cloth hangs towards the table, framing the star.
  for (const offset of FLAG_OFFSETS) addFlag(context, RED_CORNER.x + offset, -Math.sign(offset));
  addRubyStars(context, lighting);
}

/** Flat five-pointed star in the XY plane, pointing up, `depth` thick along +Z. */
function starGeometry(outer: number, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  for (let index = 0; index < 10; index++) {
    const angle = Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? outer : outer * 0.4;
    if (index === 0) shape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    else shape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
}

/** Red baize hung under the cornice with the slogan plate on it and a gilt fringe. */
function addBanner(context: Station33BuildContext): void {
  const { batch, materials, signage } = context;
  const { x, bannerWidth, bannerY } = RED_CORNER;
  const height = 0.9;
  batch.addBox(materials.redCloth, x, bannerY, hall.minZ + 0.012, bannerWidth, height, 0.02);
  batch.addBox(materials.bronze, x, bannerY - height / 2 - 0.02, hall.minZ + 0.02, bannerWidth, 0.04, 0.02);
  batch.addBox(materials.bronze, x, bannerY + height / 2 + 0.02, hall.minZ + 0.025, bannerWidth + 0.2, 0.03, 0.05);
  batch.add(signage.signGeometry('serve-the-people', bannerWidth - 0.2, 0.55).translate(x, bannerY, hall.minZ + 0.024), signage.material);
}

/** Enamel star in relief on a gilt star, on the wall above the table. */
function addWallStar(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, starY } = RED_CORNER;
  batch.add(starGeometry(0.42, 0.03).translate(x, starY, hall.minZ), materials.bronze);
  batch.add(starGeometry(0.35, 0.03).translate(x, starY, hall.minZ + 0.03), materials.redEnamel);
}

/** Table under a red cloth that drops over its sides, with the post's record books on it. */
function addClothTable(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { width, depth, height } = CLOTH_TABLE;
  const x = RED_CORNER.x;
  const z = hall.minZ + 0.05 + depth / 2;
  const drop = 0.35;
  batch.addBox(materials.varnishedWood, x, (height - drop) / 2, z, width - 0.1, height - drop, depth - 0.1);
  batch.addBox(materials.redCloth, x, height - drop / 2, z, width + 0.04, drop, depth + 0.04);
  batch.addBox(materials.paper, x - 0.25, height + 0.03, z, 0.3, 0.06, 0.22, 0, 0.1, 0);
  batch.addBox(materials.redEnamel, x - 0.25, height + 0.075, z, 0.28, 0.03, 0.2, 0, 0.1, 0);
  batch.addBox(materials.paper, x + 0.25, height + 0.012, z + 0.02, 0.36, 0.024, 0.26, 0, -0.15, 0);
  addSolidProxy(context, 'red-corner-table', { x: x - width / 2 - 0.02, y: 0, z: hall.minZ }, { x: x + width / 2 + 0.02, y: height, z: z + depth / 2 + 0.02 }, 'wood');
}

/** Pole in a cast stand, leaning back to the wall, with a red flag towards `side` (±X) and a gilt star at the hoist. */
function addFlag(context: Station33BuildContext, x: number, side: number): void {
  const { batch, materials } = context;
  const { poleHeight, lean, clothWidth, clothHeight } = FLAG;
  const baseZ = hall.minZ + 0.45;
  batch.add(new THREE.CylinderGeometry(0.14, 0.17, 0.08, 14).translate(x, 0.04, baseZ), materials.greySteel);
  // Tilt about X towards the wall (-Z), so the pole's top rests near it.
  const pole = new THREE.Matrix4().makeRotationX(-lean).setPosition(x, 0.08, baseZ);
  const along = (height: number): THREE.Vector3 => new THREE.Vector3(0, height, 0).applyMatrix4(pole);
  const shaft = new THREE.CylinderGeometry(0.016, 0.016, poleHeight, 6).translate(0, poleHeight / 2, 0);
  batch.add(shaft, materials.varnishedWood, pole);
  const finial = along(poleHeight + 0.05);
  batch.add(new THREE.SphereGeometry(0.035, 8, 6).translate(finial.x, finial.y, finial.z), materials.bronze);
  const clothCenter = new THREE.Matrix4().makeTranslation(side * (clothWidth / 2 + 0.02), poleHeight - clothHeight / 2 - 0.08, 0).premultiply(pole);
  batch.add(new THREE.BoxGeometry(clothWidth, clothHeight, 0.008), materials.redCloth, clothCenter);
  const starAt = new THREE.Matrix4().makeTranslation(-side * (clothWidth / 2 - 0.13), clothHeight / 2 - 0.13, 0.005).premultiply(clothCenter);
  batch.add(starGeometry(0.07, 0.004), materials.bronze, starAt);
  addSolidProxy(context, 'flag-stand', { x: x - 0.17, y: 0, z: baseZ - 0.17 }, { x: x + 0.17, y: 0.6, z: baseZ + 0.17 }, 'metal');
}

/**
 * Ruby star lightbox on the wall above each ring locker of the post: a gilt
 * star frame with the glowing glass in front, dark until the mains are on.
 */
function addRubyStars(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  const glass = lighting.registerMaterial(new THREE.MeshBasicMaterial({ name: 'station33_milicia_ruby_star', color: MILICIA_STAR_COLOR }), 'mains');
  const back = CONSIGNA_LOCKER.depth;
  for (const locker of station33RingLockersIn('milicia')) {
    const yaw = Math.atan2(locker.facingX, locker.facingZ);
    const wallX = locker.x - locker.facingX * back;
    const wallZ = locker.z - locker.facingZ * back;
    const place = (geometry: THREE.BufferGeometry, out: number): THREE.BufferGeometry =>
      geometry.rotateY(yaw).translate(wallX + locker.facingX * out, RUBY_STAR_Y, wallZ + locker.facingZ * out);
    batch.add(place(starGeometry(0.3, 0.04), 0), materials.bronze);
    batch.add(place(starGeometry(0.25, 0.03), 0.04), glass);
  }
}
