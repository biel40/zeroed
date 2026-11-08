import * as THREE from 'three';
import type { GrenadeDefinition } from '../../config/grenades';
import { F1GrenadeModel } from '../../weapons/F1GrenadeModel';
import { GibWallFrame, type GibWalls } from '../GibWalls';
import { GrenadeFlight } from './GrenadeFlight';

/** Grenades that can be live at once, both co-op players included; one more waits for a blast. */
const LIVE_GRENADES = 6;
/** Bounces softer than this make no sound. */
const AUDIBLE_IMPACT = 0.8;

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Everything a client needs to replay a throw identically: the hand's start
 * (the eye), where the grenade left it, the unit aim, the fuse left after
 * cooking and the floor under the thrower. Plain numbers, so it travels on
 * the co-op wire as is.
 */
export interface GrenadeLaunch {
  readonly from: Point3;
  readonly origin: Point3;
  readonly aim: Point3;
  readonly fuse: number;
  readonly floorY: number;
}

interface Slot<Owner> {
  readonly flight: GrenadeFlight;
  readonly walls: GibWallFrame;
  readonly model: F1GrenadeModel;
  /** What is flying in this slot; null while it is free. */
  definition: GrenadeDefinition | null;
  owner: Owner | null;
}

/** Grenades simulate in world space: the wall frame is the scene's own. */
const WORLD_FRAME = new THREE.Object3D();
WORLD_FRAME.updateMatrixWorld(true);

/**
 * Live grenades in the world: each flies, bounces off the map's solids
 * (`GibWalls`, refreshed by the owner with the topology), rolls to rest
 * and reports its blast, with who threw it, when the fuse burns out. Fixed
 * pool, no allocation per frame.
 */
export class ThrownGrenades<Owner> {
  public readonly group = new THREE.Group();
  /** A hard bounce at `position` (speed in m/s), for the clink. */
  public onBounce: ((position: THREE.Vector3, speed: number) => void) | null = null;
  /** The fuse burnt out at `position`, resting on (or over) `surfaceY`. */
  public onDetonate: ((position: THREE.Vector3, surfaceY: number, definition: GrenadeDefinition, owner: Owner) => void) | null = null;

  private readonly slots: Slot<Owner>[];
  private readonly from = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();

  public constructor(private readonly walls: GibWalls, castShadow = false) {
    this.group.name = 'thrown-grenades';
    this.slots = Array.from({ length: LIVE_GRENADES }, () => {
      const model = new F1GrenadeModel(castShadow);
      model.setLive(true);
      this.group.add(model.root);
      return { flight: new GrenadeFlight(), walls: new GibWallFrame(), model, definition: null, owner: null };
    });
    // Visible until the first update hides the idle pool: the shader warm-up compiles it.
  }

  public get activeCount(): number {
    return this.slots.reduce((count, slot) => count + (slot.definition ? 1 : 0), 0);
  }

  /** Puts a thrown grenade into the world; false when every slot is live. */
  public throw(definition: GrenadeDefinition, launch: GrenadeLaunch, owner: Owner): boolean {
    const slot = this.slots.find((candidate) => !candidate.definition);
    if (!slot) return false;
    this.from.set(launch.from.x, launch.from.y, launch.from.z);
    this.origin.set(launch.origin.x, launch.origin.y, launch.origin.z);
    this.aim.set(launch.aim.x, launch.aim.y, launch.aim.z).normalize();
    slot.walls.capture(this.walls, WORLD_FRAME, this.origin);
    slot.flight.launch(definition.flight, this.from, this.origin, this.aim, launch.fuse, launch.floorY, slot.walls);
    slot.definition = definition;
    slot.owner = owner;
    slot.model.root.position.copy(slot.flight.position);
    slot.model.root.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    slot.model.root.visible = true;
    return true;
  }

  public update(dt: number): void {
    for (const slot of this.slots) {
      const { flight, model, definition, owner } = slot;
      model.root.visible = definition !== null;
      if (!definition || owner === null) continue;
      const wasResting = flight.isResting;
      const impact = flight.step(dt, slot.walls);
      if (impact >= AUDIBLE_IMPACT) this.onBounce?.(flight.position, impact);
      model.root.position.copy(flight.position);
      model.root.rotation.x += flight.spin.x * dt;
      model.root.rotation.y += flight.spin.y * dt;
      model.root.rotation.z += flight.spin.z * dt;
      // Settled on its side, as an egg-shaped body comes to rest.
      if (flight.isResting && !wasResting) model.root.rotation.set(Math.PI / 2, model.root.rotation.y, 0);
      if (flight.fuse > 0) continue;
      slot.definition = null;
      slot.owner = null;
      model.root.visible = false;
      this.onDetonate?.(flight.position, flight.position.y - definition.flight.radius, definition, owner);
    }
  }

  /** New run: nothing live is left in the world. */
  public reset(): void {
    for (const slot of this.slots) {
      slot.definition = null;
      slot.owner = null;
      slot.model.root.visible = false;
    }
  }
}
