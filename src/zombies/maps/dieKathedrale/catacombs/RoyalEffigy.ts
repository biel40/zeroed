import * as THREE from 'three';
import type { RoyalEffigy } from '../../DieKathedraleCatacombsConfig';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';

/**
 * A monarch carved lying on a tomb lid: cushion, crowned head, a robe that
 * widens to the feet, hands and their attribute, a beast at the feet. Built
 * in the effigy's own frame (x across, y up from the lid, z along the body
 * with the head at -z) and placed by `matrix`. Each kind changes the crown,
 * the robe and what the hands hold, so no two tombs read alike.
 */

interface EffigyStyle {
  readonly fleurons: number;
  /** Shoulder and hem radius of the robe. */
  readonly robe: readonly [number, number];
  readonly veil: boolean;
  /** At the feet: a lion, or the queen's small hound. */
  readonly beast: 'lion' | 'hound';
}

const STYLES: Readonly<Record<Exclude<RoyalEffigy, 'empty'>, EffigyStyle>> = {
  swordKing: { fleurons: 4, robe: [0.25, 0.33], veil: false, beast: 'lion' },
  sceptreKing: { fleurons: 5, robe: [0.24, 0.36], veil: false, beast: 'lion' },
  queen: { fleurons: 6, robe: [0.21, 0.31], veil: true, beast: 'hound' },
};

/** Where the head lies on the lid, from its middle: the beast at the feet ends short of the other end. */
const HEAD_Z = -0.86;

export function addEffigy(context: DieKathedraleBuildContext, kind: Exclude<RoyalEffigy, 'empty'>, matrix: THREE.Matrix4): void {
  const { batch, materials } = context;
  const style = STYLES[kind];
  const stone = materials.effigyMarble;
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material = stone): void => batch.add(geometry, material, matrix);
  // Cushion under the head, set a little askew.
  add(new THREE.BoxGeometry(0.52, 0.09, 0.36).rotateY(0.05).translate(0, 0.05, HEAD_Z - 0.04));
  add(new THREE.SphereGeometry(0.12, 9, 7).scale(0.95, 0.85, 1.1).translate(0, 0.21, HEAD_Z));
  addCrown(add, style.fleurons);
  if (style.veil) {
    // The veil falls from the crown either side of the face onto the cushion.
    for (const side of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.2, 0.3).rotateZ(side * 0.2).translate(side * 0.13, 0.17, HEAD_Z + 0.06));
  }
  // The robe lies along the body, widening to the hem, flattened by the weight of stone.
  const robeLength = 1.42;
  const robe = new THREE.CylinderGeometry(style.robe[0], style.robe[1], robeLength, 10, 1).rotateX(Math.PI / 2).scale(1, 0.56, 1);
  add(robe.translate(0, 0.17, HEAD_Z + 0.18 + robeLength / 2));
  // Folds of the mantle down both sides.
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, 0.12, robeLength * 0.92).rotateY(side * 0.035).translate(side * (style.robe[1] - 0.04), 0.1, HEAD_Z + 0.2 + robeLength / 2));
  }
  addAttribute(add, kind, materials);
  addBeast(add, style.beast);
}

function addCrown(add: (geometry: THREE.BufferGeometry, material?: THREE.Material) => void, fleurons: number): void {
  // Lying down, the circlet's axis runs along the body.
  add(new THREE.CylinderGeometry(0.125, 0.12, 0.07, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0.22, HEAD_Z - 0.09));
  for (let point = 0; point < fleurons; point++) {
    const angle = (point / fleurons) * Math.PI * 2;
    const leaf = new THREE.ConeGeometry(0.03, 0.08, 4).rotateX(-Math.PI / 2)
      .translate(Math.cos(angle) * 0.12, 0.22 + Math.sin(angle) * 0.12 * 0.85, HEAD_Z - 0.16);
    add(leaf);
  }
}

/** What the hands hold on the breast: a sword the length of the body, a sceptre and orb, or a book. */
function addAttribute(
  add: (geometry: THREE.BufferGeometry, material?: THREE.Material) => void,
  kind: Exclude<RoyalEffigy, 'empty'>,
  materials: DieKathedraleBuildContext['materials'],
): void {
  const chestZ = HEAD_Z + 0.42;
  const top = 0.31;
  if (kind === 'swordKing') {
    add(new THREE.BoxGeometry(0.055, 0.025, 0.92).translate(0, top + 0.01, chestZ + 0.55));
    add(new THREE.BoxGeometry(0.3, 0.035, 0.045).translate(0, top + 0.02, chestZ + 0.06));
    add(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 6).rotateX(Math.PI / 2).translate(0, top + 0.02, chestZ - 0.04));
    add(new THREE.SphereGeometry(0.035, 6, 5).translate(0, top + 0.02, chestZ - 0.13));
    // Hands crossed on the grip.
    for (const side of [-1, 1]) add(new THREE.SphereGeometry(0.05, 6, 5).scale(1.2, 0.7, 1).translate(side * 0.04, top + 0.03, chestZ - 0.02 + side * 0.04));
    return;
  }
  if (kind === 'sceptreKing') {
    const sceptre = new THREE.CylinderGeometry(0.018, 0.018, 0.78, 6).rotateX(Math.PI / 2).rotateY(0.16);
    add(sceptre.translate(-0.07, top, chestZ + 0.22));
    add(new THREE.ConeGeometry(0.045, 0.1, 5).rotateX(-Math.PI / 2).translate(-0.13, top, chestZ - 0.18));
    add(new THREE.SphereGeometry(0.07, 8, 6).translate(0.1, top + 0.03, chestZ + 0.08));
    add(new THREE.BoxGeometry(0.014, 0.09, 0.014).translate(0.1, top + 0.13, chestZ + 0.08));
    for (const side of [-1, 1]) add(new THREE.SphereGeometry(0.05, 6, 5).scale(1.2, 0.7, 1).translate(side * 0.1, top + 0.02, chestZ + 0.12));
    return;
  }
  // The queen: a closed book held to the breast, its clasp still bright.
  add(new THREE.BoxGeometry(0.24, 0.06, 0.3).rotateY(0.08).translate(0, top + 0.02, chestZ + 0.12));
  add(new THREE.BoxGeometry(0.04, 0.02, 0.06).translate(0.11, top + 0.05, chestZ + 0.12), materials.gilt);
  for (const side of [-1, 1]) add(new THREE.SphereGeometry(0.045, 6, 5).scale(1, 0.7, 1.3).translate(side * 0.13, top + 0.03, chestZ + 0.12));
}

/** The beast the feet rest on: a crouching lion, or the queen's small hound. */
function addBeast(add: (geometry: THREE.BufferGeometry) => void, beast: EffigyStyle['beast']): void {
  const z = HEAD_Z + 1.78;
  if (beast === 'lion') {
    add(new THREE.BoxGeometry(0.42, 0.2, 0.32).translate(0, 0.12, z));
    add(new THREE.SphereGeometry(0.13, 8, 6).scale(1, 0.95, 0.9).translate(0, 0.2, z + 0.17));
    add(new THREE.TorusGeometry(0.11, 0.04, 5, 10).translate(0, 0.2, z + 0.12));
    return;
  }
  add(new THREE.BoxGeometry(0.3, 0.14, 0.24).translate(0, 0.09, z - 0.03));
  add(new THREE.SphereGeometry(0.08, 7, 5).scale(0.9, 0.9, 1.2).translate(0.06, 0.14, z + 0.1));
}
