import { seededRandom } from '../shared/ProceduralNoise';
import { PROTOCOL33_GATE, PROTOCOL33_ROAD, PROTOCOL33_SURFACE, PROTOCOL33_SURFACE_Y, PROTOCOL33_YARD, STATION33_WALL_THICKNESS } from '../Station33Config';
import { addSnowDrift } from './SnowCover';
import type { Station33BuildContext } from './Station33BuildContext';

const GROUND = PROTOCOL33_SURFACE_Y;
const { yard, kiosk } = PROTOCOL33_SURFACE;
/** Drifts inside the fence stay low and hug its foot, leaving the yard (and its cameras) clear. */
const INNER_DRIFT = { depth: 0.9, minHeight: 0.14, maxHeight: 0.3, inset: 0.15 } as const;
/** Outside, the wind piled the snow higher against the panels. */
const OUTER_DRIFT = { depth: 2.2, minHeight: 0.45, maxHeight: 1.1, inset: 0.9 } as const;
/** How close to a prop of the yard (its centre) the edge of a drift may lie. */
const PROP_CLEARANCE = 0.7;

/** Centres of the props by the fence that a drift keeps clear of. */
const KEEP_CLEAR: ReadonlyArray<readonly [number, number]> = [
  [PROTOCOL33_YARD.lampPost.x, PROTOCOL33_YARD.lampPost.z],
  [PROTOCOL33_YARD.fireBarrel.x, PROTOCOL33_YARD.fireBarrel.z],
  [PROTOCOL33_YARD.tyres.x, PROTOCOL33_YARD.tyres.z],
  // The sandbag nest by both its ends.
  [PROTOCOL33_YARD.sandbagNest.x - PROTOCOL33_YARD.sandbagNest.length / 2, PROTOCOL33_YARD.sandbagNest.z],
  [PROTOCOL33_YARD.sandbagNest.x + PROTOCOL33_YARD.sandbagNest.length / 2, PROTOCOL33_YARD.sandbagNest.z],
  ...PROTOCOL33_YARD.drumHuddles.flat(),
  ...PROTOCOL33_YARD.roadBlocks.map(({ x, z }) => [x, z] as const),
];

/**
 * Snow the wind piled along the fence: low drifts at the foot of its inner
 * faces (clear of the props, the gate and the stairhead) and deeper ones
 * against its outer faces, except across the road out of the gate.
 * Visual only: nothing here blocks the player or the horde.
 */
export function buildYardDrifts(context: Station33BuildContext): void {
  const { batch, materials } = context;
  const random = seededRandom(3851);
  const faces = [
    { axis: 'x', fixed: yard.minZ, from: yard.minX, to: yard.maxX, inward: 1 },
    { axis: 'x', fixed: yard.maxZ, from: yard.minX, to: yard.maxX, inward: -1 },
    { axis: 'z', fixed: yard.minX, from: yard.minZ, to: yard.maxZ, inward: 1 },
    { axis: 'z', fixed: yard.maxX, from: yard.minZ, to: yard.maxZ, inward: -1 },
  ] as const;
  for (const face of faces) {
    for (const side of [face.inward, -face.inward]) {
      const inner = side === face.inward;
      const shape = inner ? INNER_DRIFT : OUTER_DRIFT;
      // An outer drift sits beyond the fence's thickness.
      const offset = side * (shape.inset + (inner ? 0 : STATION33_WALL_THICKNESS));
      let along = face.from + 0.6;
      while (along < face.to - 0.6) {
        const length = 1.6 + random() * 2.6;
        const centre = Math.min(along + length / 2, face.to - length / 2);
        along += length + random() * 1.2;
        const [x, z] = face.axis === 'x' ? [centre, face.fixed + offset] : [face.fixed + offset, centre];
        const halfX = face.axis === 'x' ? length / 2 : shape.depth / 2;
        const halfZ = face.axis === 'x' ? shape.depth / 2 : length / 2;
        if (!driftAllowed(x, z, halfX, halfZ, inner, face.axis === 'x' && face.fixed === yard.minZ, face.axis === 'x' && face.fixed === yard.maxZ)) continue;
        const height = shape.minHeight + random() * (shape.maxHeight - shape.minHeight);
        addSnowDrift(batch, materials.snow, x, GROUND, z, length, shape.depth, height, face.axis === 'x' ? 0 : Math.PI / 2);
      }
    }
  }
}

/** Whether a drift centred on (x, z), `halfX` x `halfZ` across, keeps clear of what must stay open. */
function driftAllowed(x: number, z: number, halfX: number, halfZ: number, inner: boolean, northFence: boolean, southFence: boolean): boolean {
  const overlapsX = (minX: number, maxX: number): boolean => x + halfX > minX && x - halfX < maxX;
  if (southFence && overlapsX(kiosk.minX - 0.6, kiosk.maxX + 0.6)) return false;
  if (northFence && inner && overlapsX(PROTOCOL33_GATE.minX - 0.6, PROTOCOL33_GATE.maxX + 0.6)) return false;
  // Outside the north fence the road leaves the gate: its verges are kept by the outskirts' banks.
  if (northFence && !inner && overlapsX(PROTOCOL33_ROAD.x - PROTOCOL33_ROAD.width / 2 - 1.5, PROTOCOL33_ROAD.x + PROTOCOL33_ROAD.width / 2 + 1.5)) return false;
  if (!inner) return true;
  // Distance from each prop to the drift's footprint.
  return KEEP_CLEAR.every(([px, pz]) => Math.hypot(Math.max(0, Math.abs(px - x) - halfX), Math.max(0, Math.abs(pz - z) - halfZ)) > PROP_CLEARANCE);
}
