import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DeviceProfile } from '../../core/DeviceProfile';
import { EYE_HEIGHT, type FloorTransitionZone, type StairRamp } from '../../player/PlayerController';
import { WindowBarrier } from '../barriers/WindowBarrier';
import { WindowBarrierView } from '../barriers/WindowBarrierView';
import { PointDoor } from '../doors/PointDoor';
import { PointDoorView } from '../doors/PointDoorView';
import type { ZombieSpawnDefinition, ZombieSpawnPoint } from '../ZombieSpawner';
import { WallBuy } from '../wallbuys/WallBuy';
import { WallBuyView } from '../wallbuys/WallBuyView';
import { SecretRoomSystem } from '../secret-room/SecretRoomSystem';
import { WEAPON_DEFINITIONS } from '../../config/weapons';
import { buildWeaponDisplayModel } from '../../weapons/WeaponView';
import type { WeaponId } from '../../weapons/WeaponTypes';
import { CreepyAreaLights } from '../../rendering/CreepyAreaLights';
import type {
  ArenaAmmoRefill,
  ArenaCompletionInteraction,
  ArenaRitualInteraction,
  ArenaSoulLampInteraction,
  ArenaWeaponPickup,
  ZombieArena,
} from './ZombieArena';
import {
  createMansionSurfaceMaterials,
  projectBoxUVs,
  type MansionSurfaceMaterials,
} from './BurnedMansionMaterials';
import {
  BARRIER_CONFIG,
  DEBUG_MAP_COLLIDERS,
  MANSION_AMMO_REFILLS,
  MANSION_BARRIERS,
  MANSION_BUNKER_BOUNDS,
  MANSION_BUNKER_DIVIDER_X,
  MANSION_BUNKER_ENDING,
  MANSION_BUNKER_Y,
  MANSION_BOX_PLACEMENT,
  MANSION_DOORS,
  MANSION_EAST_WALL_X,
  MANSION_GROUND_BOUNDS,
  MANSION_PLAYER_SPAWN,
  MANSION_RITUAL_CIRCLE,
  MANSION_SPAWNS,
  MANSION_STAIR_BOTTOM_Z,
  MANSION_STAIR_CENTER_X,
  MANSION_STAIR_TOP_Z,
  MANSION_SECRET_AREAS,
  MANSION_SECRET_ROOM,
  MANSION_SOUL_LAMPS,
  MANSION_SPECIAL_WEAPON_CASES,
  MANSION_WALL_BUYS,
} from './BurnedMansionConfig';

const WALL_THICKNESS = 0.3;
const LOWER_WALL_HEIGHT = 3.2;
const DOOR_WIDTH = 1.6;
const WINDOW_WIDTH = 1.5;
// Low enough for a zombie body to step through after the boards break.
const WINDOW_SILL = 0.3;
const WINDOW_TOP = 1.9;
// Underside of the ground-floor roof slab (center 3.28, thickness 0.16).
const GROUND_CEILING_Y = 3.2;
// Underside of the bunker ceiling slab (center -0.22, thickness 0.16).
const BUNKER_CEILING_Y = -0.3;
const STAIR_APERTURE_MIN_Z = MANSION_STAIR_BOTTOM_Z - 0.15;
const STAIR_APERTURE_MAX_Z = MANSION_STAIR_TOP_Z - 0.15;
const DESKTOP_POINT_LIGHT_BUDGET = 6;
const REDUCED_EFFECTS_POINT_LIGHT_BUDGET = 4;

interface RankedPointLight {
  readonly light: THREE.PointLight;
  readonly position: THREE.Vector3;
  score: number;
}

type WallAxis = 'x' | 'z';

class MansionWeaponPickup implements ArenaWeaponPickup {
  private claimed = false;
  private openProgress = 0;

  constructor(
    readonly id: string,
    readonly weaponId: WeaponId,
    readonly position: { readonly x: number; readonly y: number; readonly z: number },
    readonly floor: number,
    readonly useRange: number,
    readonly lookDotMin: number,
    readonly requiredDoorId: string,
    readonly cost: number,
    readonly interactionLabel: string,
    private readonly view: THREE.Group,
    private readonly weaponDisplay: THREE.Object3D,
    private readonly glassDoor: THREE.Object3D,
  ) {}

  get available(): boolean {
    return !this.claimed;
  }

  claim(): boolean {
    if (this.claimed) return false;
    this.claimed = true;
    this.weaponDisplay.visible = false;
    this.view.userData.purchased = true;
    return true;
  }

  update(dt: number): void {
    if (!this.claimed || this.openProgress >= 1) return;
    this.openProgress = Math.min(1, this.openProgress + dt * 2.8);
    this.glassDoor.position.y = 1.05 + this.openProgress * 1.15;
  }

  reset(): void {
    this.claimed = false;
    this.openProgress = 0;
    this.weaponDisplay.visible = true;
    this.glassDoor.position.y = 1.05;
    this.view.userData.purchased = false;
  }
}

class MansionAmmoRefill implements ArenaAmmoRefill {
  private feedbackTimer = 0;

  constructor(
    readonly id: string,
    readonly cost: number,
    readonly interactionLabel: string,
    readonly position: { readonly x: number; readonly y: number; readonly z: number },
    readonly floor: number,
    readonly useRange: number,
    readonly lookDotMin: number,
    private readonly view: THREE.Group,
    private readonly lid: THREE.Object3D,
    private readonly glow: THREE.PointLight,
  ) {}

  activate(): void {
    this.feedbackTimer = 0.45;
    this.view.userData.activeFeedback = true;
  }

  update(dt: number): void {
    if (this.feedbackTimer <= 0) return;
    this.feedbackTimer = Math.max(0, this.feedbackTimer - dt);
    const active = this.feedbackTimer > 0;
    this.lid.rotation.x = active ? -0.16 : 0;
    this.glow.intensity = active ? 1.4 : 0.35;
    this.view.userData.activeFeedback = active;
  }

  reset(): void {
    this.feedbackTimer = 0;
    this.lid.rotation.x = 0;
    this.glow.intensity = 0.35;
    this.view.userData.activeFeedback = false;
  }
}

/**
 * Compact mansion and hidden underground bunker made from explicit meshes and
 * player-collision list. Exterior walls are segmented around real window
 * openings; paid doors occupy real apertures rather than overlapping walls.
 */
export class BurnedMansionArena implements ZombieArena {
  readonly id = 'burned-mansion';
  readonly group = new THREE.Group();
  readonly mysteryBoxPlacement = MANSION_BOX_PLACEMENT;
  readonly playerSpawn = MANSION_PLAYER_SPAWN;
  readonly useWallCollision = true;
  readonly playerBounds = MANSION_GROUND_BOUNDS;
  readonly navigationBounds = [
    { floor: 0, minX: -16, maxX: 16, minZ: -18, maxZ: 18, baseY: 0 },
    { floor: -1, ...MANSION_BUNKER_BOUNDS, baseY: MANSION_BUNKER_Y },
  ] as const;
  readonly floorTransitions: ReadonlyArray<FloorTransitionZone>;
  readonly completionInteraction: ArenaCompletionInteraction = MANSION_BUNKER_ENDING;
  readonly ritualInteraction: ArenaRitualInteraction;
  onTopologyChanged: (() => void) | null = null;
  onBarrierBoardRebuilt: (() => void) | null = null;
  onSoulAbsorbed: ((position: THREE.Vector3) => void) | null = null;
  onSoulLampCompleted: ((position: THREE.Vector3) => void) | null = null;
  onSecretRoomUnlocked: ((position: THREE.Vector3) => void) | null = null;
  onRitualScare: ((position: THREE.Vector3) => void) | null = null;

  colliders: ReadonlyArray<THREE.Object3D> = [];
  wallColliders: ReadonlyArray<THREE.Box3> = [];
  barriers: ReadonlyArray<WindowBarrier> = [];
  readonly doors: ReadonlyArray<PointDoor>;
  readonly wallBuys: ReadonlyArray<WallBuy>;
  readonly weaponPickups: ReadonlyArray<ArenaWeaponPickup>;
  readonly ammoRefills: ReadonlyArray<ArenaAmmoRefill>;
  readonly soulLampInteractions: ReadonlyArray<ArenaSoulLampInteraction>;
  spawnPoints: ReadonlyArray<ZombieSpawnDefinition> = [];

  private readonly structureMeshes: THREE.Mesh[] = [];
  private readonly playerWallMeshes: THREE.Mesh[] = [];
  private readonly allBarriers: ReadonlyArray<WindowBarrier>;
  private readonly barrierViews: WindowBarrierView[] = [];
  private readonly doorViews: PointDoorView[] = [];
  private readonly doorMeshes: THREE.Mesh[] = [];
  private readonly activeSpawnZones = new Set<string>(['start']);
  private readonly openDoorIds = new Set<string>();
  private readonly materials: MansionSurfaceMaterials;
  private readonly secretRoom: SecretRoomSystem;
  private secretWall!: THREE.Mesh;
  private secretWallCollider!: THREE.Mesh;
  private wallMaterialIndex = 0;
  private readonly areaLights = new CreepyAreaLights();
  private readonly rankedPointLights: RankedPointLight[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly profile: DeviceProfile,
  ) {
    this.materials = createMansionSurfaceMaterials(profile.anisotropyLimit);
    this.buildShell();
    this.buildInterior();
    this.buildStairs();
    this.buildProps();
    this.buildBunkerDetails();
    this.weaponPickups = this.buildSecretPickups();
    this.ammoRefills = this.buildAmmoRefills();
    this.buildDamageDetails();
    this.buildWindowFrames();
    this.buildLighting();
    this.secretRoom = new SecretRoomSystem(this.group, this.secretWall, profile);
    const secretRoom = this.secretRoom;
    this.ritualInteraction = {
      ...MANSION_RITUAL_CIRCLE,
      get available(): boolean {
        return secretRoom.isDoorOpen && !secretRoom.state.ritualScareTriggered;
      },
      activate: () => secretRoom.triggerRitualScare(),
    };
    this.soulLampInteractions = MANSION_SOUL_LAMPS.map((lamp, index) => {
      return {
        id: lamp.id,
        position: lamp.position,
        floor: lamp.floor,
        useRange: lamp.useRange,
        lookDotMin: lamp.lookDotMin,
        get activated(): boolean { return secretRoom.state.lamps[index].activated; },
        activate: () => secretRoom.activateLamp(index),
      };
    });
    this.secretRoom.onSoulAbsorbed = (position) => this.onSoulAbsorbed?.(position);
    this.secretRoom.onLampCompleted = (position) => this.onSoulLampCompleted?.(position);
    this.secretRoom.onUnlocked = (position) => this.onSecretRoomUnlocked?.(position);
    this.secretRoom.onRitualScare = (position) => this.onRitualScare?.(position);
    this.secretRoom.onDoorOpened = () => {
      this.refreshColliders();
      this.onTopologyChanged?.();
    };

    this.allBarriers = MANSION_BARRIERS.map(
      (barrier) =>
        new WindowBarrier(
          barrier.id,
          barrier.x,
          barrier.z,
          barrier.outwardX,
          barrier.outwardZ,
          BARRIER_CONFIG,
        ),
    );
    for (const barrier of this.allBarriers) {
      const view = new WindowBarrierView(
        barrier,
        this.group,
        () => this.onBarrierBoardRebuilt?.(),
      );
      if (this.profile.useReducedEffects) {
        view.group.traverse((object) => { object.castShadow = false; });
      }
      this.barrierViews.push(view);
    }

    this.doors = MANSION_DOORS.map(
      (door) =>
        new PointDoor(
          door.id,
          door.x,
          door.z,
          door.outwardX,
          door.outwardZ,
          { cost: door.cost, prompt: door.prompt, requiredMessage: door.requiredMessage },
          door.y,
          door.floor,
        ),
    );
    for (const door of this.doors) {
      const view = new PointDoorView(door, this.group);
      if (this.profile.useReducedEffects) {
        view.group.traverse((object) => { object.castShadow = false; });
      }
      this.doorViews.push(view);
      this.doorMeshes.push(view.collider);
    }

    this.wallBuys = MANSION_WALL_BUYS.map((config) => new WallBuy(config));
    for (const wallBuy of this.wallBuys) {
      new WallBuyView(wallBuy, WEAPON_DEFINITIONS[wallBuy.weaponId], this.group);
    }

    this.floorTransitions = this.buildFloorTransitions();
    this.refreshProgressionState();
    this.initializePointLightBudget();
    if (DEBUG_MAP_COLLIDERS) this.addDebugHelpers();
  }

  public init(): void {
    this.scene.background = new THREE.Color(0x0d0b0a);
    this.scene.fog = new THREE.FogExp2(0x17110e, 0.018);
  }

  public update(dt: number, observerPosition?: THREE.Vector3): void {
    this.secretRoom.update(dt);
    for (const pickup of this.weaponPickups) pickup.update?.(dt);
    for (const refill of this.ammoRefills) refill.update?.(dt);
    for (const view of this.barrierViews) {
      if (view.group.visible) view.update(dt);
    }
    for (let index = 0; index < this.doorViews.length; index++) {
      if (!this.doorViews[index].update(dt)) continue;
      const doorId = this.doors[index].id;
      this.openDoorIds.add(doorId);
      this.activeSpawnZones.add(doorId);
      this.refreshProgressionState();
      this.onTopologyChanged?.();
    }
    this.areaLights.update(dt);
    if (observerPosition) this.updatePointLightBudget(observerPosition);
  }

  public reset(): void {
    for (const barrier of this.allBarriers) barrier.reset();
    for (const view of this.barrierViews) view.reset();
    for (const door of this.doors) door.reset();
    for (const view of this.doorViews) view.reset();
    for (const pickup of this.weaponPickups) pickup.reset();
    for (const refill of this.ammoRefills) refill.reset();
    this.secretRoom.reset();
    this.activeSpawnZones.clear();
    this.activeSpawnZones.add('start');
    this.openDoorIds.clear();
    this.refreshProgressionState();
  }

  /** Called after PointDoor changed to unlocked. */
  public activateDoor(doorId: string): boolean {
    if (!this.doors.some((door) => door.id === doorId) || this.activeSpawnZones.has(doorId)) {
      return false;
    }
    const index = this.doors.findIndex((door) => door.id === doorId);
    if (doorId === 'nuclear-bunker') return this.doorViews[index].beginOpening();
    this.openDoorIds.add(doorId);
    this.activeSpawnZones.add(doorId);
    this.refreshProgressionState();
    return true;
  }

  public refreshSpawnPoints(): void {
    this.spawnPoints = this.computeSpawnPoints();
  }

  public captureSoul(
    position: { readonly x: number; readonly y: number; readonly z: number },
    floor: number,
  ): boolean {
    return this.secretRoom.captureSoul(position, floor);
  }

  public get secretRoomState(): SecretRoomSystem['state'] {
    return this.secretRoom.state;
  }

  public refreshColliders(): void {
    this.group.updateMatrixWorld(true);
    this.colliders = this.collectBallisticColliders();
    this.wallColliders = this.collectPlayerWallColliders();
  }

  private refreshProgressionState(): void {
    this.refreshSpawnPoints();
    this.barriers = this.allBarriers.filter((_, index) =>
      this.activeSpawnZones.has(MANSION_BARRIERS[index].zone),
    );
    for (let index = 0; index < this.barrierViews.length; index++) {
      this.barrierViews[index].group.visible = this.activeSpawnZones.has(MANSION_BARRIERS[index].zone);
    }
    this.refreshColliders();
  }

  private computeSpawnPoints(): ReadonlyArray<ZombieSpawnDefinition> {
    const points: ZombieSpawnPoint[] = [];
    for (const zone of this.activeSpawnZones) {
      for (const point of MANSION_SPAWNS[zone] ?? []) {
        if (this.isValidExteriorSpawn(point)) points.push(point);
      }
    }
    return points;
  }

  private isValidExteriorSpawn(point: ZombieSpawnPoint): boolean {
    if (
      !point.exterior ||
      !point.barrierId ||
      point.approachX === undefined ||
      point.approachZ === undefined ||
      point.breachX === undefined ||
      point.breachZ === undefined
    ) return false;
    const outside = point.x < -7.45 || point.x > MANSION_EAST_WALL_X + 0.3 || point.z < -8.45 || point.z > 10.45;
    if (!outside) return false;
    const barrier = MANSION_BARRIERS.find((candidate) => candidate.id === point.barrierId);
    if (!barrier) return false;
    const approachSide =
      (point.approachX - barrier.x) * barrier.outwardX +
      (point.approachZ - barrier.z) * barrier.outwardZ;
    const breachSide =
      (point.breachX - barrier.x) * barrier.outwardX +
      (point.breachZ - barrier.z) * barrier.outwardZ;
    if (approachSide <= 0.4 || breachSide >= -0.4) return false;
    const body = new THREE.Box3(
      new THREE.Vector3(point.x - 0.42, 0.05, point.z - 0.42),
      new THREE.Vector3(point.x + 0.42, 1.8, point.z + 0.42),
    );
    return !this.structureMeshes.some((mesh) => new THREE.Box3().setFromObject(mesh).intersectsBox(body));
  }

  private collectBallisticColliders(): ReadonlyArray<THREE.Object3D> {
    const colliders: THREE.Object3D[] = [...this.structureMeshes];
    if (!this.secretRoom.isDoorOpen) colliders.push(this.secretWallCollider);
    for (let i = 0; i < this.doors.length; i++) {
      if (!this.openDoorIds.has(this.doors[i].id)) colliders.push(this.doorMeshes[i]);
    }
    return colliders;
  }

  private collectPlayerWallColliders(): ReadonlyArray<THREE.Box3> {
    const boxes = this.playerWallMeshes.map((mesh) => new THREE.Box3().setFromObject(mesh));
    if (!this.secretRoom.isDoorOpen) boxes.push(new THREE.Box3().setFromObject(this.secretWallCollider));
    for (let i = 0; i < this.doors.length; i++) {
      if (!this.openDoorIds.has(this.doors[i].id)) boxes.push(new THREE.Box3().setFromObject(this.doorMeshes[i]));
    }
    return boxes;
  }

  private buildShell(): void {
    this.addSlab('ground-floor', -0.8, -0.08, 1, 12.4, 0.16, 18, this.materials.floorConcrete);
    this.addSlab('ground-floor-east', 8.45, -0.08, 1, 1.1, 0.16, 18, this.materials.floorConcrete);
    this.addSlab(
      'ground-floor-stair-north', MANSION_STAIR_CENTER_X, -0.08,
      (-8 + STAIR_APERTURE_MIN_Z) / 2, 2.5, 0.16,
      STAIR_APERTURE_MIN_Z + 8, this.materials.floorConcrete,
    );
    this.addSlab(
      'ground-floor-stair-south', MANSION_STAIR_CENTER_X, -0.08,
      (STAIR_APERTURE_MAX_Z + 10) / 2, 2.5, 0.16,
      10 - STAIR_APERTURE_MAX_Z, this.materials.floorConcrete,
    );

    this.addWindowedWall('z', -7.15, -8, 10, [-3.2, 3.2, 5.4]);
    this.addWindowedWall('z', MANSION_EAST_WALL_X, -8, 10, [-2.5]);
    this.addWindowedWall('x', -8.15, -7, 7, [-5.5, -3.5, 1.6]);
    this.addWindowedWall('x', 10.15, -7, 7, [-5.5, -3.5]);

    this.addSlab('mansion-roof', 1, 3.28, 1, 16.6, 0.16, 18.6, this.materials.ceilingBurned);

    // The bunker mirrors the whole mansion footprint, and its ceiling repeats
    // the exact stair aperture of the ground slab so the stairwell stays open.
    this.addSlab('bunker-floor', 1, MANSION_BUNKER_Y - 0.08, -3.75, 16, 0.16, 11.5, this.materials.floorConcrete);
    this.addSlab('bunker-ceiling', -0.8, -0.22, -3.75, 12.4, 0.16, 11.5, this.materials.ceilingBurned);
    this.addSlab('bunker-ceiling-east', 8.45, -0.22, -3.75, 1.1, 0.16, 11.5, this.materials.ceilingBurned);
    this.addSlab(
      'bunker-ceiling-stair-north', MANSION_STAIR_CENTER_X, -0.22,
      (-9.5 + STAIR_APERTURE_MIN_Z) / 2, 2.5, 0.16,
      STAIR_APERTURE_MIN_Z + 9.5, this.materials.ceilingBurned,
    );
    this.addSlab(
      'bunker-ceiling-stair-south', MANSION_STAIR_CENTER_X, -0.22,
      (STAIR_APERTURE_MAX_Z + 2) / 2, 2.5, 0.16,
      2 - STAIR_APERTURE_MAX_Z, this.materials.ceilingBurned,
    );
    const bunkerWallY = MANSION_BUNKER_Y + LOWER_WALL_HEIGHT / 2;
    const entranceStart = MANSION_SECRET_ROOM.entranceZ - MANSION_SECRET_ROOM.entranceWidth / 2;
    const entranceEnd = MANSION_SECRET_ROOM.entranceZ + MANSION_SECRET_ROOM.entranceWidth / 2;
    this.addWall(
      MANSION_SECRET_ROOM.entranceX,
      bunkerWallY,
      (-9.5 + entranceStart) / 2,
      WALL_THICKNESS,
      LOWER_WALL_HEIGHT,
      entranceStart + 9.5,
      this.materials.concreteDirty,
    );
    this.addWall(
      MANSION_SECRET_ROOM.entranceX,
      bunkerWallY,
      (entranceEnd + 2) / 2,
      WALL_THICKNESS,
      LOWER_WALL_HEIGHT,
      2 - entranceEnd,
      this.materials.concreteDirty,
    );
    this.addWall(
      MANSION_SECRET_ROOM.entranceX,
      MANSION_BUNKER_Y + 2.7,
      MANSION_SECRET_ROOM.entranceZ,
      WALL_THICKNESS,
      1,
      MANSION_SECRET_ROOM.entranceWidth,
      this.materials.concreteDirty,
    );
    this.secretWall = this.buildSecretWall();
    this.addWall(MANSION_EAST_WALL_X - 0.15, bunkerWallY, -3.75, WALL_THICKNESS, LOWER_WALL_HEIGHT, 11.5, this.materials.concreteDirty);
    this.addWall(1, bunkerWallY, -9.5, 16, LOWER_WALL_HEIGHT, WALL_THICKNESS, this.materials.concreteDirty);
    this.addWall(1, bunkerWallY, 2, 16, LOWER_WALL_HEIGHT, WALL_THICKNESS, this.materials.concreteDirty);

    this.addSlab(
      'secret-room-floor',
      MANSION_SECRET_ROOM.centerX,
      MANSION_BUNKER_Y - 0.08,
      MANSION_SECRET_ROOM.centerZ,
      MANSION_SECRET_ROOM.width,
      0.16,
      MANSION_SECRET_ROOM.depth,
      this.materials.floorConcrete,
    );
    this.addSlab(
      'secret-room-ceiling',
      MANSION_SECRET_ROOM.centerX,
      -0.22,
      MANSION_SECRET_ROOM.centerZ,
      MANSION_SECRET_ROOM.width,
      0.16,
      MANSION_SECRET_ROOM.depth,
      this.materials.ceilingBurned,
    );
    this.addWall(
      MANSION_SECRET_ROOM.centerX - MANSION_SECRET_ROOM.width / 2,
      bunkerWallY,
      MANSION_SECRET_ROOM.centerZ,
      WALL_THICKNESS,
      LOWER_WALL_HEIGHT,
      MANSION_SECRET_ROOM.depth,
      this.materials.concreteDirty,
    );
    for (const z of [
      MANSION_SECRET_ROOM.centerZ - MANSION_SECRET_ROOM.depth / 2,
      MANSION_SECRET_ROOM.centerZ + MANSION_SECRET_ROOM.depth / 2,
    ]) {
      this.addWall(
        MANSION_SECRET_ROOM.centerX,
        bunkerWallY,
        z,
        MANSION_SECRET_ROOM.width,
        LOWER_WALL_HEIGHT,
        WALL_THICKNESS,
        this.materials.concreteDirty,
      );
    }
  }

  private buildSecretWall(): THREE.Mesh {
    const geometry = new THREE.BoxGeometry(
      WALL_THICKNESS,
      LOWER_WALL_HEIGHT,
      MANSION_SECRET_ROOM.entranceWidth,
    );
    this.projectSurfaceUVs(
      geometry,
      WALL_THICKNESS,
      LOWER_WALL_HEIGHT,
      MANSION_SECRET_ROOM.entranceWidth,
      this.materials.concreteDirty,
      23,
    );
    const wall = new THREE.Mesh(geometry, this.materials.concreteDirty);
    wall.position.set(
      MANSION_SECRET_ROOM.entranceX,
      MANSION_BUNKER_Y + LOWER_WALL_HEIGHT / 2,
      MANSION_SECRET_ROOM.entranceZ,
    );
    wall.name = 'secret-room-wall';
    wall.castShadow = !this.profile.useReducedEffects;
    wall.receiveShadow = true;
    wall.userData.surface = 'concrete';
    wall.userData.mapRole = 'wall';
    this.group.add(wall);

    this.secretWallCollider = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.secretWallCollider.position.copy(wall.position);
    this.secretWallCollider.name = 'secret-room-wall-collider';
    this.secretWallCollider.userData.surface = 'concrete';
    this.secretWallCollider.userData.mapRole = 'secret-wall-collider';
    this.group.add(this.secretWallCollider);
    return wall;
  }

  private buildInterior(): void {
    // Starting room -> box room. The opening is exactly occupied by to-dining.
    this.addDoorWall('x', 2, -7, 0, -3.5, 0);
    this.addWall(4.5, LOWER_WALL_HEIGHT / 2, 2, 9, LOWER_WALL_HEIGHT, WALL_THICKNESS);

    // The east hall is the third room between its paid entrance and the sealed bunker.
    this.addDoorWall('z', 0, -8, 2, -2.5, 0);
    this.addDoorWall('z', MANSION_BUNKER_DIVIDER_X, -8, 2, -2.5, 0);
  }

  private buildStairs(): void {
    const steps = 17;
    const topZ = MANSION_STAIR_TOP_Z;
    const bottomZ = MANSION_STAIR_BOTTOM_Z;
    const run = topZ - bottomZ;
    const depth = run / steps;
    const rise = Math.abs(MANSION_BUNKER_Y) / steps;
    const stepGeometries: THREE.BoxGeometry[] = [];
    for (let index = 0; index < steps; index++) {
      const top = MANSION_BUNKER_Y + (index + 1) * rise;
      const height = top - MANSION_BUNKER_Y;
      const geometry = new THREE.BoxGeometry(2.15, Math.max(0.12, height), depth);
      this.projectSurfaceUVs(geometry, 2.15, Math.max(0.12, height), depth, this.materials.metal, index);
      geometry.translate(
        MANSION_STAIR_CENTER_X,
        MANSION_BUNKER_Y + height / 2,
        bottomZ + (index + 0.5) * depth,
      );
      stepGeometries.push(geometry);
    }
    const mergedStepsGeometry = mergeGeometries(stepGeometries);
    if (!mergedStepsGeometry) throw new Error('Unable to merge bunker stair geometry');
    const mergedSteps = new THREE.Mesh(mergedStepsGeometry, this.materials.metal);
    mergedSteps.castShadow = !this.profile.useReducedEffects;
    mergedSteps.receiveShadow = true;
    mergedSteps.name = 'bunker-stair-steps';
    mergedSteps.userData.mapRole = 'visual-stair';
    mergedSteps.userData.stepCount = steps;
    this.group.add(mergedSteps);

    const sideHeight = Math.abs(MANSION_BUNKER_Y) + 1;
    const sideY = MANSION_BUNKER_Y + sideHeight / 2;
    const sideDepth = topZ - bottomZ;
    // Fill the former side walkways so the room has one longitudinal route:
    // enter at the upper landing, descend, then leave through the lower landing.
    for (const [minX, maxX] of [[4.35, 5.475], [7.825, 9]] as const) {
      this.addWall(
        (minX + maxX) / 2,
        sideY,
        (topZ + bottomZ) / 2,
        maxX - minX,
        sideHeight,
        sideDepth,
        this.materials.charredWood,
      );
    }
    const backWallTopY = -0.5;
    const backWallHeight = backWallTopY - MANSION_BUNKER_Y;
    this.addWall(
      MANSION_STAIR_CENTER_X,
      MANSION_BUNKER_Y + backWallHeight / 2,
      topZ,
      2.65,
      backWallHeight,
      0.15,
      this.materials.charredWood,
    );

    const slopeLength = Math.hypot(run, Math.abs(MANSION_BUNKER_Y));
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.08, slopeLength), this.materials.metal);
    ramp.position.set(MANSION_STAIR_CENTER_X, MANSION_BUNKER_Y / 2 - 0.04, (topZ + bottomZ) / 2);
    ramp.rotation.x = -Math.atan2(Math.abs(MANSION_BUNKER_Y), run);
    ramp.name = 'bunker-stair-navigation-ramp';
    ramp.userData.surface = 'metal';
    ramp.userData.mapRole = 'walkable-stair-ramp';
    ramp.userData.walkableSurface = true;
    this.structureMeshes.push(ramp);
    this.group.add(ramp);

    const railLength = slopeLength;
    for (const x of [5.5, 7.8]) {
      const rail = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, railLength, 8),
        this.materials.metal,
      );
      rail.position.set(x, MANSION_BUNKER_Y / 2 + 1.05, (topZ + bottomZ) / 2);
      rail.rotation.x = -Math.atan2(run, Math.abs(MANSION_BUNKER_Y));
      rail.name = 'bunker-stair-handrail';
      rail.userData.mapRole = 'visual-stair-rail';
      this.group.add(rail);
    }
  }

  private buildProps(): void {
    // Fixed placements keep the spawn and door approaches reproducibly clear.
    this.addProp('east-hall-charred-cabinet', 0.4, 0.7, -6.1, 0.45, 1.4, 1.2, this.materials.charredWood);
  }

  private buildSecretPickups(): ReadonlyArray<ArenaWeaponPickup> {
    const secret = MANSION_SECRET_AREAS[0];
    const pickups: MansionWeaponPickup[] = [];
    for (const reward of MANSION_SPECIAL_WEAPON_CASES) {
      const caseGroup = new THREE.Group();
      caseGroup.name = `${reward.id}-case`;
      caseGroup.position.set(reward.position.x, MANSION_BUNKER_Y, reward.position.z);
      caseGroup.userData.mapRole = 'special-weapon-case';
      caseGroup.userData.weaponId = reward.weaponId;
      caseGroup.userData.purchased = false;

      const frame = new THREE.Group();
      frame.userData.mapRole = 'case-frame';
      const frameGeometry = new THREE.BoxGeometry(0.08, 1.85, 0.08);
      for (const x of [-0.55, 0.55]) {
        for (const z of [-0.4, 0.4]) {
          const post = new THREE.Mesh(frameGeometry, this.materials.metal);
          post.position.set(x, 1.05, z);
          frame.add(post);
        }
      }
      const capGeometry = new THREE.BoxGeometry(1.2, 0.12, 0.9);
      const base = new THREE.Mesh(capGeometry, this.materials.metal);
      base.position.y = 0.12;
      base.userData.surface = 'metal';
      base.userData.mapRole = 'case-base';
      const cap = new THREE.Mesh(capGeometry, this.materials.metal);
      cap.position.y = 1.98;
      frame.add(base, cap);
      caseGroup.add(frame);

      // The 12 cm base alone is below the zombie obstacle height filter, so
      // bodies walked through the glass. One solid volume covers the cabinet.
      const caseCollider = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 1.98, 0.9),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      caseCollider.position.y = 0.99;
      caseCollider.name = `${reward.id}-case-collider`;
      caseCollider.userData.surface = 'metal';
      caseCollider.userData.mapRole = 'case-collider';
      caseGroup.add(caseCollider);
      this.structureMeshes.push(caseCollider);
      this.playerWallMeshes.push(caseCollider);

      const glassMaterial = new THREE.MeshPhysicalMaterial({
        color: reward.weaponId === 'tesla' ? 0x72d8e8 : 0x8ddca0,
        transparent: true,
        opacity: 0.2,
        roughness: 0.12,
        metalness: 0.05,
        transmission: this.profile.useReducedEffects ? 0 : 0.35,
        depthWrite: false,
      });
      const glassDoor = new THREE.Mesh(new THREE.BoxGeometry(1.04, 1.62, 0.035), glassMaterial);
      glassDoor.position.set(0, 1.05, 0.42);
      glassDoor.userData.mapRole = 'case-glass';
      caseGroup.add(glassDoor);

      const pickupGroup = buildWeaponDisplayModel(
        WEAPON_DEFINITIONS[reward.weaponId],
        null,
        reward.weaponId === 'tesla' ? 0.72 : 0.62,
      );
      pickupGroup.name = reward.id;
      pickupGroup.position.set(0, 1.05, 0);
      pickupGroup.rotation.y = reward.weaponId === 'tesla' ? -0.25 : Math.PI / 2;
      pickupGroup.userData.mapRole = 'case-weapon-display';
      pickupGroup.userData.weaponId = reward.weaponId;

      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.42, 24),
        new THREE.MeshBasicMaterial({
          color: reward.weaponId === 'tesla' ? 0x66dfff : 0x79ff86,
          transparent: true,
          opacity: 0.38,
          side: THREE.DoubleSide,
        }),
      );
      halo.rotation.x = -Math.PI / 2;
      halo.position.y = -0.18;
      halo.userData.mapRole = 'secret-pickup-halo';
      pickupGroup.add(halo);
      caseGroup.add(pickupGroup);

      const light = new THREE.PointLight(
        reward.weaponId === 'tesla' ? 0x49cce8 : 0x69db7c,
        this.profile.useReducedEffects ? 0.35 : 0.65,
        2.6,
        2,
      );
      light.position.set(0, 1.45, 0);
      caseGroup.add(light);
      this.group.add(caseGroup);

      pickups.push(
        new MansionWeaponPickup(
          reward.id,
          reward.weaponId,
          reward.position,
          secret.floor,
          reward.useRange,
          reward.lookDotMin,
          secret.doorId,
          reward.cost,
          reward.interactionLabel,
          caseGroup,
          pickupGroup,
          glassDoor,
        ),
      );
    }

    const phrase = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 0.34),
      new THREE.MeshBasicMaterial({ color: 0x542020, transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
    );
    phrase.position.set(1.9, MANSION_BUNKER_Y + 1.35, 1.82);
    phrase.rotation.y = Math.PI;
    phrase.name = 'THIS IS ONLY THE BEGINNING OF THE END...';
    phrase.userData.mapRole = 'environmental-story-text';
    this.group.add(phrase);

    return pickups;
  }

  private buildAmmoRefills(): ReadonlyArray<ArenaAmmoRefill> {
    return MANSION_AMMO_REFILLS.map((config) => {
      const group = new THREE.Group();
      group.name = config.id;
      group.position.set(config.position.x, 0, config.position.z);
      group.userData.mapRole = 'ammo-refill';
      group.userData.activeFeedback = false;

      const base = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.58, 0.68), this.materials.metal);
      base.position.y = 0.29;
      base.userData.surface = 'metal';
      base.userData.mapRole = 'ammo-box-body';
      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.12, 0.72), this.materials.metal);
      lid.position.set(0, 0.64, 0);
      lid.userData.mapRole = 'ammo-box-lid';
      const iconPlate = new THREE.Mesh(
        new THREE.BoxGeometry(0.72, 0.015, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xd2bd3f }),
      );
      iconPlate.position.set(0, 0.705, 0);
      iconPlate.userData.mapRole = 'ammo-box-marking';

      const ammoIcon = new THREE.Group();
      ammoIcon.position.y = 0.745;
      ammoIcon.userData.mapRole = 'ammo-box-icon';
      const casingMaterial = new THREE.MeshStandardMaterial({ color: 0xb8862d, metalness: 0.75, roughness: 0.28 });
      const projectileMaterial = new THREE.MeshStandardMaterial({ color: 0x40362b, metalness: 0.45, roughness: 0.4 });
      for (const x of [-0.2, 0, 0.2]) {
        const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.25, 10), casingMaterial);
        casing.position.set(x, 0, 0.025);
        casing.rotation.x = Math.PI / 2;
        casing.userData.mapRole = 'ammo-icon-casing';
        const projectile = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 10), projectileMaterial);
        projectile.position.set(x, 0, -0.16);
        projectile.rotation.x = -Math.PI / 2;
        projectile.userData.mapRole = 'ammo-icon-projectile';
        ammoIcon.add(casing, projectile);
      }
      const glow = new THREE.PointLight(0xe4cd4e, 0.35, 2.2, 2);
      glow.position.set(0, 0.85, 0);
      group.add(base, lid, iconPlate, ammoIcon, glow);
      this.group.add(group);
      this.structureMeshes.push(base);
      this.playerWallMeshes.push(base);

      return new MansionAmmoRefill(
        config.id,
        config.cost,
        config.interactionLabel,
        config.position,
        config.floor,
        config.useRange,
        config.lookDotMin,
        group,
        lid,
        glow,
      );
    });
  }

  private buildBunkerDetails(): void {
    const radiationSign = new THREE.Group();
    radiationSign.position.set(
      MANSION_BUNKER_ENDING.position.x,
      MANSION_BUNKER_ENDING.position.y,
      MANSION_BUNKER_ENDING.position.z,
    );
    radiationSign.rotation.y = Math.PI / 2;
    radiationSign.name = 'radiation-warning-symbol';
    radiationSign.userData.mapRole = 'bunker-ending-interaction';
    const signBack = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.15),
      new THREE.MeshBasicMaterial({ color: 0xb69b2f, side: THREE.DoubleSide }),
    );
    signBack.userData.mapRole = 'radiation-sign-background';
    radiationSign.add(signBack);
    const symbolMaterial = new THREE.MeshBasicMaterial({ color: 0x181713, side: THREE.DoubleSide });
    const center = new THREE.Mesh(new THREE.CircleGeometry(0.105, 18), symbolMaterial);
    center.position.z = 0.012;
    center.userData.mapRole = 'radiation-symbol-part';
    radiationSign.add(center);
    for (let index = 0; index < 3; index++) {
      const blade = new THREE.Mesh(
        new THREE.RingGeometry(0.16, 0.43, 20, 1, index * (Math.PI * 2 / 3) - 0.43, 0.86),
        symbolMaterial,
      );
      blade.position.z = 0.012;
      blade.userData.mapRole = 'radiation-symbol-part';
      radiationSign.add(blade);
    }
    this.group.add(radiationSign);

    const secretRoomLight = new THREE.PointLight(
      0x8a4325,
      this.profile.useReducedEffects ? 0.14 : 0.28,
      4,
      2,
    );
    secretRoomLight.position.set(
      MANSION_SECRET_ROOM.centerX,
      MANSION_BUNKER_Y + 2.45,
      MANSION_SECRET_ROOM.centerZ,
    );
    secretRoomLight.name = 'secret-room-ambient-light';
    secretRoomLight.castShadow = false;
    this.group.add(secretRoomLight);

  }

  private buildDamageDetails(): void {
    const details: ReadonlyArray<{
      readonly x: number;
      readonly y: number;
      readonly z: number;
      readonly width: number;
      readonly height: number;
      readonly rotationY: number;
      readonly material: THREE.MeshStandardMaterial;
      readonly role: string;
    }> = [
      { x: -5.4, y: 1.35, z: 1.835, width: 1.45, height: 1.7, rotationY: 0, material: this.materials.exposedBrick, role: 'exposed-brick' },
      { x: -1.2, y: 1.25, z: 1.835, width: 0.8, height: 1.5, rotationY: 0, material: this.materials.crack, role: 'wall-crack' },
      { x: -0.165, y: 1.45, z: -5.9, width: 1.1, height: 1.8, rotationY: Math.PI / 2, material: this.materials.damp, role: 'damp-stain' },
      { x: MANSION_BUNKER_DIVIDER_X - 0.165, y: 1.45, z: -6.15, width: 1.15, height: 1.8, rotationY: Math.PI / 2, material: this.materials.exposedBrick, role: 'exposed-brick' },
      { x: -7.0, y: 2.42, z: 5.4, width: 1.7, height: 1.35, rotationY: Math.PI / 2, material: this.materials.sootHeavy, role: 'soot-detail' },
      { x: -7.0, y: 2.4, z: -3.2, width: 1.85, height: 1.25, rotationY: Math.PI / 2, material: this.materials.sootSoft, role: 'soot-detail' },
      { x: -3.5, y: 2.42, z: 10.0, width: 2, height: 1.3, rotationY: Math.PI, material: this.materials.sootHeavy, role: 'soot-detail' },
      { x: -3.5, y: 2.4, z: -8.0, width: 1.8, height: 1.25, rotationY: 0, material: this.materials.sootSoft, role: 'soot-detail' },
      { x: MANSION_EAST_WALL_X - 0.15, y: 2.45, z: -4.5, width: 1.9, height: 1.35, rotationY: -Math.PI / 2, material: this.materials.sootHeavy, role: 'soot-detail' },
      { x: -3.5, y: 2.55, z: 1.835, width: 2.05, height: 1.15, rotationY: 0, material: this.materials.sootSoft, role: 'soot-detail' },
      { x: 0.165, y: 2.52, z: -2.5, width: 1.9, height: 1.1, rotationY: Math.PI / 2, material: this.materials.sootSoft, role: 'soot-detail' },
      { x: 1.6, y: 2.45, z: 1.835, width: 2.1, height: 1.25, rotationY: Math.PI, material: this.materials.sootHeavy, role: 'soot-detail' },
    ];
    for (const detail of details) {
      const patch = new THREE.Mesh(new THREE.PlaneGeometry(detail.width, detail.height), detail.material);
      patch.position.set(detail.x, detail.y, detail.z);
      patch.rotation.y = detail.rotationY;
      patch.userData.mapRole = detail.role;
      this.group.add(patch);
    }

    const ceilingScorch = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.3), this.materials.sootSoft);
    ceilingScorch.position.set(-3.7, 3.185, 5.2);
    ceilingScorch.rotation.x = Math.PI / 2;
    ceilingScorch.rotation.z = 0.35;
    ceilingScorch.userData.mapRole = 'ceiling-soot';
    this.group.add(ceilingScorch);
  }

  private buildWindowFrames(): void {
    const verticalGeometry = new THREE.BoxGeometry(0.12, 1.9, 0.12);
    const horizontalGeometry = new THREE.BoxGeometry(1.8, 0.12, 0.12);
    this.projectSurfaceUVs(verticalGeometry, 0.12, 1.9, 0.12, this.materials.charredWood, 3);
    this.projectSurfaceUVs(horizontalGeometry, 1.8, 0.12, 0.12, this.materials.charredWood, 7);
    const verticals = new THREE.InstancedMesh(verticalGeometry, this.materials.charredWood, MANSION_BARRIERS.length * 2);
    const horizontals = new THREE.InstancedMesh(horizontalGeometry, this.materials.charredWood, MANSION_BARRIERS.length * 2);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    for (let index = 0; index < MANSION_BARRIERS.length; index++) {
      const barrier = MANSION_BARRIERS[index];
      const angle = Math.atan2(barrier.outwardX, barrier.outwardZ);
      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      const rightX = Math.cos(angle);
      const rightZ = -Math.sin(angle);
      for (const side of [-1, 1]) {
        position.set(barrier.x + rightX * 0.84 * side, 1.1, barrier.z + rightZ * 0.84 * side);
        verticals.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), matrix.compose(position, quaternion, scale));
      }
      for (const edge of [0.22, 2.0]) {
        position.set(barrier.x, edge, barrier.z);
        horizontals.setMatrixAt(index * 2 + (edge > 1 ? 1 : 0), matrix.compose(position, quaternion, scale));
      }
    }
    verticals.castShadow = !this.profile.useReducedEffects;
    horizontals.castShadow = !this.profile.useReducedEffects;
    verticals.userData.mapRole = 'window-frames';
    horizontals.userData.mapRole = 'window-frames';
    this.group.add(verticals, horizontals);
  }

  private buildLighting(): void {
    this.group.add(
      new THREE.HemisphereLight(0x34465e, 0x110d0a, this.profile.useReducedEffects ? 0.18 : 0.25),
    );
    this.addPointLight(-3.8, 2.55, 6.5, 2.4, 6.5, GROUND_CEILING_Y);
    this.addPointLight(-4.5, 2.35, -4.8, 1.7, 6.5, GROUND_CEILING_Y);
    this.addPointLight(2.1, 2.35, -4.8, 1.1, 5.2, GROUND_CEILING_Y);
    // Hung under a real ceiling segment: the stair aperture has no slab to
    // anchor the cord to, so a bulb placed there floated unattached.
    this.addPointLight(
      3.4,
      MANSION_BUNKER_Y + 2.45,
      -5.6,
      1.05,
      5.5,
      BUNKER_CEILING_Y,
    );
    this.addPointLight(
      -1.4,
      MANSION_BUNKER_Y + 2.35,
      -4.6,
      1.35,
      7,
      BUNKER_CEILING_Y,
    );
    this.addPointLight(
      -5.2,
      MANSION_BUNKER_Y + 2.4,
      -1.6,
      1.15,
      6.5,
      BUNKER_CEILING_Y,
    );
    this.addPointLight(
      -4.8,
      MANSION_BUNKER_Y + 2.4,
      -6.6,
      0.95,
      6,
      BUNKER_CEILING_Y,
    );

    const exteriorLight = new THREE.DirectionalLight(0x9ebbd2, this.profile.useReducedEffects ? 0.18 : 0.3);
    exteriorLight.position.set(-8, 5, 7);
    exteriorLight.target.position.set(-2, 1.2, 2);
    this.group.add(exteriorLight, exteriorLight.target);
  }

  private buildFloorTransitions(): ReadonlyArray<FloorTransitionZone> {
    // The ramp volume covers the stair aperture exactly: inside it height
    // follows the slope, outside it every body sits on its own floor plane.
    const ramp: StairRamp = {
      box: new THREE.Box3(
        new THREE.Vector3(5.4, MANSION_BUNKER_Y - 0.2, MANSION_STAIR_BOTTOM_Z - 0.15),
        new THREE.Vector3(7.9, 2.1, MANSION_STAIR_TOP_Z + 0.03),
      ),
      top: { x: MANSION_STAIR_CENTER_X, y: 0, z: MANSION_STAIR_TOP_Z },
      bottom: { x: MANSION_STAIR_CENTER_X, y: MANSION_BUNKER_Y, z: MANSION_STAIR_BOTTOM_Z },
      topApproach: { x: 4.8, y: 0, z: -2.5 },
    };
    return [
      {
        box: new THREE.Box3(
          new THREE.Vector3(5.45, MANSION_BUNKER_Y - 0.2, MANSION_STAIR_BOTTOM_Z - 0.35),
          new THREE.Vector3(7.85, 1, MANSION_STAIR_BOTTOM_Z + 0.15),
        ),
        sourceFloor: 0,
        targetFloor: -1,
        targetY: MANSION_BUNKER_Y + EYE_HEIGHT,
        bounds: MANSION_BUNKER_BOUNDS,
        ramp,
      },
      {
        box: new THREE.Box3(
          new THREE.Vector3(5.45, -0.5, MANSION_STAIR_TOP_Z - 0.2),
          new THREE.Vector3(7.85, 2.2, MANSION_STAIR_TOP_Z + 0.15),
        ),
        sourceFloor: -1,
        targetFloor: 0,
        targetY: EYE_HEIGHT,
        bounds: MANSION_GROUND_BOUNDS,
        ramp,
      },
    ];
  }

  private addWindowedWall(
    axis: WallAxis,
    fixed: number,
    min: number,
    max: number,
    openingCenters: ReadonlyArray<number>,
  ): void {
    const span = max - min;
    const center = (min + max) / 2;
    const middleHeight = WINDOW_TOP - WINDOW_SILL;
    this.addAxisWall(axis, fixed, center, WINDOW_SILL / 2, span, WINDOW_SILL);
    this.addAxisWall(
      axis,
      fixed,
      center,
      WINDOW_TOP + (LOWER_WALL_HEIGHT - WINDOW_TOP) / 2,
      span,
      LOWER_WALL_HEIGHT - WINDOW_TOP,
    );

    let cursor = min;
    for (const opening of [...openingCenters].sort((a, b) => a - b)) {
      const start = opening - WINDOW_WIDTH / 2;
      if (start > cursor) {
        this.addAxisWall(axis, fixed, (cursor + start) / 2, WINDOW_SILL + middleHeight / 2, start - cursor, middleHeight);
      }
      cursor = opening + WINDOW_WIDTH / 2;
    }
    if (cursor < max) {
      this.addAxisWall(axis, fixed, (cursor + max) / 2, WINDOW_SILL + middleHeight / 2, max - cursor, middleHeight);
    }
  }

  private addDoorWall(axis: WallAxis, fixed: number, min: number, max: number, opening: number, baseY: number): void {
    const openingStart = opening - DOOR_WIDTH / 2;
    const openingEnd = opening + DOOR_WIDTH / 2;
    this.addAxisWall(axis, fixed, (min + openingStart) / 2, baseY + LOWER_WALL_HEIGHT / 2, openingStart - min, LOWER_WALL_HEIGHT);
    this.addAxisWall(axis, fixed, (openingEnd + max) / 2, baseY + LOWER_WALL_HEIGHT / 2, max - openingEnd, LOWER_WALL_HEIGHT);
    this.addAxisWall(axis, fixed, opening, baseY + 2.65, DOOR_WIDTH, 1.1);
  }

  private addAxisWall(axis: WallAxis, fixed: number, along: number, y: number, length: number, height: number): void {
    if (length <= 0.01 || height <= 0.01) return;
    if (axis === 'x') this.addWall(along, y, fixed, length, height, WALL_THICKNESS);
    else this.addWall(fixed, y, along, WALL_THICKNESS, height, length);
  }

  private addWall(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    material?: THREE.MeshStandardMaterial,
  ): void {
    const surfaceMaterial = material ?? this.nextWallMaterial();
    const geometry = new THREE.BoxGeometry(width, height, depth);
    this.projectSurfaceUVs(geometry, width, height, depth, surfaceMaterial, this.wallMaterialIndex);
    const mesh = new THREE.Mesh(geometry, surfaceMaterial);
    mesh.position.set(x, y, z);
    mesh.castShadow = !this.profile.useReducedEffects;
    mesh.receiveShadow = true;
    mesh.userData.surface = surfaceMaterial === this.materials.charredWood ? 'wood' : 'concrete';
    mesh.userData.mapRole = 'wall';
    this.structureMeshes.push(mesh);
    this.playerWallMeshes.push(mesh);
    this.group.add(mesh);
  }

  private addSlab(
    name: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
  ): void {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    this.projectSurfaceUVs(geometry, width, height, depth, material as THREE.MeshStandardMaterial, name.length);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.name = name;
    mesh.receiveShadow = true;
    mesh.userData.surface = 'concrete';
    mesh.userData.mapRole = 'slab';
    this.structureMeshes.push(mesh);
    this.group.add(mesh);
  }

  private addProp(
    name: string,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
  ): void {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    this.projectSurfaceUVs(geometry, width, height, depth, material as THREE.MeshStandardMaterial, name.length);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.name = name;
    mesh.castShadow = !this.profile.useReducedEffects;
    mesh.receiveShadow = true;
    mesh.userData.surface = material === this.materials.metal ? 'metal' : 'wood';
    mesh.userData.mapRole = 'solid-prop';
    this.structureMeshes.push(mesh);
    this.playerWallMeshes.push(mesh);
    this.group.add(mesh);
  }

  private addPointLight(
    x: number,
    y: number,
    z: number,
    intensity: number,
    distance: number,
    ceilingY: number = GROUND_CEILING_Y,
  ): THREE.PointLight {
    const light = new THREE.PointLight(0xffffff, intensity, distance, 1.8);
    light.position.set(x, y, z);
    const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      bulbMaterial,
    );
    bulb.position.copy(light.position);
    bulb.userData.mapRole = 'damaged-bulb';

    // Bare bulb hanging from a wire off a ceiling mount — no bulb should float unattached.
    const cordHeight = Math.max(0.05, ceilingY - y);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, cordHeight, 6), this.materials.metal);
    cord.position.set(x, y + cordHeight / 2, z);
    cord.userData.mapRole = 'light-cord';

    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.05, 8), this.materials.metal);
    mount.position.set(x, ceilingY - 0.025, z);
    mount.userData.mapRole = 'light-mount';

    this.group.add(light, cord, mount, bulb);
    this.areaLights.add(light, bulbMaterial);
    return light;
  }

  /**
   * Three.js evaluates every visible point light in every PBR fragment. The
   * stair aperture exposes both floors at once, so keeping every decorative
   * light active there made this small room the map's worst GPU hot spot.
   * Cache static world positions and retain only the strongest local lights.
   */
  private initializePointLightBudget(): void {
    this.group.updateMatrixWorld(true);
    this.group.traverse((object) => {
      if (!(object instanceof THREE.PointLight)) return;
      this.rankedPointLights.push({
        light: object,
        position: object.getWorldPosition(new THREE.Vector3()),
        score: 0,
      });
    });
    this.updatePointLightBudget(new THREE.Vector3(
      this.playerSpawn.x,
      this.playerSpawn.y,
      this.playerSpawn.z,
    ));
  }

  private updatePointLightBudget(observerPosition: THREE.Vector3): void {
    for (const entry of this.rankedPointLights) {
      const distanceSq = entry.position.distanceToSquared(observerPosition);
      const outsideRange = entry.light.distance > 0 && distanceSq > entry.light.distance ** 2;
      entry.score = outsideRange ? 0 : entry.light.intensity / (1 + distanceSq);
    }
    this.rankedPointLights.sort((left, right) => right.score - left.score);
    const budget = this.profile.useReducedEffects
      ? REDUCED_EFFECTS_POINT_LIGHT_BUDGET
      : DESKTOP_POINT_LIGHT_BUDGET;
    for (let index = 0; index < this.rankedPointLights.length; index++) {
      this.rankedPointLights[index].light.visible = index < budget;
    }
  }

  private nextWallMaterial(): THREE.MeshStandardMaterial {
    const material = this.materials.wallVariants[this.wallMaterialIndex % this.materials.wallVariants.length];
    this.wallMaterialIndex++;
    return material;
  }

  private projectSurfaceUVs(
    geometry: THREE.BoxGeometry,
    width: number,
    height: number,
    depth: number,
    material: THREE.MeshStandardMaterial,
    seed: number,
  ): void {
    const metersPerTile = material.userData.metersPerTile as number | undefined;
    if (!metersPerTile) return;
    projectBoxUVs(
      geometry,
      width,
      height,
      depth,
      metersPerTile,
      (seed * 0.37) % 1,
      (seed * 0.61) % 1,
    );
  }

  private addDebugHelpers(): void {
    for (const box of this.wallColliders) this.group.add(new THREE.Box3Helper(box, 0x00ff66));
    const spawn = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true }),
    );
    spawn.position.set(this.playerSpawn.x, this.playerSpawn.y, this.playerSpawn.z);
    this.group.add(spawn);
    for (const zone of Object.values(MANSION_SPAWNS)) {
      for (const point of zone) {
        const marker = new THREE.Mesh(
          new THREE.SphereGeometry(0.16, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff3355, wireframe: true }),
        );
        marker.position.set(point.x, 0.2, point.z);
        this.group.add(marker);
        if (
          point.approachX !== undefined &&
          point.approachZ !== undefined &&
          point.breachX !== undefined &&
          point.breachZ !== undefined
        ) {
          const route = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(point.x, 0.25, point.z),
              new THREE.Vector3(point.approachX, 0.25, point.approachZ),
              new THREE.Vector3(point.breachX, 0.25, point.breachZ),
            ]),
            new THREE.LineBasicMaterial({ color: 0xffcc33 }),
          );
          this.group.add(route);
        }
      }
    }
  }
}
