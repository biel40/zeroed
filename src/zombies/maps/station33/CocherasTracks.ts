import * as THREE from 'three';
import { COCHERAS, COCHERAS_TRACKS, STATION33_WALL_THICKNESS } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';

const { hall } = COCHERAS;
const SLEEPER_SPACING = 0.7;
const RAIL = { width: 0.07, height: 0.12, foot: 0.14 } as const;
/** The east track's contact rail, on the lane side, under its wooden cover. */
const THIRD_RAIL_OFFSET = 1.55;
const BUFFER_STOP = { width: 2.0, depth: 1.2, height: 1.15 } as const;

interface TrackRun {
  readonly x: number;
  /** North end (towards -Z) and the buffer stop end. */
  readonly fromZ: number;
  readonly toZ: number;
}

/**
 * Track work set flush into the shed floor: ballast beds, sleepers, rails,
 * the east track's covered contact rail, and a buffer stop with a red
 * battery lamp closing each track on the apron. The rails run on under the
 * west train into its tunnel and under the blast gate on the east track.
 * Only the buffer stops are solid; the rest stays under obstacle height.
 */
export function buildCocherasTracks(context: Station33BuildContext, lighting: Station33Lighting): void {
  const { west, east } = COCHERAS_TRACKS;
  const runs: ReadonlyArray<TrackRun> = [
    { x: west.x, fromZ: hall.minZ - STATION33_WALL_THICKNESS - 6.4, toZ: west.bufferZ },
    { x: east.x, fromZ: hall.minZ, toZ: east.bufferZ },
  ];
  for (const run of runs) addTrack(context, run);
  addThirdRail(context, runs[1]);
  for (const run of runs) addBufferStop(context, lighting, run.x, run.toZ);
}

function addTrack(context: Station33BuildContext, run: TrackRun): void {
  const { batch, materials } = context;
  const length = run.toZ - run.fromZ;
  const centerZ = (run.fromZ + run.toZ) / 2;
  batch.addBox(materials.trackBed, run.x, 0, centerZ, 2.6, 0.024, length, 0, 0, 0, run.x);
  for (let z = run.fromZ + SLEEPER_SPACING / 2; z < run.toZ; z += SLEEPER_SPACING) {
    batch.addBox(materials.serviceConcrete, run.x, 0.035, z, 2.3, 0.05, 0.24);
  }
  for (const side of [-1, 1]) {
    const x = run.x + side * COCHERAS_TRACKS.gauge / 2;
    batch.addBox(materials.railSteel, x, COCHERAS_TRACKS.railTop - RAIL.height / 2, centerZ, RAIL.width, RAIL.height, length);
    batch.addBox(materials.railSteel, x, 0.07, centerZ, RAIL.foot, 0.02, length);
  }
}

/** Contact rail on insulator posts beside the track, under a timber cover board. */
function addThirdRail(context: Station33BuildContext, run: TrackRun): void {
  const { batch, materials } = context;
  const x = run.x + THIRD_RAIL_OFFSET;
  const length = run.toZ - run.fromZ - 1;
  const centerZ = (run.fromZ + run.toZ) / 2;
  batch.addBox(materials.railSteel, x, 0.22, centerZ, 0.08, 0.1, length);
  batch.addBox(materials.varnishedWood, x + 0.05, 0.33, centerZ, 0.3, 0.03, length);
  for (let z = run.fromZ + 1; z < run.toZ - 0.5; z += 2.2) {
    batch.addBox(materials.stucco, x, 0.1, z, 0.1, 0.14, 0.1);
    batch.addBox(materials.greySteel, x + 0.17, 0.2, z, 0.03, 0.26, 0.05);
  }
}

/**
 * Steel buffer stop across the track end: striped beam, two buffers facing
 * the train, posts and back braces, and a red lamp on top kept alive by
 * the battery circuit.
 */
function addBufferStop(context: Station33BuildContext, lighting: Station33Lighting, x: number, z: number): void {
  const { batch, materials, structure } = context;
  const { width, depth, height } = BUFFER_STOP;
  batch.addBox(materials.hazardPaint, x, 0.95, z, width, 0.34, 0.3);
  for (const side of [-1, 1]) {
    const bufferX = x + side * COCHERAS_TRACKS.gauge / 2;
    const buffer = new THREE.CylinderGeometry(0.17, 0.17, 0.26, 12).rotateX(Math.PI / 2).translate(bufferX, 0.95, z - 0.28);
    batch.add(buffer, materials.greySteel);
    batch.addBox(materials.greySteel, bufferX, 0.45, z, 0.18, 0.7, 0.18);
    batch.addBox(materials.greySteel, bufferX, 0.5, z + 0.32, 0.12, 0.12, 0.95, Math.PI / 5, 0, 0);
  }
  batch.addBox(materials.greySteel, x, height + 0.08, z, 0.22, 0.2, 0.18);
  const lamp = new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12).rotateX(Math.PI / 2).translate(x, height + 0.08, z - 0.11);
  batch.add(lamp, lighting.circuitMaterial('emergency'));
  // Reaches from the buffer heads back over the braces.
  structure.addBox(x, height / 2, z + 0.15, width, height, depth, materials.collider, {
    name: 'buffer-stop', surface: 'metal', mapRole: 'solid-prop', castShadow: false, uvSeed: 0, blocksPlayer: true, stainFaces: 'none',
  });
}
