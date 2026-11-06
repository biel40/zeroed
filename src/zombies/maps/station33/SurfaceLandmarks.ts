import * as THREE from 'three';
import { starGeometry } from '../../../rendering/StarGeometry';
import { seededRandom } from '../shared/ProceduralNoise';
import { placement } from '../shared/StaticMeshBatch';
import { PROTOCOL33_ROAD, PROTOCOL33_SURFACE_Y } from '../Station33Config';
import { addIcicles, addSnowCap, addSnowDrift } from './SnowCover';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

const GROUND = PROTOCOL33_SURFACE_Y;
/** The propaganda billboard east of the yard, its face turned west over the fence. */
const BILLBOARD = { x: 32.5, z: -90, width: 7, height: 3.2, bottom: 2.6 } as const;
/** The war memorial across the wasteland north-west of the gate, its front to the yard. */
const MEMORIAL = { x: 6, z: -124, obelisk: 10 } as const;
/** A concrete bus shelter on the road's east verge, open to the road. */
const BUS_STOP = { x: PROTOCOL33_ROAD.x + PROTOCOL33_ROAD.width / 2 + 1.8, z: -136, width: 4.2, height: 2.5 } as const;
/** The district heating plant behind the western blocks: two striped chimneys and a cooling tower. */
const CHIMNEYS: ReadonlyArray<{ readonly x: number; readonly z: number; readonly height: number }> = [
  { x: -16, z: -142, height: 66 },
  { x: -7, z: -148, height: 58 },
];
const COOLING_TOWER = { x: -36, z: -152, height: 34, waist: 9, base: 13 } as const;
const CHIMNEY_BAND = 6;

/** Ground each landmark keeps clear of the birches: centre and radius. */
export const SURFACE_LANDMARK_CLEARINGS: ReadonlyArray<{ readonly x: number; readonly z: number; readonly radius: number }> = [
  { x: BILLBOARD.x, z: BILLBOARD.z, radius: BILLBOARD.width / 2 + 1.5 },
  { x: MEMORIAL.x, z: MEMORIAL.z, radius: 5 },
  { x: BUS_STOP.x, z: BUS_STOP.z, radius: BUS_STOP.width / 2 + 1.5 },
  ...CHIMNEYS.map(({ x, z }) => ({ x, z, radius: 4 })),
  { x: COOLING_TOWER.x, z: COOLING_TOWER.z, radius: COOLING_TOWER.base + 2 },
];

/**
 * The Soviet town around the station, visual only and all beyond the
 * fence: a propaganda billboard with a star and rays over the east fence,
 * a war memorial obelisk with its dead eternal flame, a bus shelter with a
 * tile mosaic on the road, and the striped chimneys and cooling tower of a
 * heating plant on the skyline. Snow on all of it; no real emblems or
 * slogans.
 */
export function buildSurfaceLandmarks(context: Station33BuildContext, lighting: Station33Lighting): void {
  buildBillboard(context);
  buildMemorial(context);
  buildBusStop(context);
  buildHeatingPlant(context, lighting);
}

/** A steel-framed poster on two legs, faded red with a white star, rays and an unreadable slogan band, peeling at one corner. */
function buildBillboard(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z, width, height, bottom } = BILLBOARD;
  const centreY = GROUND + bottom + height / 2;
  const top = GROUND + bottom + height;
  for (const side of [-1, 1]) {
    const legZ = z + side * (width / 2 - 0.9);
    batch.addBox(materials.greySteel, x + 0.15, (GROUND + top) / 2, legZ, 0.22, top - GROUND, 0.22);
    batch.addBox(materials.greySteel, x + 0.95, GROUND + bottom * 0.45, legZ, 0.1, bottom * 1.05, 0.1, 0, 0, 0.42);
    addSnowDrift(batch, materials.snow, x + 0.3, GROUND, legZ, 1.4, 1.1, 0.4);
  }
  batch.addBox(materials.greySteel, x + 0.06, centreY, z, 0.1, height + 0.24, width + 0.24);
  batch.add(new THREE.PlaneGeometry(width, height).rotateY(-Math.PI / 2), materials.redCloth, placement(x - 0.005, centreY, z));
  // The star at the left of the face (the viewer looks east) and its rays fanning right.
  const starZ = z - width / 2 + 1.5;
  const starY = centreY + 0.3;
  batch.add(starGeometry(0.85, 0.34, 0.03).rotateY(Math.PI / 2), materials.stucco, placement(x - 0.03, starY, starZ));
  [-0.42, -0.2, 0.02, 0.24].forEach((angle, index) => {
    const length = 3.2 + index * 0.35;
    const reach = 1.0 + length / 2;
    batch.addBox(materials.stucco, x - 0.02, starY - Math.sin(angle) * reach, starZ + Math.cos(angle) * reach, 0.01, 0.09, length, angle, 0, 0);
  });
  // A cream band along the foot carrying a row of red block letters nobody can read any more.
  const bandY = GROUND + bottom + 0.38;
  batch.addBox(materials.stucco, x - 0.015, bandY, z, 0.01, 0.5, width - 0.3);
  const random = seededRandom(3871);
  for (let along = z - width / 2 + 0.4; along < z + width / 2 - 0.5;) {
    const letter = 0.12 + random() * 0.16;
    if (random() > 0.18) batch.addBox(materials.redEnamel, x - 0.025, bandY, along + letter / 2, 0.01, 0.3, letter);
    along += letter + 0.06 + (random() < 0.15 ? 0.22 : 0);
  }
  // Sheets peeling off the lower right corner.
  for (let sheet = 0; sheet < 3; sheet++) {
    const peel = new THREE.PlaneGeometry(0.8, 0.9).translate(0, -0.45, 0).rotateY(-Math.PI / 2);
    batch.add(peel, materials.paper, placement(x - 0.04 - sheet * 0.05, GROUND + bottom + 0.9 - sheet * 0.15, z + width / 2 - 0.6 - sheet * 0.7, 0, 0, -(0.35 + sheet * 0.25)));
  }
  // The service walkway under it and two dead floodlights over it, all snowed on.
  batch.addBox(materials.greySteel, x - 0.25, GROUND + bottom - 0.12, z, 0.6, 0.05, width);
  addSnowCap(batch, materials.snow, x - 0.25, GROUND + bottom - 0.1, z, 0.6, width, 0, 0.06);
  addSnowCap(batch, materials.snow, x + 0.06, top + 0.12, z, 0.14, width + 0.24, 0, 0.08);
  for (const side of [-1, 1]) {
    const lampZ = z + side * width / 4;
    batch.addBox(materials.greySteel, x - 0.4, top + 0.25, lampZ, 0.9, 0.05, 0.05);
    batch.addBox(materials.greySteel, x - 0.85, top + 0.18, lampZ, 0.26, 0.16, 0.36, 0, 0, -0.5);
  }
}

/** Three snowed-on steps, a tapering granite obelisk under a red star, a bronze plaque, wreaths and a cold flame bowl. */
function buildMemorial(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z, obelisk } = MEMORIAL;
  const step = 0.35;
  [5, 4, 3].forEach((size, level) => {
    const y = GROUND + step * (level + 0.5);
    batch.addBox(materials.serviceConcrete, x, y, z, size, step, size, 0, 0, 0, 3881 + level);
    addSnowCap(batch, materials.snow, x, y + step / 2, z, size, size, 0, 0.05);
  });
  const base = GROUND + step * 3;
  batch.add(new THREE.CylinderGeometry(0.42, 0.75, obelisk, 4).rotateY(Math.PI / 4), materials.darkGranite, placement(x, base + obelisk / 2, z));
  // A star on each axis, so it reads from the yard and from the road.
  const starY = base + obelisk + 0.62;
  batch.add(starGeometry(0.62, 0.25, 0.12), materials.redEnamel, placement(x, starY, z));
  batch.add(starGeometry(0.62, 0.25, 0.12).rotateY(Math.PI / 2), materials.redEnamel, placement(x, starY, z));
  // Distance from the axis to the obelisk's front face at the plaque's height.
  const face = THREE.MathUtils.lerp(0.75, 0.42, 1.4 / obelisk) * Math.SQRT1_2;
  batch.addBox(materials.bronze, x, base + 1.4, z + face + 0.015, 0.62, 0.8, 0.03, -0.02, 0, 0);
  // The eternal flame long gone out: a bronze star bowl full of ice on the lowest step.
  const bowl = { y: GROUND + step, z: z + 2.2 };
  batch.add(starGeometry(0.5, 0.22, 0.08).rotateX(-Math.PI / 2), materials.bronze, placement(x, bowl.y + 0.04, bowl.z));
  batch.add(new THREE.CircleGeometry(0.2, 10).rotateX(-Math.PI / 2), materials.iceGlaze, placement(x, bowl.y + 0.085, bowl.z));
  for (const side of [-1, 1]) {
    const wreath = new THREE.TorusGeometry(0.36, 0.07, 6, 16);
    batch.add(wreath, materials.varnishedWood, placement(x + side * 0.5, base + 0.38, z + face + 0.12, -0.25, 0, 0));
    batch.addBox(materials.redCloth, x + side * 0.5, base + 0.08, z + face + 0.18, 0.12, 0.3, 0.02, -0.25, 0, 0);
  }
  addSnowDrift(batch, materials.snow, x - 2.4, GROUND, z + 1.2, 2.4, 1.6, 0.55, 1.2);
}

/** Concrete shelter with a mosaic on its back wall, a sloping roof hung with icicles, a bench and a stop sign without words. */
function buildBusStop(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const { x, z, width, height } = BUS_STOP;
  batch.addBox(materials.serviceConcrete, x + 0.9, GROUND + height / 2, z, 0.18, height, width, 0, 0, 0, 3891);
  for (const side of [-1, 1]) batch.addBox(materials.serviceConcrete, x + 0.25, GROUND + (height - 0.2) / 2, z + side * (width / 2 - 0.07), 1.3, height - 0.2, 0.14);
  // The mosaic: rings of red, cream, blue and bronze tiles around a rising sun.
  const palette = [materials.redEnamel, materials.stucco, materials.carriagePaint, materials.bronze];
  const tile = 0.46;
  const columns = Math.floor((width - 0.4) / tile);
  const rows = Math.floor((height - 0.5) / tile);
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < rows; row++) {
      const tz = z - (columns - 1) * tile / 2 + column * tile;
      const ty = GROUND + 0.35 + tile / 2 + row * tile;
      const ring = Math.floor(Math.hypot(column - (columns - 1) / 2, row) * 0.9);
      batch.add(new THREE.PlaneGeometry(tile - 0.03, tile - 0.03).rotateY(-Math.PI / 2), palette[ring % palette.length], placement(x + 0.8, ty, tz));
    }
  }
  const roofTilt = 0.07;
  batch.addBox(materials.serviceConcrete, x + 0.1, GROUND + height + 0.1, z, 2.3, 0.18, width + 0.6, 0, 0, roofTilt);
  batch.addBox(materials.snow, x + 0.1, GROUND + height + 0.24, z, 2.2, 0.1, width + 0.5, 0, 0, roofTilt);
  const front = x + 0.1 - 1.15;
  addIcicles(batch, materials.iceGlaze, { x: front, z: z - width / 2 - 0.3 }, { x: front, z: z + width / 2 + 0.3 }, GROUND + height + 0.01 - Math.sin(roofTilt) * 1.15, 0.18, 0.5, seededRandom(3893));
  // Bench with snow on its seat.
  batch.addBox(materials.varnishedWood, x + 0.5, GROUND + 0.45, z, 0.42, 0.06, width - 0.6);
  addSnowCap(batch, materials.snow, x + 0.5, GROUND + 0.48, z, 0.42, width - 0.6, 0, 0.05);
  for (const end of [-1, 1]) batch.addBox(materials.greySteel, x + 0.5, GROUND + 0.22, z + end * (width / 2 - 0.5), 0.36, 0.44, 0.06);
  // The stop sign: a plain plate on a pole at the kerb.
  const pole = { x: x - 1.2, z: z + width / 2 + 0.9 };
  batch.add(new THREE.CylinderGeometry(0.04, 0.04, 2.7, 8), materials.greySteel, placement(pole.x, GROUND + 1.35, pole.z));
  batch.add(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 18).rotateZ(Math.PI / 2), materials.hazardPaint, placement(pole.x, GROUND + 2.55, pole.z));
  addSnowDrift(batch, materials.snow, x + 1.4, GROUND, z, width + 0.8, 1.3, 0.7, Math.PI / 2);
}

/** Two red-and-white banded chimneys with blinking aviation lamps and a cooling tower, silhouettes in the fog. */
function buildHeatingPlant(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { batch, materials } = context;
  const lamp = lighting.circuitMaterial('emergency');
  for (const { x, z, height } of CHIMNEYS) {
    const bands = Math.ceil(height / CHIMNEY_BAND);
    const radiusAt = (y: number): number => THREE.MathUtils.lerp(2.4, 1.5, y / height);
    for (let band = 0; band < bands; band++) {
      const from = band * CHIMNEY_BAND;
      const to = Math.min(height, from + CHIMNEY_BAND);
      const geometry = new THREE.CylinderGeometry(radiusAt(to), radiusAt(from), to - from, 14, 1, true);
      batch.add(geometry, band % 2 === 0 ? materials.stucco : materials.redEnamel, placement(x, GROUND + (from + to) / 2, z));
    }
    batch.add(new THREE.TorusGeometry(1.5, 0.12, 4, 14).rotateX(Math.PI / 2), materials.greySteel, placement(x, GROUND + height, z));
    for (const y of [height * 0.55, height + 0.3]) {
      for (const side of [-1, 1]) batch.add(new THREE.SphereGeometry(0.35, 8, 6), lamp, placement(x + side * (radiusAt(Math.min(y, height)) + 0.2), GROUND + y, z));
    }
  }
  // The cooling tower: a hyperboloid shell, widest at its foot, narrowest two thirds up.
  const { x, z, height, waist, base } = COOLING_TOWER;
  const profile: THREE.Vector2[] = [];
  const throat = height * 0.7;
  for (let index = 0; index <= 12; index++) {
    const y = (index / 12) * height;
    const spread = (y - throat) / throat;
    profile.push(new THREE.Vector2(waist + (base - waist) * spread * spread * (y < throat ? 1 : 0.35), y));
  }
  batch.add(new THREE.LatheGeometry(profile, 24), materials.serviceConcrete, placement(x, GROUND, z));
}
