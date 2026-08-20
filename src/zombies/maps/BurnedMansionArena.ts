import * as THREE from 'three';
import type { DeviceProfile } from '../../core/DeviceProfile';
import { EYE_HEIGHT, type FloorTransitionZone, type StairRamp } from '../../player/PlayerController';
import { WindowBarrier } from '../barriers/WindowBarrier';
import { WindowBarrierView } from '../barriers/WindowBarrierView';
import { PointDoor } from '../doors/PointDoor';
import { PointDoorView } from '../doors/PointDoorView';
import type { ZombieSpawnDefinition, ZombieSpawnPoint } from '../ZombieSpawner';
import { WallBuy } from '../wallbuys/WallBuy';
import { WallBuyView } from '../wallbuys/WallBuyView';
import { WEAPON_DEFINITIONS } from '../../config/weapons';
import { buildWeaponDisplayModel } from '../../weapons/WeaponView';
import type { WeaponId } from '../../weapons/WeaponTypes';
import type { ArenaCompletionInteraction, ArenaWeaponPickup, ZombieArena } from './ZombieArena';
import {
  createMansionSurfaceMaterials,
  projectBoxUVs,
  type MansionSurfaceMaterials,
} from './BurnedMansionMaterials';
import {
  BARRIER_CONFIG,
  DEBUG_MAP_COLLIDERS,
  MANSION_BARRIERS,
  MANSION_BUNKER_BOUNDS,
  MANSION_BUNKER_ENDING,
  MANSION_BUNKER_Y,
  MANSION_BOX_PLACEMENT,
  MANSION_DOORS,
  MANSION_GROUND_BOUNDS,
  MANSION_PLAYER_SPAWN,
  MANSION_SPAWNS,
  MANSION_SECRET_AREAS,
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

type WallAxis = 'x' | 'z';

class MansionWeaponPickup implements ArenaWeaponPickup {
  private claimed = false;

  constructor(
    readonly id: string,
    readonly weaponId: WeaponId,
    readonly position: { readonly x: number; readonly y: number; readonly z: number },
    readonly floor: number,
    readonly useRange: number,
    readonly lookDotMin: number,
    readonly requiredDoorId: string,
    private readonly view: THREE.Object3D,
  ) {}

  get available(): boolean {
    return !this.claimed;
  }

  claim(): boolean {
    if (this.claimed) return false;
    this.claimed = true;
    this.view.visible = false;
    return true;
  }

  reset(): void {
    this.claimed = false;
    this.view.visible = true;
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
  onTopologyChanged: (() => void) | null = null;

  colliders: ReadonlyArray<THREE.Object3D> = [];
  wallColliders: ReadonlyArray<THREE.Box3> = [];
  barriers: ReadonlyArray<WindowBarrier> = [];
  readonly doors: ReadonlyArray<PointDoor>;
  readonly wallBuys: ReadonlyArray<WallBuy>;
  readonly weaponPickups: ReadonlyArray<ArenaWeaponPickup>;
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
  private wallMaterialIndex = 0;
  private bunkerEmergencyLight: THREE.PointLight | null = null;
  private ambienceTime = 0;

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
    this.buildDamageDetails();
    this.buildWindowFrames();
    this.buildLighting();

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
      const view = new WindowBarrierView(barrier, this.group);
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
    if (DEBUG_MAP_COLLIDERS) this.addDebugHelpers();
  }

  public init(): void {
    this.scene.background = new THREE.Color(0x0d0b0a);
    this.scene.fog = new THREE.FogExp2(0x17110e, 0.018);
  }

  public update(dt: number): void {
    for (const view of this.barrierViews) view.update();
    for (let index = 0; index < this.doorViews.length; index++) {
      if (!this.doorViews[index].update(dt)) continue;
      const doorId = this.doors[index].id;
      this.openDoorIds.add(doorId);
      this.activeSpawnZones.add(doorId);
      this.refreshProgressionState();
      this.onTopologyChanged?.();
    }
    this.ambienceTime += dt;
    if (this.bunkerEmergencyLight) {
      this.bunkerEmergencyLight.intensity = 1.05 + Math.sin(this.ambienceTime * 3.1) * 0.18;
    }
  }

  public reset(): void {
    for (const barrier of this.allBarriers) barrier.reset();
    for (const door of this.doors) door.reset();
    for (const view of this.doorViews) view.reset();
    for (const pickup of this.weaponPickups) pickup.reset();
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
    const outside = point.x < -7.45 || point.x > 7.45 || point.z < -8.45 || point.z > 8.45;
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
    for (let i = 0; i < this.doors.length; i++) {
      if (!this.openDoorIds.has(this.doors[i].id)) colliders.push(this.doorMeshes[i]);
    }
    return colliders;
  }

  private collectPlayerWallColliders(): ReadonlyArray<THREE.Box3> {
    const boxes = this.playerWallMeshes.map((mesh) => new THREE.Box3().setFromObject(mesh));
    for (let i = 0; i < this.doors.length; i++) {
      if (!this.openDoorIds.has(this.doors[i].id)) boxes.push(new THREE.Box3().setFromObject(this.doorMeshes[i]));
    }
    return boxes;
  }

  private buildShell(): void {
    this.addSlab('ground-floor', -1.425, -0.08, 0, 11.15, 0.16, 16, this.materials.floorConcrete);
    this.addSlab('ground-floor-east', 6.575, -0.08, 0, 0.85, 0.16, 16, this.materials.floorConcrete);
    this.addSlab('ground-floor-stair-north', 5.15, -0.08, -7.45, 2, 0.16, 1.1, this.materials.floorConcrete);
    this.addSlab('ground-floor-stair-south', 5.15, -0.08, 2.5, 2, 0.16, 11, this.materials.floorConcrete);

    this.addWindowedWall('z', -7.15, -8, 8, [-3.2, 3.2, 5.4]);
    this.addWindowedWall('z', 7.15, -8, 8, [-2.5]);
    this.addWindowedWall('x', -8.15, -7, 7, [-3.5, 1.6]);
    this.addWindowedWall('x', 8.15, -7, 7, [-3.5]);

    this.addSlab('mansion-roof', 0, 3.28, 0, 14.6, 0.16, 16.6, this.materials.ceilingBurned);

    this.addSlab('bunker-floor', 1.9, MANSION_BUNKER_Y - 0.08, -3.5, 10.2, 0.16, 9, this.materials.floorConcrete);
    // Mirror the ground-floor stair opening instead of sealing the stairs behind a ceiling slab.
    this.addSlab('bunker-ceiling', 0.475, -0.22, -3.5, 7.35, 0.16, 9, this.materials.ceilingBurned);
    this.addSlab('bunker-ceiling-east', 6.575, -0.22, -3.5, 0.85, 0.16, 9, this.materials.ceilingBurned);
    this.addSlab('bunker-ceiling-stair-north', 5.15, -0.22, -7.45, 2, 0.16, 1.1, this.materials.ceilingBurned);
    this.addSlab('bunker-ceiling-stair-south', 5.15, -0.22, -1, 2, 0.16, 4, this.materials.ceilingBurned);
    const bunkerWallY = MANSION_BUNKER_Y + LOWER_WALL_HEIGHT / 2;
    this.addWall(-3.2, bunkerWallY, -3.5, WALL_THICKNESS, LOWER_WALL_HEIGHT, 9, this.materials.concreteDirty);
    this.addWall(7, bunkerWallY, -3.5, WALL_THICKNESS, LOWER_WALL_HEIGHT, 9, this.materials.concreteDirty);
    this.addWall(1.9, bunkerWallY, -8, 10.2, LOWER_WALL_HEIGHT, WALL_THICKNESS, this.materials.concreteDirty);
    this.addWall(1.9, bunkerWallY, 1, 10.2, LOWER_WALL_HEIGHT, WALL_THICKNESS, this.materials.concreteDirty);
  }

  private buildInterior(): void {
    // Starting room -> box room. The opening is exactly occupied by to-dining.
    this.addDoorWall('x', 2, -7, 0, -3.5, 0);
    this.addWall(3.5, LOWER_WALL_HEIGHT / 2, 2, 7, LOWER_WALL_HEIGHT, WALL_THICKNESS);

    // The east hall is the third room between its paid entrance and the sealed bunker.
    this.addDoorWall('z', 0, -8, 2, -2.5, 0);
    this.addDoorWall('z', 3.2, -8, 2, -2.5, 0);
  }

  private buildStairs(): void {
    const steps = 17;
    const topZ = -2.85;
    const bottomZ = -6.75;
    const run = topZ - bottomZ;
    const depth = run / steps;
    const rise = Math.abs(MANSION_BUNKER_Y) / steps;
    for (let index = 0; index < steps; index++) {
      const top = MANSION_BUNKER_Y + (index + 1) * rise;
      const height = top - MANSION_BUNKER_Y;
      const geometry = new THREE.BoxGeometry(1.65, Math.max(0.12, height), depth);
      this.projectSurfaceUVs(geometry, 1.65, Math.max(0.12, height), depth, this.materials.metal, index);
      const step = new THREE.Mesh(geometry, this.materials.metal);
      step.position.set(5.15, MANSION_BUNKER_Y + height / 2, bottomZ + (index + 0.5) * depth);
      step.castShadow = !this.profile.useReducedEffects;
      step.receiveShadow = true;
      step.name = `bunker-stair-step-${index}`;
      step.userData.mapRole = 'visual-stair';
      this.group.add(step);
    }

    const slopeLength = Math.hypot(run, Math.abs(MANSION_BUNKER_Y));
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.08, slopeLength), this.materials.metal);
    ramp.position.set(5.15, MANSION_BUNKER_Y / 2 - 0.04, (topZ + bottomZ) / 2);
    ramp.rotation.x = -Math.atan2(Math.abs(MANSION_BUNKER_Y), run);
    ramp.name = 'bunker-stair-navigation-ramp';
    ramp.userData.surface = 'metal';
    ramp.userData.mapRole = 'walkable-stair-ramp';
    ramp.userData.walkableSurface = true;
    this.structureMeshes.push(ramp);
    this.group.add(ramp);

    const railLength = slopeLength;
    for (const x of [4.25, 6.05]) {
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
    this.addProp('burned-sofa', -5.5, 0.35, 6.8, 1.8, 0.7, 0.65, this.materials.charredWood);
    this.addProp('box-room-cabinet', -5.8, 0.8, -1.2, 1.2, 1.6, 0.5, this.materials.charredWood);
    this.addProp('east-hall-charred-cabinet', 0.4, 0.7, -6.1, 0.45, 1.4, 1.2, this.materials.charredWood);
    this.addProp('bunker-console', 6.3, MANSION_BUNKER_Y + 0.65, -1, 0.55, 1.3, 1.7, this.materials.metal);
    this.addProp('research-table', -1.2, MANSION_BUNKER_Y + 0.42, -2.2, 1.7, 0.84, 0.7, this.materials.metal);
    this.addProp('zeus-containment-pedestal', -1.7, MANSION_BUNKER_Y + 0.55, -6.1, 0.9, 1.1, 0.9, this.materials.metal);
    this.addProp('military-crate', 1.4, MANSION_BUNKER_Y + 0.35, -6.35, 0.8, 0.7, 1.1, this.materials.charredWood);

    const rubble = new THREE.DodecahedronGeometry(0.18, 0);
    // Starting room stays clear of debris: it sat in the spawn walkway and read as a stray floating rock.
    const positions: ReadonlyArray<readonly [number, number]> = [
      [-5.8, 1.2], [-4.5, -1.8], [-2.2, -6.8], [1.1, -5.8], [5.8, -2.2],
    ];
    for (let index = 0; index < positions.length; index++) {
      const mesh = new THREE.Mesh(rubble, this.materials.debris);
      mesh.position.set(positions[index][0], 0.15, positions[index][1]);
      mesh.scale.setScalar(0.8 + (index % 3) * 0.25);
      mesh.rotation.set(index * 0.4, index * 0.7, index * 0.2);
      mesh.castShadow = !this.profile.useReducedEffects;
      mesh.userData.mapRole = 'visual-debris';
      this.group.add(mesh);
    }
  }

  private buildSecretPickups(): ReadonlyArray<ArenaWeaponPickup> {
    const secret = MANSION_SECRET_AREAS[0];
    const pickups: MansionWeaponPickup[] = [];
    for (const reward of secret.rewards) {
      const pickupGroup = buildWeaponDisplayModel(
        WEAPON_DEFINITIONS[reward.weaponId],
        null,
        reward.weaponId === 'tesla' ? 0.9 : 0.75,
      );
      pickupGroup.name = reward.id;
      pickupGroup.position.set(reward.position.x, reward.position.y, reward.position.z);
      pickupGroup.rotation.y = reward.weaponId === 'tesla' ? -0.25 : Math.PI / 2;
      pickupGroup.userData.mapRole = 'secret-weapon-pickup';
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
      this.group.add(pickupGroup);

      pickups.push(
        new MansionWeaponPickup(
          reward.id,
          reward.weaponId,
          reward.position,
          secret.floor,
          reward.useRange,
          reward.lookDotMin,
          secret.doorId,
          pickupGroup,
        ),
      );
    }

    const phrase = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 0.34),
      new THREE.MeshBasicMaterial({ color: 0x542020, transparent: true, opacity: 0.65, side: THREE.DoubleSide }),
    );
    phrase.position.set(1.9, MANSION_BUNKER_Y + 1.35, 0.82);
    phrase.rotation.y = Math.PI;
    phrase.name = 'THIS IS ONLY THE BEGINNING OF THE END...';
    phrase.userData.mapRole = 'environmental-story-text';
    this.group.add(phrase);

    return pickups;
  }

  private buildBunkerDetails(): void {
    const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x384044, metalness: 0.78, roughness: 0.55 });
    for (let index = 0; index < 3; index++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 7.6, 8), pipeMaterial);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(6.82 - index * 0.16, MANSION_BUNKER_Y + 2.15 - index * 0.22, -3.5);
      pipe.userData.mapRole = 'bunker-pipe';
      this.group.add(pipe);
    }

    const screenMaterial = new THREE.MeshBasicMaterial({ color: 0x07100d });
    for (let index = 0; index < 3; index++) {
      const monitor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.04), screenMaterial);
      monitor.position.set(6.65, MANSION_BUNKER_Y + 1.05 + index * 0.32, -1.45 + index * 0.48);
      monitor.rotation.y = -Math.PI / 2;
      monitor.userData.mapRole = 'dead-monitor';
      this.group.add(monitor);
    }

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

    const containmentGlow = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.035, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x36c7e8, transparent: true, opacity: 0.7 }),
    );
    containmentGlow.position.set(-1.7, MANSION_BUNKER_Y + 0.04, -6.1);
    containmentGlow.rotation.x = Math.PI / 2;
    containmentGlow.userData.mapRole = 'zeus-containment-ring';
    this.group.add(containmentGlow);
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
      { x: 3.035, y: 1.45, z: -6.15, width: 1.15, height: 1.8, rotationY: Math.PI / 2, material: this.materials.exposedBrick, role: 'exposed-brick' },
      { x: -7.0, y: 2.42, z: 5.4, width: 1.7, height: 1.35, rotationY: Math.PI / 2, material: this.materials.sootHeavy, role: 'soot-detail' },
      { x: -7.0, y: 2.4, z: -3.2, width: 1.85, height: 1.25, rotationY: Math.PI / 2, material: this.materials.sootSoft, role: 'soot-detail' },
      { x: -3.5, y: 2.42, z: 8.0, width: 2, height: 1.3, rotationY: Math.PI, material: this.materials.sootHeavy, role: 'soot-detail' },
      { x: -3.5, y: 2.4, z: -8.0, width: 1.8, height: 1.25, rotationY: 0, material: this.materials.sootSoft, role: 'soot-detail' },
      { x: 7.0, y: 2.45, z: -4.5, width: 1.9, height: 1.35, rotationY: -Math.PI / 2, material: this.materials.sootHeavy, role: 'soot-detail' },
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
    ceilingScorch.position.set(-3.7, 3.185, 3.8);
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
    this.addPointLight(-3.8, 2.55, 5, 0xffad68, 2.4, 6.5, GROUND_CEILING_Y);
    this.addPointLight(-4.5, 2.35, -4.8, 0x839db7, 1.7, 6.5, GROUND_CEILING_Y);
    this.addPointLight(1.6, 2.35, -4.8, 0xb35b32, 1.1, 5.2, GROUND_CEILING_Y);
    this.addPointLight(5.2, 1.85, -5.5, 0x6e120d, 0.35, 4.5, GROUND_CEILING_Y);
    this.bunkerEmergencyLight = this.addPointLight(
      5.2,
      MANSION_BUNKER_Y + 2.45,
      -4.4,
      0xff2418,
      1.05,
      5.5,
      BUNKER_CEILING_Y,
    );
    this.addPointLight(
      -1.4,
      MANSION_BUNKER_Y + 2.35,
      -4.6,
      0x5eabc4,
      1.35,
      7,
      BUNKER_CEILING_Y,
    );

    const exteriorLight = new THREE.DirectionalLight(0x9ebbd2, this.profile.useReducedEffects ? 0.18 : 0.3);
    exteriorLight.position.set(-8, 5, 7);
    exteriorLight.target.position.set(-2, 1.2, 2);
    this.group.add(exteriorLight, exteriorLight.target);
  }

  private buildFloorTransitions(): ReadonlyArray<FloorTransitionZone> {
    const ramp: StairRamp = {
      box: new THREE.Box3(
        new THREE.Vector3(4.25, MANSION_BUNKER_Y - 0.2, -6.78),
        new THREE.Vector3(6.05, 2.1, -2.82),
      ),
      top: { x: 5.15, y: 0, z: -2.85 },
      bottom: { x: 5.15, y: MANSION_BUNKER_Y, z: -6.75 },
    };
    return [
      {
        box: new THREE.Box3(
          new THREE.Vector3(4.2, MANSION_BUNKER_Y - 0.2, -7.1),
          new THREE.Vector3(6.1, 1, -6.6),
        ),
        sourceFloor: 0,
        targetFloor: -1,
        targetY: MANSION_BUNKER_Y + EYE_HEIGHT,
        bounds: MANSION_BUNKER_BOUNDS,
        ramp,
      },
      {
        box: new THREE.Box3(
          new THREE.Vector3(4.2, -0.5, -3.05),
          new THREE.Vector3(6.1, 2.2, -2.7),
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
    color: number,
    intensity: number,
    distance: number,
    ceilingY: number = GROUND_CEILING_Y,
  ): THREE.PointLight {
    const light = new THREE.PointLight(color, intensity, distance, 1.8);
    light.position.set(x, y, z);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 6),
      new THREE.MeshBasicMaterial({ color }),
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
    return light;
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
