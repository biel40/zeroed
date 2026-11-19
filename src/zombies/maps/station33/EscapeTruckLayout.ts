import type * as THREE from 'three';
import { ExtrudeGeometry } from 'three';
import type { StaticMeshBatch } from '../shared/StaticMeshBatch';
import { PROTOCOL33_TRUCK } from '../Station33Config';
import { addSnowCap } from './SnowCover';

/**
 * Shared measurements of the evacuation truck's rig (`EscapeTruck`), in
 * metres. The rig's origin is the truck's centre on the ground; it faces
 * north (-z), so a part `fromNose` metres behind the nose sits at
 * `FRONT + fromNose`. The overall box (`PROTOCOL33_TRUCK`) is fixed by the
 * yard's solids, the gate's timing and the ending's camera keys.
 */
export const { length: TRUCK_LENGTH, width: TRUCK_WIDTH, height: TRUCK_HEIGHT, cabOffset: CAB_OFFSET } = PROTOCOL33_TRUCK;
export const FRONT = -TRUCK_LENGTH / 2;
export const REAR = TRUCK_LENGTH / 2;
export const WHEEL_RADIUS = 0.55;
/** Wheel centres either side of the centre line. */
export const WHEEL_TRACK = 1.0;
export const WHEEL_WIDTH = 0.4;
/** Axles, metres behind the nose. */
export const AXLES = [1.15, 4.95, 6.25] as const;
/** Top of the chassis rails. */
export const FRAME_TOP = 0.93;

/** The forward-control cab over the front axle. */
export const CAB = {
  /** Its flat front face behind the bumper, and its back wall. */
  front: 0.06,
  back: 2.3,
  halfWidth: 1.2,
  floor: 1.24,
  /** Window sill line, all round. */
  belt: 1.95,
  top: 2.525,
  /** The raked windscreen: bottom and top edges, behind the nose and over the ground. */
  screenBottom: { fromNose: 0.1, y: 1.97 },
  screenTop: { fromNose: 0.3, y: 2.46 },
  /** Doors, hinged at the front, over the front wheel. */
  door: { from: 0.5, to: 1.72, bottom: 1.27 },
  /** Seats either side of the engine cover: the driver's on the west (left), the passenger's opposite. */
  seatX: 0.62,
} as const;

/** The windscreen's lean back from vertical, in radians. */
export const SCREEN_RAKE = Math.atan2(CAB.screenTop.fromNose - CAB.screenBottom.fromNose, CAB.screenTop.y - CAB.screenBottom.y);

/** The box body (the kung) behind the cab. */
export const BODY = {
  front: CAB_OFFSET + 0.65,
  back: TRUCK_LENGTH - 0.1,
  /** Its floor, clear of the wheels riding up on their springs. */
  bottom: 1.16,
  top: TRUCK_HEIGHT,
  /** Radius of the rounded roof edges. */
  edge: 0.08,
} as const;

/** Front wheel arches in the cab's flanks. */
export const ARCH = { radius: 0.7, inner: 0.62 } as const;

/** Headlamp lenses, proud of the cab's face in their pods. */
export const HEADLIGHT = { dx: 0.93, y: 1.3, fromNose: -0.1 } as const;
export const TAIL_LIGHT = { dx: TRUCK_WIDTH / 2 - 0.3, y: 0.86 } as const;
/** The exhaust's tip under the east flank, behind the cab. */
export const EXHAUST_TIP = { x: 1.08, y: 0.58, fromNose: 2.62 } as const;

/**
 * A flat flank panel cut to `shape`, drawn in (metres behind the nose,
 * height over the ground), `thickness` thick with its outer face at
 * `side * outerX`. Its UVs follow the material's world-scale tiling.
 * Returns geometry modelled with `z = fromNose`.
 */
export function flankPanel(shape: THREE.Shape, side: number, outerX: number, thickness: number, material: THREE.Material): THREE.BufferGeometry {
  const geometry = new ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 14 });
  const metersPerTile = (material.userData.metersPerTile as number | undefined) ?? 1;
  const uv = geometry.getAttribute('uv');
  for (let index = 0; index < uv.count; index++) uv.setXY(index, uv.getX(index) / metersPerTile, uv.getY(index) / metersPerTile);
  // Shape x (behind the nose) becomes z, the extrusion runs inwards across x.
  geometry.rotateY(-Math.PI / 2);
  return geometry.translate(side > 0 ? outerX : -outerX + thickness, 0, 0);
}

/**
 * A `StaticMeshBatch` addressed in truck terms: boxes by their distance
 * behind the nose, and geometry built with `z = fromNose`.
 */
export class TruckPartBatch {
  public constructor(private readonly batch: StaticMeshBatch) {}

  /** Box centred `fromNose` metres behind the nose, `y` over the ground and `x` across, rotated by Euler angles. */
  public box(
    material: THREE.Material,
    fromNose: number,
    y: number,
    width: number,
    height: number,
    depth: number,
    x = 0,
    rotationX = 0,
    rotationY = 0,
    rotationZ = 0,
  ): void {
    this.batch.addBox(material, x, y, FRONT + fromNose, width, height, depth, rotationX, rotationY, rotationZ);
  }

  /** Takes ownership of `geometry`, modelled with its z measured back from the nose. */
  public addFromNose(geometry: THREE.BufferGeometry, material: THREE.Material): void {
    this.batch.add(geometry.translate(0, 0, FRONT), material);
  }

  /** Snow settled on a flat top at `topY`, centred `fromNose` metres behind the nose. */
  public snowCap(material: THREE.Material, topY: number, fromNose: number, width: number, depth: number, thickness: number): void {
    addSnowCap(this.batch, material, 0, topY, FRONT + fromNose, width, depth, 0, thickness);
  }
}
