import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TICKET_WINDOW_GLASS, TICKET_WINDOWS } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';

/** Swing of a casement thrown open from inside, radians. */
const OPEN_ANGLE = 1.75;
/** Seconds the burst takes to settle against its stop. */
const SWING_SETTLE = 0.9;
const FRAME = 0.045;
const FRAME_DEPTH = 0.04;

/**
 * Angle of a casement `seconds` after it is thrown open: it slams past its
 * stop, bounces back and settles at OPEN_ANGLE. Pure, so tests can sample it.
 */
export function casementSwing(seconds: number): number {
  if (seconds <= 0) return 0;
  if (seconds >= SWING_SETTLE) return OPEN_ANGLE;
  return OPEN_ANGLE * (1 - Math.exp(-seconds / 0.12) * Math.cos(seconds * 16));
}

interface Casement {
  readonly pivot: THREE.Group;
  /** +1 swings the free edge out of the south hinge, -1 out of the north one. */
  readonly side: 1 | -1;
}

/**
 * The ticket office's glazed casements, two per window, hinged at the
 * window's outer edges. They stay shut until the map's ambush throws one
 * window open into the vestibule; a reset shuts them again. Visual only:
 * the office's own collider keeps bullets and bodies out.
 */
export class TicketWindowShutters {
  private readonly windows: ReadonlyArray<readonly [Casement, Casement]>;
  /** Seconds since each window burst open, or null while it is shut. */
  private readonly openTimes: Array<number | null> = TICKET_WINDOWS.map(() => null);

  constructor(context: Station33BuildContext) {
    const { materials, profile, group } = context;
    const castShadow = !profile.useReducedEffects;
    this.windows = TICKET_WINDOWS.map((window, index) => {
      const leafWidth = window.width / 2;
      const build = (side: 1 | -1): Casement => {
        const pivot = new THREE.Group();
        pivot.name = `ticket-window-${index}-${side > 0 ? 'south' : 'north'}`;
        pivot.position.set(window.x, TICKET_WINDOW_GLASS.centerY, window.z - side * leafWidth);
        for (const [geometry, material] of casementParts(leafWidth, side, materials)) {
          const mesh = new THREE.Mesh(geometry, material);
          mesh.castShadow = castShadow;
          mesh.receiveShadow = true;
          pivot.add(mesh);
        }
        group.add(pivot);
        return { pivot, side };
      };
      return [build(1), build(-1)] as const;
    });
  }

  /** Throws a window open; ignored when it already is. */
  burst(index: number): void {
    if (this.openTimes[index] === null) this.openTimes[index] = 0;
  }

  isOpen(index: number): boolean {
    return this.openTimes[index] !== null;
  }

  update(dt: number): void {
    for (let index = 0; index < this.windows.length; index++) {
      const time = this.openTimes[index];
      if (time === null || time >= SWING_SETTLE) continue;
      this.openTimes[index] = time + Math.max(0, dt);
      this.pose(index, casementSwing(this.openTimes[index]!));
    }
  }

  reset(): void {
    for (let index = 0; index < this.windows.length; index++) {
      this.openTimes[index] = null;
      this.pose(index, 0);
    }
  }

  private pose(index: number, angle: number): void {
    // Rotating +Y carries a leaf that runs along +Z out towards +X (the vestibule).
    for (const casement of this.windows[index]) casement.pivot.rotation.y = casement.side * angle;
  }
}

/** Wood frame, glass pane and bronze mid rail of one leaf, from its hinge along `side`·Z. */
function casementParts(
  leafWidth: number,
  side: 1 | -1,
  materials: Station33BuildContext['materials'],
): ReadonlyArray<readonly [THREE.BufferGeometry, THREE.Material]> {
  const height = TICKET_WINDOW_GLASS.height;
  const centerZ = side * leafWidth / 2;
  const box = (y: number, z: number, sizeY: number, sizeZ: number, depth = FRAME_DEPTH): THREE.BufferGeometry =>
    new THREE.BoxGeometry(depth, sizeY, sizeZ).translate(0, y, z);
  const frame = mergeGeometries([
    box(height / 2 - FRAME / 2, centerZ, FRAME, leafWidth),
    box(-height / 2 + FRAME / 2, centerZ, FRAME, leafWidth),
    box(0, side * FRAME / 2, height, FRAME),
    box(0, side * (leafWidth - FRAME / 2), height, FRAME),
  ]);
  const glass = box(0, centerZ, height - FRAME * 2, leafWidth - FRAME * 2, 0.02);
  const rail = box(0, centerZ, 0.05, leafWidth - FRAME * 2, FRAME_DEPTH + 0.01);
  return [
    [frame, materials.varnishedWood],
    [glass, materials.windowGlass],
    [rail, materials.bronze],
  ];
}
