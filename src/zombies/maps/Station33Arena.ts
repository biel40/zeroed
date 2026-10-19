import * as THREE from 'three';
import type { DeviceProfile } from '../../core/DeviceProfile';
import type { WindowBarrier } from '../barriers/WindowBarrier';
import type { PointDoor } from '../doors/PointDoor';
import type { WallBuy } from '../wallbuys/WallBuy';
import { mysteryBoxFootprint } from '../MysteryBoxFootprint';
import type { ZombieSpawnDefinition } from '../ZombieSpawner';
import { applySceneAmbience, createAmbienceHemisphereLight } from './shared/ArenaAmbience';
import type { ArenaAmbience, ArenaPlayerSpawn, MysteryBoxPlacement, PlayerBounds, ZombieArena } from './ZombieArena';

const STATION_33_BOUNDS = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } as const satisfies PlayerBounds;

/** Placeholder mood until the map defines its own; reuses the only gameplay track. */
const STATION_33_AMBIENCE = {
  backgroundColor: 0x0b0d10,
  fog: { color: 0x101418, density: 0.018 },
  hemisphereLight: { skyColor: 0x4a5664, groundColor: 0x101214, intensity: 0.4, reducedIntensity: 0.3 },
  musicTrack: 'background_music_theme',
} as const satisfies ArenaAmbience;

/**
 * Stub for Station 33: a bare floor that satisfies the `ZombieArena` contract
 * so the registry, menus and contract tests can reference the map. It has no
 * doors, barriers, purchases or ending yet and stays hidden from the menu.
 */
export class Station33Arena implements ZombieArena {
  readonly id = 'station-33';
  readonly group = new THREE.Group();
  readonly ambience = STATION_33_AMBIENCE;
  readonly colliders: ReadonlyArray<THREE.Object3D>;
  readonly spawnPoints: ReadonlyArray<ZombieSpawnDefinition> = [[0, -8], [0, 8]];
  readonly barriers: ReadonlyArray<WindowBarrier> = [];
  readonly doors: ReadonlyArray<PointDoor> = [];
  readonly wallBuys: ReadonlyArray<WallBuy> = [];
  readonly mysteryBoxPlacement: MysteryBoxPlacement = {
    position: { x: 0, y: 0, z: -4 },
    yaw: 0,
    useRange: 2.1,
    lookDotMin: 0.55,
    floor: 0,
  };
  readonly playerSpawn: ArenaPlayerSpawn = { x: 0, y: 1.72, z: 4, floor: 0 };
  readonly useWallCollision = true;
  readonly wallColliders: ReadonlyArray<THREE.Box3> = [mysteryBoxFootprint(this.mysteryBoxPlacement)];
  readonly playerBounds: PlayerBounds = STATION_33_BOUNDS;
  readonly navigationBounds = [{ floor: 0, ...STATION_33_BOUNDS, baseY: 0 }] as const;
  onTopologyChanged: (() => void) | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    profile: DeviceProfile,
  ) {
    const { minX, maxX, minZ, maxZ } = STATION_33_BOUNDS;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX, maxZ - minZ).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.95 }),
    );
    floor.name = 'station-33-floor';
    floor.receiveShadow = true;
    floor.userData.surface = 'concrete';
    this.group.add(floor, createAmbienceHemisphereLight(this.ambience, profile.useReducedEffects));
    this.colliders = [floor];
  }

  init(): void {
    applySceneAmbience(this.scene, this.ambience);
  }

  update(): void {}

  reset(): void {}

  activateDoor(): boolean {
    return false;
  }

  refreshSpawnPoints(): void {}

  refreshColliders(): void {
    this.group.updateMatrixWorld(true);
  }
}
