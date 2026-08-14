import * as THREE from 'three';
import type { DeviceProfile } from '../../core/DeviceProfile';
import type { FloorTransitionZone } from '../../player/PlayerController';
import { WindowBarrier } from '../barriers/WindowBarrier';
import { WindowBarrierView } from '../barriers/WindowBarrierView';
import { PointDoor } from '../doors/PointDoor';
import { PointDoorView } from '../doors/PointDoorView';
import type { ZombieArena } from './ZombieArena';
import {
  BARRIER_CONFIG,
  MANSION_BARRIERS,
  MANSION_BOX_PLACEMENT,
  MANSION_DOORS,
  MANSION_GROUND_BOUNDS,
  MANSION_SPAWNS,
  MANSION_UPPER_BOUNDS,
  MANSION_UPPER_Y,
} from './BurnedMansionConfig';

/** Shared mansion materials to keep draw calls low. */
let burnedWoodMaterial: THREE.MeshStandardMaterial | null = null;
let charredWallMaterial: THREE.MeshStandardMaterial | null = null;
let floorMaterial: THREE.MeshStandardMaterial | null = null;
let debrisMaterial: THREE.MeshStandardMaterial | null = null;

function getBurnedWood(): THREE.MeshStandardMaterial {
  burnedWoodMaterial ??= new THREE.MeshStandardMaterial({ color: 0x3b2f26, roughness: 0.92 });
  return burnedWoodMaterial;
}

function getCharredWall(): THREE.MeshStandardMaterial {
  charredWallMaterial ??= new THREE.MeshStandardMaterial({ color: 0x2a2522, roughness: 0.95 });
  return charredWallMaterial;
}

function getFloorMaterial(): THREE.MeshStandardMaterial {
  floorMaterial ??= new THREE.MeshStandardMaterial({ color: 0x4a423a, roughness: 0.88 });
  return floorMaterial;
}

function getDebrisMaterial(): THREE.MeshStandardMaterial {
  debrisMaterial ??= new THREE.MeshStandardMaterial({ color: 0x1f1b18, roughness: 1 });
  return debrisMaterial;
}

/**
 * Compact, two-floor burned mansion. The geometry is deliberately low-poly:
 * shared materials, simple boxes, a few instanced debris piles. The second
 * floor is reached through an automatic stair trigger.
 */
export class BurnedMansionArena implements ZombieArena {
  readonly id = 'burned-mansion';
  readonly group = new THREE.Group();
  colliders: ReadonlyArray<THREE.Object3D>;
  wallColliders: ReadonlyArray<THREE.Box3>;
  readonly barriers: ReadonlyArray<WindowBarrier>;
  readonly doors: ReadonlyArray<PointDoor>;
  spawnPoints: ReadonlyArray<readonly [number, number]>;
  readonly mysteryBoxPlacement = MANSION_BOX_PLACEMENT;
  readonly useWallCollision = true;
  readonly playerBounds = MANSION_GROUND_BOUNDS;
  readonly floorTransitions: ReadonlyArray<FloorTransitionZone>;

  private readonly barrierViews: WindowBarrierView[] = [];
  private readonly doorViews: PointDoorView[] = [];
  private readonly activeSpawnZones = new Set<string>(['start']);
  private readonly tmpBox = new THREE.Box3();
  private readonly wallMeshes: THREE.Mesh[] = [];
  private readonly doorMeshes: THREE.Group[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly profile: DeviceProfile,
  ) {
    this.buildExterior();
    this.buildInterior();
    this.buildDebris();
    this.buildLighting();
    this.buildAtmosphere();

    this.barriers = MANSION_BARRIERS.map(
      (b) => new WindowBarrier(b.id, b.x, b.z, b.outwardX, b.outwardZ, BARRIER_CONFIG),
    );
    for (const barrier of this.barriers) {
      this.barrierViews.push(new WindowBarrierView(barrier, this.scene));
    }

    this.doors = MANSION_DOORS.map(
      (d) => new PointDoor(d.id, d.x, d.z, d.outwardX, d.outwardZ, { cost: d.cost }),
    );
    for (const door of this.doors) {
      const view = new PointDoorView(door, this.scene);
      this.doorViews.push(view);
      this.doorMeshes.push(view.group);
    }

    this.spawnPoints = this.computeSpawnPoints();
    this.colliders = this.collectColliders();
    this.wallColliders = this.wallMeshes.map((m) => this.tmpBox.setFromObject(m).clone());
    this.floorTransitions = this.buildFloorTransitions();
  }

  public init(): void {
    this.scene.background = new THREE.Color(0x070504);
    this.scene.fog = new THREE.FogExp2(0x070504, 0.022);
  }

  public update(dt: number): void {
    for (const view of this.barrierViews) view.update();
    for (const view of this.doorViews) view.update(dt);
  }

  public reset(): void {
    for (const barrier of this.barriers) {
      // Reset boards to full HP (full repair on restart).
      for (const board of barrier.boards) board.hp = board.maxHp;
    }
    // Doors stay unlocked across restart; a full page reload rebuilds them.
  }

  /** Unlock a door and add its zone spawns. */
  public activateDoor(doorId: string): boolean {
    const door = this.doors.find((d) => d.id === doorId);
    if (!door || door.state !== 'locked') return false;
    // Unlock is handled by PointDoor; we just update spawns.
    this.activeSpawnZones.add(doorId);
    return true;
  }

  private computeSpawnPoints(): ReadonlyArray<readonly [number, number]> {
    const points: Array<readonly [number, number]> = [];
    for (const zone of this.activeSpawnZones) {
      const zoneSpawns = MANSION_SPAWNS[zone] ?? [];
      for (const point of zoneSpawns) points.push(point);
    }
    return points;
  }

  public refreshSpawnPoints(): void {
    (this as { spawnPoints: ReadonlyArray<readonly [number, number]> }).spawnPoints =
      this.computeSpawnPoints();
  }

  private collectColliders(): ReadonlyArray<THREE.Object3D> {
    const list: THREE.Object3D[] = [];
    for (const mesh of this.wallMeshes) list.push(mesh);
    // Locked doors block movement and bullets.
    for (let i = 0; i < this.doors.length; i++) {
      if (this.doors[i].isLocked) list.push(this.doorMeshes[i]);
    }
    return list;
  }

  public refreshColliders(): void {
    (this as { colliders: ReadonlyArray<THREE.Object3D> }).colliders = this.collectColliders();
  }

  private buildExterior(): void {
    const wallHeight = 3.2;
    const thickness = 0.4;
    const w = 16;
    const d = 20;

    // Outer shell: front (south) is open for the main entrance feel.
    const walls: Array<[number, number, number, number, number]> = [
      [-w / 2 - thickness / 2, wallHeight / 2, 0, thickness, d], // west
      [w / 2 + thickness / 2, wallHeight / 2, 0, thickness, d], // east
      [0, wallHeight / 2, -d / 2 - thickness / 2, w + thickness * 2, thickness], // north
      [0, wallHeight / 2, d / 2 + thickness / 2, w * 0.4, thickness], // south partial center
      [-w * 0.45, wallHeight / 2, d / 2 + thickness / 2, w * 0.35, thickness], // south partial left
      [w * 0.45, wallHeight / 2, d / 2 + thickness / 2, w * 0.35, thickness], // south partial right
    ];

    for (const [x, y, z, sx, sz] of walls) {
      this.addWall(x, y, z, sx, wallHeight, sz);
    }

    // Floor.
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), getFloorMaterial());
    floor.position.set(0, 0.08, 0);
    floor.receiveShadow = true;
    this.group.add(floor);

    // Roof with holes.
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), getCharredWall());
    roof.position.set(0, wallHeight + 0.06, 0);
    roof.castShadow = true;
    this.group.add(roof);
  }

  private buildInterior(): void {
    const h = 3.0;
    const t = 0.3;
    // Main hall divider toward dining.
    this.addWall(-2, h / 2, 2, t, h, 6);
    // Dining/kitchen divider.
    this.addWall(-4, h / 2, 4, 6, h, t);
    // Upper floor slab.
    const upper = new THREE.Mesh(new THREE.BoxGeometry(10, 0.16, 10), getFloorMaterial());
    upper.position.set(3, MANSION_UPPER_Y - 0.08, -5);
    upper.receiveShadow = true;
    this.group.add(upper);
    // Upper railing.
    this.addWall(3, MANSION_UPPER_Y + 0.5, -0.2, 10, 1, 0.15);
    // Staircase (visual ramp).
    const stairs = new THREE.Mesh(new THREE.BoxGeometry(1.2, MANSION_UPPER_Y, 3), getBurnedWood());
    stairs.position.set(3.8, MANSION_UPPER_Y / 2, 1.5);
    stairs.rotation.y = Math.PI / 2;
    stairs.receiveShadow = true;
    this.group.add(stairs);
  }

  private buildDebris(): void {
    const debris = getDebrisMaterial();
    const geometry = new THREE.DodecahedronGeometry(0.18, 0);
    for (let i = 0; i < 18; i++) {
      const mesh = new THREE.Mesh(geometry, debris);
      mesh.position.set(
        -6 + Math.random() * 12,
        0.09 + Math.random() * 0.06,
        -8 + Math.random() * 16,
      );
      mesh.scale.setScalar(0.7 + Math.random() * 0.8);
      mesh.rotation.set(Math.random(), Math.random(), Math.random());
      mesh.castShadow = true;
      this.group.add(mesh);
    }
  }

  private buildLighting(): void {
    const profile = this.profile;
    const ambient = new THREE.HemisphereLight(0x1a222b, 0x0a0806, profile.useReducedEffects ? 0.25 : 0.38);
    this.group.add(ambient);

    // Cold moonlight shafts.
    this.addPointLight(-5, 2.4, -4, 0x8aa4c8, profile.useReducedEffects ? 1.8 : 2.8, 9, 0.25);
    this.addPointLight(4, 2.4, 2, 0x8aa4c8, profile.useReducedEffects ? 1.8 : 2.8, 9, 0.25);

    // Ember glow (warm/red).
    this.addPointLight(0, 0.6, 5, 0xff4a22, profile.useReducedEffects ? 1.2 : 1.8, 6, 0.6);
    this.addPointLight(-6, 0.6, -6, 0xff3a18, profile.useReducedEffects ? 1.0 : 1.5, 5, 0.5);
  }

  private addPointLight(
    x: number,
    y: number,
    z: number,
    color: number,
    intensity: number,
    distance: number,
    instability: number,
  ): void {
    const light = new THREE.PointLight(color, intensity, distance, 1.8);
    light.position.set(x, y, z);
    this.group.add(light);
    // Flicker handled simply by storing data on the light for future use.
    (light.userData as { instability: number }).instability = instability;
  }

  private buildAtmosphere(): void {
    // Light fog + ember particles could go here; kept minimal for mobile.
  }

  private buildFloorTransitions(): ReadonlyArray<FloorTransitionZone> {
    return [
      {
        box: new THREE.Box3(
          new THREE.Vector3(3.2, 0, 0.8),
          new THREE.Vector3(4.4, 4, 2.2),
        ),
        targetFloor: 1,
        targetY: MANSION_UPPER_Y + 1.7,
        bounds: MANSION_UPPER_BOUNDS,
      },
      {
        box: new THREE.Box3(
          new THREE.Vector3(3.2, MANSION_UPPER_Y, 0.8),
          new THREE.Vector3(4.4, MANSION_UPPER_Y + 3, 2.2),
        ),
        targetFloor: 0,
        targetY: 1.7,
        bounds: MANSION_GROUND_BOUNDS,
      },
    ];
  }

  private addWall(x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), getCharredWall());
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.surface = 'wood';
    this.wallMeshes.push(mesh);
    this.group.add(mesh);
  }
}
