import * as THREE from 'three';
import type { DeviceProfile } from '../../core/DeviceProfile';
import { EYE_HEIGHT, type FloorTransitionZone } from '../../player/PlayerController';
import { WindowBarrier } from '../barriers/WindowBarrier';
import { WindowBarrierView } from '../barriers/WindowBarrierView';
import { PointDoor } from '../doors/PointDoor';
import { PointDoorView } from '../doors/PointDoorView';
import type { ZombieArena } from './ZombieArena';
import {
  BARRIER_CONFIG,
  DEBUG_MAP_COLLIDERS,
  MANSION_BARRIERS,
  MANSION_BOX_PLACEMENT,
  MANSION_DOORS,
  MANSION_GROUND_BOUNDS,
  MANSION_PLAYER_SPAWN,
  MANSION_SPAWNS,
  MANSION_UPPER_BOUNDS,
  MANSION_UPPER_Y,
} from './BurnedMansionConfig';

const WALL_THICKNESS = 0.3;
const LOWER_WALL_HEIGHT = 3.2;
const UPPER_WALL_HEIGHT = 3;
const DOOR_WIDTH = 1.6;
const WINDOW_WIDTH = 1.5;
// Low enough for a zombie body to step through after the boards break.
const WINDOW_SILL = 0.3;
const WINDOW_TOP = 1.9;

const materials = {
  wall: new THREE.MeshStandardMaterial({
    color: 0x5a4940,
    roughness: 0.96,
    emissive: 0x130907,
    emissiveIntensity: 0.12,
  }),
  wood: new THREE.MeshStandardMaterial({ color: 0x493428, roughness: 0.9 }),
  floor: new THREE.MeshStandardMaterial({ color: 0x5b5045, roughness: 0.84 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x555452, roughness: 1 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x45484a, roughness: 0.72, metalness: 0.5 }),
  debris: new THREE.MeshStandardMaterial({ color: 0x352c26, roughness: 1 }),
};

type WallAxis = 'x' | 'z';

/**
 * Small two-storey mansion made from explicit visual meshes and a separate
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
  readonly floorTransitions: ReadonlyArray<FloorTransitionZone>;

  colliders: ReadonlyArray<THREE.Object3D> = [];
  wallColliders: ReadonlyArray<THREE.Box3> = [];
  barriers: ReadonlyArray<WindowBarrier> = [];
  readonly doors: ReadonlyArray<PointDoor>;
  spawnPoints: ReadonlyArray<readonly [number, number]> = [];

  private readonly structureMeshes: THREE.Mesh[] = [];
  private readonly playerWallMeshes: THREE.Mesh[] = [];
  private readonly allBarriers: ReadonlyArray<WindowBarrier>;
  private readonly barrierViews: WindowBarrierView[] = [];
  private readonly doorViews: PointDoorView[] = [];
  private readonly doorMeshes: THREE.Mesh[] = [];
  private readonly activeSpawnZones = new Set<string>(['start']);

  constructor(
    private readonly scene: THREE.Scene,
    private readonly profile: DeviceProfile,
  ) {
    this.buildShell();
    this.buildInterior();
    this.buildStairs();
    this.buildProps();
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
          { cost: door.cost },
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
    for (const view of this.doorViews) view.update(dt);
  }

  public reset(): void {
    for (const barrier of this.allBarriers) {
      for (const board of barrier.boards) board.hp = board.maxHp;
    }
  }

  /** Called after PointDoor changed to unlocked. */
  public activateDoor(doorId: string): boolean {
    if (!this.doors.some((door) => door.id === doorId) || this.activeSpawnZones.has(doorId)) {
      return false;
    }
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

  private computeSpawnPoints(): ReadonlyArray<readonly [number, number]> {
    const points: Array<readonly [number, number]> = [];
    for (const zone of this.activeSpawnZones) {
      for (const point of MANSION_SPAWNS[zone] ?? []) points.push(point);
    }
    return points;
  }

  private collectBallisticColliders(): ReadonlyArray<THREE.Object3D> {
    const colliders: THREE.Object3D[] = [...this.structureMeshes];
    for (let i = 0; i < this.doors.length; i++) {
      if (this.doors[i].isLocked) colliders.push(this.doorMeshes[i]);
    }
    return colliders;
  }

  private collectPlayerWallColliders(): ReadonlyArray<THREE.Box3> {
    const boxes = this.playerWallMeshes.map((mesh) => new THREE.Box3().setFromObject(mesh));
    for (let i = 0; i < this.doors.length; i++) {
      if (this.doors[i].isLocked) boxes.push(new THREE.Box3().setFromObject(this.doorMeshes[i]));
    }
    return boxes;
  }

  private buildShell(): void {
    this.addSlab('ground-floor', 0, -0.08, 0, 14, 0.16, 16, materials.concrete);

    this.addWindowedWall('z', -7.15, -8, 8, [-3.2, 3.2, 5.4]);
    this.addWindowedWall('z', 7.15, -8, 8, [-4.5]);
    this.addWindowedWall('x', -8.15, -7, 7, [-3.5]);
    this.addWindowedWall('x', 8.15, -7, 7, [-3.5]);

    // Continuous support: vertical movement is controlled by explicit stair
    // portals, so a visual hole would leave the player hovering without gravity.
    this.addSlab('upper-floor-north', 3.65, MANSION_UPPER_Y - 0.08, -3, 7, 0.16, 10, materials.floor);

    const upperCenterY = MANSION_UPPER_Y + UPPER_WALL_HEIGHT / 2;
    this.addWall(0.15, upperCenterY, -3, WALL_THICKNESS, UPPER_WALL_HEIGHT, 10, materials.wall);
    this.addWall(7.15, upperCenterY, -3, WALL_THICKNESS, UPPER_WALL_HEIGHT, 10, materials.wall);
    this.addWall(3.65, upperCenterY, -8.15, 7, UPPER_WALL_HEIGHT, WALL_THICKNESS, materials.wall);
    this.addWall(3.65, upperCenterY, 2.15, 7, UPPER_WALL_HEIGHT, WALL_THICKNESS, materials.wall);

    this.addSlab('roof', 0, 6.48, 0, 14.6, 0.16, 16.6, materials.wall);
  }

  private buildInterior(): void {
    // Starting room -> box room. The opening is exactly occupied by to-dining.
    this.addDoorWall('x', 2, -7, 0, -3.5, 0);
    this.addWall(3.5, LOWER_WALL_HEIGHT / 2, 2, 7, LOWER_WALL_HEIGHT, WALL_THICKNESS, materials.wall);

    // Box room -> stair hall, and stair hall -> bunker.
    this.addDoorWall('z', 0, -8, 2, -2.5, 0);
    this.addDoorWall('z', 3.2, -8, 2, -4.5, 0);

    // Upper stairwell rails are low but collide using the corrected body box.
    this.addWall(0.5, MANSION_UPPER_Y + 0.5, 0.15, 0.12, 1, 3.1, materials.wood);
    this.addWall(2.4, MANSION_UPPER_Y + 0.5, 0.15, 0.12, 1, 3.1, materials.wood);
  }

  private buildStairs(): void {
    const steps = 10;
    const depth = 0.28;
    for (let index = 0; index < steps; index++) {
      const height = ((index + 1) / steps) * MANSION_UPPER_Y;
      const step = new THREE.Mesh(new THREE.BoxGeometry(1.55, height, depth), materials.wood);
      step.position.set(1.45, height / 2, -1.2 + index * depth);
      step.castShadow = !this.profile.useReducedEffects;
      step.receiveShadow = true;
      step.name = `stair-step-${index}`;
      step.userData.mapRole = 'visual-stair';
      this.group.add(step);
    }
  }

  private buildProps(): void {
    // Fixed placements keep the spawn and door approaches reproducibly clear.
    this.addProp('burned-sofa', -5.5, 0.35, 6.8, 1.8, 0.7, 0.65, materials.wood);
    this.addProp('start-table', -1.2, 0.42, 4.8, 1.1, 0.84, 0.7, materials.wood);
    this.addProp('box-room-cabinet', -5.8, 0.8, -1.2, 1.2, 1.6, 0.5, materials.wood);
    this.addProp('bunker-console', 5.5, 0.65, -6.6, 1.7, 1.3, 0.55, materials.metal);

    const rubble = new THREE.DodecahedronGeometry(0.18, 0);
    const positions: ReadonlyArray<readonly [number, number]> = [
      [-5.8, 1.2], [-1.2, 6.6], [-4.5, -1.8], [-2.2, -6.8], [1.1, -5.8], [5.8, -2.2],
    ];
    for (let index = 0; index < positions.length; index++) {
      const mesh = new THREE.Mesh(rubble, materials.debris);
      mesh.position.set(positions[index][0], 0.15, positions[index][1]);
      mesh.scale.setScalar(0.8 + (index % 3) * 0.25);
      mesh.rotation.set(index * 0.4, index * 0.7, index * 0.2);
      mesh.castShadow = true;
      mesh.userData.mapRole = 'visual-debris';
      this.group.add(mesh);
    }
  }

  private buildLighting(): void {
    this.group.add(
      new THREE.HemisphereLight(0x52647a, 0x21150f, this.profile.useReducedEffects ? 0.62 : 0.78),
    );
    this.addPointLight(-3.8, 2.2, 5, 0xff9b55, 2.1, 7);
    this.addPointLight(-4.5, 2.1, -4.8, 0x7c9fc4, 2.3, 7);
    this.addPointLight(5.2, 1.4, -5.5, 0xd6422e, 1.7, 6);
  }

  private buildFloorTransitions(): ReadonlyArray<FloorTransitionZone> {
    return [
      {
        box: new THREE.Box3(new THREE.Vector3(0.6, 0, 0.85), new THREE.Vector3(2.3, 2.6, 1.55)),
        sourceFloor: 0,
        targetFloor: 1,
        targetY: MANSION_UPPER_Y + EYE_HEIGHT,
        targetX: 3,
        targetZ: 0.8,
        bounds: MANSION_UPPER_BOUNDS,
      },
      {
        box: new THREE.Box3(
          new THREE.Vector3(3.4, MANSION_UPPER_Y, 0.4),
          new THREE.Vector3(4.2, MANSION_UPPER_Y + 2.4, 1.4),
        ),
        sourceFloor: 1,
        targetFloor: 0,
        targetY: EYE_HEIGHT,
        targetX: 1.45,
        targetZ: -1.7,
        bounds: MANSION_GROUND_BOUNDS,
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
    if (axis === 'x') this.addWall(along, y, fixed, length, height, WALL_THICKNESS, materials.wall);
    else this.addWall(fixed, y, along, WALL_THICKNESS, height, length, materials.wall);
  }

  private addWall(
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
  ): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = !this.profile.useReducedEffects;
    mesh.receiveShadow = true;
    mesh.userData.surface = 'wood';
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
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
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
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.name = name;
    mesh.castShadow = !this.profile.useReducedEffects;
    mesh.receiveShadow = true;
    mesh.userData.mapRole = 'visual-prop';
    this.group.add(mesh);
  }

  private addPointLight(x: number, y: number, z: number, color: number, intensity: number, distance: number): void {
    const light = new THREE.PointLight(color, intensity, distance, 1.8);
    light.position.set(x, y, z);
    this.group.add(light);
  }

  private addDebugHelpers(): void {
    for (const box of this.wallColliders) this.group.add(new THREE.Box3Helper(box, 0x00ff66));
    const spawn = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: true }),
    );
    spawn.position.set(this.playerSpawn.x, this.playerSpawn.y, this.playerSpawn.z);
    this.group.add(spawn);
  }
}
