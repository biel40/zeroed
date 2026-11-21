import * as THREE from 'three';
import { DIE_KATHEDRALE_WALL_THICKNESS } from '../../DieKathedraleConfig';
import { EXTERIOR_AREAS } from '../../DieKathedraleExteriorConfig';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';

const WALL_X = EXTERIOR_AREAS.sidePassage.maxX - DIE_KATHEDRALE_WALL_THICKNESS / 2;
const BAR = { x: WALL_X - 0.64, y: 4.06, z: -5.15, width: 1.65 } as const;
const CLOTH_WIDTH = 1.44;
const HEM = [1.37, 1.54, 1.92, 1.77, 1.99, 1.81, 1.58, 1.18, 1.35] as const;

/** A torn processional banner hung from the Palau wall above head height. */
export class PalauBanner {
  private readonly cloth: THREE.Mesh;
  private readonly reducedEffects: boolean;
  private time = 0;

  public constructor(context: DieKathedraleBuildContext) {
    const { batch, materials, group, profile } = context;
    this.reducedEffects = profile.useReducedEffects;
    for (const side of [-1, 1]) {
      const z = BAR.z + side * 0.69;
      // The wall ends below the bar. Uprights carry it from the coping.
      batch.addBox(materials.iron, WALL_X + 0.1, 3.37, z, 0.07, 1.44, 0.07);
      batch.addBox(materials.iron, (WALL_X + 0.1 + BAR.x) / 2, BAR.y, z, 0.78, 0.055, 0.055);
      batch.add(new THREE.SphereGeometry(0.062, 6, 4).translate(BAR.x, BAR.y, BAR.z + side * BAR.width / 2), materials.gilt);
    }
    batch.addBox(materials.iron, BAR.x, BAR.y, BAR.z, 0.05, 0.055, BAR.width);

    const columns = HEM.length;
    const geometry = new THREE.PlaneGeometry(CLOTH_WIDTH, 1, columns - 1, 5).translate(0, -0.5, 0);
    const positions = geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      const down = -positions.getY(index);
      positions.setY(index, -down * HEM[index % columns]);
      positions.setZ(index, down * 0.105 * Math.sin(positions.getX(index) * 12));
    }
    geometry.computeVertexNormals();
    this.cloth = new THREE.Mesh(geometry, materials.redCloth);
    this.cloth.name = 'die-kathedrale-palau-banner';
    this.cloth.position.set(BAR.x, BAR.y, BAR.z);
    this.cloth.rotation.set(0, -Math.PI / 2, 0, 'YXZ');
    group.add(this.cloth);
    this.reset();
  }

  public update(dt: number): void {
    if (this.reducedEffects) return;
    this.time += Math.max(0, dt);
    this.cloth.rotation.x = 0.12 + 0.09 * Math.sin(this.time * 1.65) + 0.03 * Math.sin(this.time * 4.2);
  }

  public reset(): void {
    this.time = 0;
    this.cloth.rotation.x = 0.12;
  }
}
