import * as THREE from 'three';
import type { PointDoor } from './PointDoor';
import { BuyableDoorVisual } from './BuyableDoorVisual';
import { BunkerDoorVisual } from './BunkerDoorVisual';

const DOOR_WIDTH = 1.6;
const DOOR_HEIGHT = 2.1;
const DOOR_THICK = 0.12;
const BUNKER_OPEN_DURATION = 2.4;

export type DoorOpeningState = 'CLOSED' | 'OPENING' | 'OPEN';

export interface PointDoorViewOptions {
  readonly woodMaterial?: THREE.MeshStandardMaterial;
  readonly reducedEffects?: boolean;
}

/**
 * Point door visual. Paid doors keep an invisible slab as their collider and
 * delegate presentation to `BuyableDoorVisual`; the sealed bunker door is the
 * collider itself, dressed and animated by `BunkerDoorVisual`.
 */
export class PointDoorView {
  readonly group = new THREE.Group();
  readonly collider: THREE.Mesh;
  private readonly mesh: THREE.Mesh;
  private readonly sealed: boolean;
  private readonly visual: BuyableDoorVisual | null = null;
  private readonly bunker: BunkerDoorVisual | null = null;
  private openingState: DoorOpeningState = 'CLOSED';
  private openingElapsed = 0;

  constructor(
    private readonly door: PointDoor,
    parent: THREE.Object3D,
    options: PointDoorViewOptions = {},
  ) {
    const geometry = new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, DOOR_THICK);
    const sealed = door.id === 'nuclear-bunker';
    this.sealed = sealed;
    // Raycasts and Box3 ignore material visibility, so the hidden slab still blocks.
    const material = new THREE.MeshStandardMaterial({ visible: false });
    this.mesh = new THREE.Mesh(geometry, material);
    this.collider = this.mesh;
    this.mesh.name = `point-door-collider:${door.id}`;
    this.mesh.position.y = DOOR_HEIGHT / 2;
    this.mesh.castShadow = sealed;
    this.mesh.receiveShadow = sealed;
    this.mesh.userData.surface = sealed ? 'metal' : 'wood';
    this.mesh.userData.mapRole = sealed ? 'sealed-bunker-door' : 'point-door';
    if (sealed) {
      this.bunker = new BunkerDoorVisual(this.mesh, {
        width: DOOR_WIDTH,
        height: DOOR_HEIGHT,
        thickness: DOOR_THICK,
        cost: door.cost,
        reducedEffects: options.reducedEffects,
      });
      this.group.add(this.bunker.group);
    } else {
      this.visual = new BuyableDoorVisual({
        width: DOOR_WIDTH,
        height: DOOR_HEIGHT,
        cost: door.cost,
        woodMaterial: options.woodMaterial,
        reducedEffects: options.reducedEffects,
      });
      this.visual.group.userData.mapRole = 'point-door-visual';
      this.group.add(this.visual.group);
    }

    this.group.add(this.mesh);
    this.group.position.set(door.position.x, door.y, door.position.z);
    this.group.userData.surface = sealed ? 'metal' : 'wood';
    const angle = Math.atan2(door.outward.x, door.outward.z);
    this.group.rotation.y = angle;
    parent.add(this.group);
  }

  public get state(): DoorOpeningState {
    return this.openingState;
  }

  public beginOpening(): boolean {
    if (!this.sealed || this.door.isLocked || this.openingState !== 'CLOSED') return false;
    this.openingState = 'OPENING';
    this.openingElapsed = 0;
    return true;
  }

  /** Returns true only on the frame where the sealed door reaches OPEN. */
  public update(dt: number): boolean {
    if (this.visual) {
      const unlocked = this.door.state === 'unlocked';
      if (unlocked && this.openingState === 'CLOSED') {
        this.openingState = 'OPENING';
        // Hides bullet holes parented to the slab along with it.
        this.mesh.visible = false;
      }
      if (this.visual.update(dt, unlocked)) this.openingState = 'OPEN';
      return false;
    }

    if (this.openingState === 'OPENING') {
      this.openingElapsed = Math.min(BUNKER_OPEN_DURATION, this.openingElapsed + dt);
    }
    const progress = this.openingElapsed / BUNKER_OPEN_DURATION;
    this.bunker?.update(dt, this.openingState, progress);
    if (this.openingState !== 'OPENING' || progress < 1) return false;
    this.mesh.visible = false;
    this.openingState = 'OPEN';
    return true;
  }

  public reset(): void {
    this.mesh.position.set(0, DOOR_HEIGHT / 2, 0);
    this.mesh.visible = true;
    this.openingState = 'CLOSED';
    this.openingElapsed = 0;
    this.visual?.reset();
    this.bunker?.reset();
  }
}
