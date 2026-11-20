import * as THREE from 'three';
import {
  CATACOMB_FLOOR_Y,
  SANCTUARY,
  SANCTUARY_INSCRIBED_STEPS,
  SANCTUARY_OPENINGS,
  SANCTUARY_PEDESTAL,
} from '../../DieKathedraleCatacombsConfig';
import { seededRandom } from '../../shared/ProceduralNoise';
import { addSolidProxy } from '../../shared/SolidProxy';
import { placement } from '../../shared/StaticMeshBatch';
import type { DieKathedraleBuildContext } from '../DieKathedraleBuildContext';
import { pointedArch, ribGeometries } from '../GothicVault';
import { addFloorStain, addRubble } from './CatacombDecor';

const FLOOR = CATACOMB_FLOOR_Y;
const { x: CX, z: CZ, radius: R, springY, apexY } = SANCTUARY;
const FACETS = 24;
const FACET_ANGLE = Math.PI * 2 / FACETS;
const WALL_DEPTH = 0.3;
/** Height a body needs blocking: the player's wall box and the horde's band. */
const BLOCK_HEIGHT = 2.05;
const DOME_SEGMENTS = 8;
const RUNE_RING = { radius: 3.4, count: 28 } as const;

/** Unit direction of compass `angle` (0 east, PI / 2 south) on the floor plane. */
function direction(angle: number): { x: number; z: number } {
  return { x: Math.cos(angle), z: Math.sin(angle) };
}

/** Smallest angle between two compass angles. */
function angleGap(a: number, b: number): number {
  const gap = Math.abs(((a - b) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
  return gap;
}

/**
 * The sanctuary of the last breath: a round chamber of the same masonry,
 * engaged shafts under a ribbed dome, a ring of worn runes in the floor
 * round a stepped pedestal with an empty cup, rock fallen from the dome
 * heaped against the north wall, and the wind's cold light in the runes and
 * the boss of the dome. The round wall is drawn; the bodies are stopped by
 * the square it stands in and by stepped masonry hidden behind the rubble
 * where the circle curves away from that square.
 */
export function buildWindSanctuary(context: DieKathedraleBuildContext): void {
  const random = seededRandom(7501);
  addCurvedWall(context);
  addStepSolids(context);
  addDome(context);
  addPedestal(context);
  addRunes(context, random);
  addCollapse(context, random);
}

/** Facets of the round wall with their edges on multiples of a facet's angle, each passage framed by jambs and a lintel. */
function addCurvedWall(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const chord = 2 * R * Math.sin(FACET_ANGLE / 2) + 0.06;
  const facetRadius = R * Math.cos(FACET_ANGLE / 2) + WALL_DEPTH / 2;
  for (let facet = 0; facet < FACETS; facet++) {
    const angle = (facet + 0.5) * FACET_ANGLE;
    const opening = SANCTUARY_OPENINGS.find((candidate) => angleGap(candidate.angle, angle) < FACET_ANGLE);
    const bottom = opening ? opening.top : 0;
    const { x, z } = direction(angle);
    const yaw = Math.atan2(x, z);
    batch.addBox(materials.cryptStone, CX + x * facetRadius, FLOOR + (bottom + springY) / 2, CZ + z * facetRadius, chord, springY - bottom, WALL_DEPTH, 0, yaw, 0, facet);
  }
  for (const opening of SANCTUARY_OPENINGS) {
    const { x: dx, z: dz } = direction(opening.angle);
    const gapHalf = R * Math.sin(FACET_ANGLE);
    // Jambs from the mouth of the passage out to where the facets stop, in dressed stone.
    for (const side of [-1, 1]) {
      const across = side * (opening.halfWidth + gapHalf) / 2;
      const width = gapHalf - opening.halfWidth + 0.05;
      const out = R * Math.cos(FACET_ANGLE) + 0.1;
      const centerX = CX + dx * out - dz * across;
      const centerZ = CZ + dz * out + dx * across;
      const sizeX = Math.abs(dx) > 0.5 ? 0.6 : width;
      const sizeZ = Math.abs(dx) > 0.5 ? width : 0.6;
      batch.addBox(materials.dressedStone, centerX, FLOOR + springY / 2, centerZ, sizeX, springY, sizeZ, 0, 0, 0, side);
    }
  }
  // Engaged shafts between the passages, carrying the dome's ribs.
  for (let shaft = 0; shaft < DOME_SEGMENTS; shaft++) {
    const angle = (shaft + 0.5) * Math.PI * 2 / DOME_SEGMENTS;
    const { x, z } = direction(angle);
    batch.add(new THREE.CylinderGeometry(0.2, 0.24, springY, 10).translate(CX + x * (R + 0.05), FLOOR + springY / 2, CZ + z * (R + 0.05)), materials.dressedStone);
    batch.addBox(materials.dressedStone, CX + x * (R - 0.02), FLOOR + springY - 0.12, CZ + z * (R - 0.02), 0.6, 0.24, 0.6, 0, Math.atan2(x, z), 0, shaft);
  }
}

/** A rectangle on the floor plane. */
interface FloorBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Where the circle curves away from its square, stepped masonry stops the
 * player and the horde inside the round wall. The walkable floor is the
 * union of the rectangles inscribed at `SANCTUARY_INSCRIBED_STEPS`; in each
 * quarter the masonry fills the staircase outside it, column by column,
 * and a strip at each compass point is split round the passages.
 */
export function sanctuaryStepBoxes(): FloorBox[] {
  const steps = SANCTUARY_INSCRIBED_STEPS;
  const boxes: FloorBox[] = [];
  const quarter = (sx: number, sz: number, fromX: number, toX: number, fromZ: number): void => {
    const xs = [CX + sx * fromX * R, CX + sx * toX * R];
    const zs = [CZ + sz * fromZ * R, CZ + sz * R];
    boxes.push({ minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
  };
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Beyond the widest step nothing is inscribed but the cardinal strip; between two steps, what lies above the wider one.
      quarter(sx, sz, steps[0][0], 1, steps[0][1]);
      for (let step = 1; step < steps.length; step++) quarter(sx, sz, steps[step][0], steps[step - 1][0], steps[step - 1][1]);
    }
  }
  const [c1, s1] = steps[0];
  // The strips at the compass points, from the widest step out to the square, open where a passage comes in.
  const strip = (angle: number, halfSpan: number): void => {
    const { x: dx, z: dz } = direction(angle);
    const opening = SANCTUARY_OPENINGS.find((candidate) => angleGap(candidate.angle, angle) < 1e-6);
    const pieces: Array<readonly [number, number]> = opening
      ? [[-halfSpan, -opening.halfWidth], [opening.halfWidth, halfSpan]]
      : [[-halfSpan, halfSpan]];
    for (const [from, to] of pieces) {
      const near = c1 * R;
      const xs = [CX + dx * near - dz * from, CX + dx * R - dz * to];
      const zs = [CZ + dz * near + dx * from, CZ + dz * R + dx * to];
      boxes.push({ minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) });
    }
  };
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) strip(angle, s1 * R);
  return boxes;
}

function addStepSolids(context: DieKathedraleBuildContext): void {
  for (const [index, box] of sanctuaryStepBoxes().entries()) {
    addSolidProxy(context, `sanctuary-step-${index}`, { x: box.minX, y: FLOOR, z: box.minZ }, { x: box.maxX, y: FLOOR + BLOCK_HEIGHT, z: box.maxZ }, 'concrete', 'none');
  }
}

/** A pointed dome turned on the round wall, facing down, with ribs from every shaft to a carved boss. */
function addDome(context: DieKathedraleBuildContext): void {
  const { batch, materials, structure, group } = context;
  const rise = apexY - springY;
  const profile: THREE.Vector2[] = [];
  const rings = 8;
  for (let ring = 0; ring <= rings; ring++) {
    const s = ring / rings;
    profile.push(new THREE.Vector2(R * (1 - s) + 0.001, FLOOR + springY + rise * pointedArch(1 - s)));
  }
  const geometry = new THREE.LatheGeometry(profile, FACETS * 2);
  flipFaces(geometry);
  geometry.translate(CX, 0, CZ);
  const tile = materials.cryptStone.userData.metersPerTile as number;
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const position = geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let index = 0; index < uv.count; index++) uv.setXY(index, position.getX(index) / tile, position.getZ(index) / tile);
  const dome = new THREE.Mesh(geometry, materials.cryptStone);
  dome.name = 'catacomb-sanctuary-dome';
  dome.userData.surface = 'concrete';
  dome.userData.mapRole = 'ceiling';
  dome.userData.stainFaces = 'none';
  group.add(dome);
  structure.addSolid(dome, false);

  for (let rib = 0; rib < DOME_SEGMENTS; rib++) {
    const { x, z } = direction((rib + 0.5) * Math.PI * 2 / DOME_SEGMENTS);
    const points: THREE.Vector3[] = [];
    for (let ring = 0; ring <= rings; ring++) {
      const s = ring / rings;
      const reach = (R - 0.08) * (1 - s);
      points.push(new THREE.Vector3(CX + x * reach, FLOOR + springY - 0.06 + rise * pointedArch(1 - s), CZ + z * reach));
    }
    for (const segment of ribGeometries(points, 0.18, 0.22)) batch.add(segment, materials.dressedStone);
  }
  batch.add(new THREE.CylinderGeometry(0.5, 0.36, 0.3, 12).translate(CX, FLOOR + apexY - 0.2, CZ), materials.dressedStone);
  batch.add(new THREE.TorusGeometry(0.26, 0.03, 4, 18, Math.PI * 1.7).rotateX(Math.PI / 2).translate(CX, FLOOR + apexY - 0.36, CZ), materials.windGlow);
}

/** Turns a geometry inside out: reversed winding and normals, for surfaces seen from within. */
function flipFaces(geometry: THREE.BufferGeometry): void {
  const index = geometry.getIndex();
  if (index) {
    for (let triangle = 0; triangle < index.count; triangle += 3) {
      const second = index.getX(triangle + 1);
      index.setX(triangle + 1, index.getX(triangle + 2));
      index.setX(triangle + 2, second);
    }
  }
  geometry.computeVertexNormals();
}

/** Two drums, a fluted shaft and an empty cup: where something was kept, and will be again. */
function addPedestal(context: DieKathedraleBuildContext): void {
  const { batch, materials } = context;
  const { baseRadius, steps, stepHeight, shaftRadius, height } = SANCTUARY_PEDESTAL;
  for (let step = 0; step < steps; step++) {
    const radius = baseRadius - step * 0.3;
    batch.add(new THREE.CylinderGeometry(radius, radius + 0.04, stepHeight, 18).translate(CX, FLOOR + stepHeight * (step + 0.5), CZ), materials.dressedStone);
  }
  const shaftBottom = stepHeight * steps;
  const cupBottom = height - 0.2;
  batch.add(new THREE.CylinderGeometry(shaftRadius * 0.85, shaftRadius, cupBottom - shaftBottom, 12).translate(CX, FLOOR + (shaftBottom + cupBottom) / 2, CZ), materials.dressedStone);
  for (let flute = 0; flute < 6; flute++) {
    const angle = flute / 6 * Math.PI * 2;
    batch.addBox(materials.cavity, CX + Math.cos(angle) * shaftRadius * 0.93, FLOOR + (shaftBottom + cupBottom) / 2, CZ + Math.sin(angle) * shaftRadius * 0.93, 0.03, (cupBottom - shaftBottom) * 0.8, 0.03, 0, -angle, 0);
  }
  batch.add(new THREE.CylinderGeometry(0.42, 0.22, 0.2, 16, 1, true).translate(CX, FLOOR + cupBottom + 0.1, CZ), materials.dressedStone);
  batch.add(new THREE.CircleGeometry(0.4, 16).rotateX(-Math.PI / 2).translate(CX, FLOOR + cupBottom + 0.02, CZ), materials.cavity);
  batch.add(new THREE.TorusGeometry(0.42, 0.025, 4, 20).rotateX(Math.PI / 2).translate(CX, FLOOR + height, CZ), materials.dressedStone);
  addSolidProxy(context, 'sanctuary-pedestal', { x: CX - baseRadius, y: FLOOR, z: CZ - baseRadius }, { x: CX + baseRadius, y: FLOOR + height, z: CZ + baseRadius }, 'concrete', 'none');
}

/** A ring of runes cut into the floor round the pedestal, a thread of cold light along it, worn away in places. */
function addRunes(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  const y = FLOOR + 0.006;
  for (const [radius, width] of [[RUNE_RING.radius - 0.36, 0.05], [RUNE_RING.radius + 0.36, 0.05]] as const) {
    batch.add(new THREE.RingGeometry(radius - width / 2, radius + width / 2, 48).rotateX(-Math.PI / 2).translate(CX, y, CZ), materials.cavity);
  }
  batch.add(new THREE.RingGeometry(RUNE_RING.radius + 0.33, RUNE_RING.radius + 0.35, 48, 1, 0, Math.PI * 1.55).rotateX(-Math.PI / 2).translate(CX, y + 0.001, CZ), materials.windGlow);
  for (let rune = 0; rune < RUNE_RING.count; rune++) {
    if (random() < 0.18) continue;
    const angle = rune / RUNE_RING.count * Math.PI * 2;
    const strokes = 2 + Math.floor(random() * 2);
    for (let stroke = 0; stroke < strokes; stroke++) {
      const along = (random() - 0.5) * 0.24;
      const length = 0.18 + random() * 0.26;
      const reach = RUNE_RING.radius + (random() - 0.5) * 0.12;
      const x = CX + Math.cos(angle) * reach - Math.sin(angle) * along;
      const z = CZ + Math.sin(angle) * reach + Math.cos(angle) * along;
      const twist = (random() - 0.5) * 1.6;
      batch.add(new THREE.PlaneGeometry(0.035, length).rotateX(-Math.PI / 2).rotateY(-angle + twist).translate(x, y + 0.002, z), materials.cavity);
    }
  }
}

/**
 * Rock fallen from the dome, heaped in every notch between the stepped
 * masonry and the round wall (where nobody can walk), deeper on the north
 * side, with dust round it: the steps never show.
 */
function addCollapse(context: DieKathedraleBuildContext, random: () => number): void {
  const { batch, materials } = context;
  const steps = SANCTUARY_INSCRIBED_STEPS;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let notch = 1; notch < steps.length; notch++) {
        // The notch's inner corner, between the step below and the one above.
        const cornerX = steps[notch][0];
        const cornerZ = steps[notch - 1][1];
        const angle = Math.atan2(sz * cornerZ, sx * cornerX);
        const reach = (Math.hypot(cornerX, cornerZ) * R + R) / 2;
        const { x, z } = direction(angle);
        const heap = sz < 0 ? 3 : 1;
        for (let boulder = 0; boulder < heap; boulder++) {
          const size = 0.14 + random() * 0.16;
          const spread = (random() - 0.5) * 0.6;
          batch.add(
            new THREE.IcosahedronGeometry(size, 0).scale(1, 0.7 + random() * 0.4, 1),
            boulder % 2 ? materials.cryptStone : materials.roughStone,
            placement(CX + x * reach - z * spread, FLOOR + size * 0.5 + boulder * 0.05, CZ + z * reach + x * spread, random(), random() * Math.PI, random()),
          );
        }
        if (sz < 0) addRubble(batch, materials, CX + x * reach, FLOOR, CZ + z * reach, 4, 0.6, random);
      }
    }
  }
  addFloorStain(batch, materials, CX + 2.2, FLOOR, CZ - 2.6, 2.4, 1.6, random() * Math.PI);
}
