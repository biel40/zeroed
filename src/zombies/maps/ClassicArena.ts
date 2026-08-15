import * as THREE from 'three';
import type { DeviceProfile } from '../../core/DeviceProfile';
import type { ShootingRange } from '../../range/ShootingRange';
import { MYSTERY_BOX_PLACEMENT } from '../MysteryBox';
import { NightEnvironment } from '../NightEnvironment';
import { SPAWN_POINTS } from '../ZombieSpawner';
import type { ZombieArena } from './ZombieArena';

/**
 * Adapter that wraps the existing outdoor shooting range. It keeps the
 * classic Zombies map behaviour unchanged while fitting the `ZombieArena`
 * contract.
 */
export class ClassicArena implements ZombieArena {
  readonly id = 'classic';
  readonly group = new THREE.Group();
  readonly colliders: ReadonlyArray<THREE.Object3D>;
  readonly spawnPoints = SPAWN_POINTS;
  readonly barriers = [] as const;
  readonly doors = [] as const;
  readonly wallBuys = [] as const;
  readonly mysteryBoxPlacement = MYSTERY_BOX_PLACEMENT;
  readonly useWallCollision = false;

  private readonly night: NightEnvironment;

  constructor(
    range: ShootingRange,
    scene: THREE.Scene,
    setExposure: (exposure: number) => void,
    profile: DeviceProfile,
  ) {
    this.group.add(range.group);
    this.colliders = [...range.colliders];
    this.night = new NightEnvironment(scene, range, setExposure, profile);
  }

  public init(): void {
    // NightEnvironment is already active from construction.
  }

  public update(dt: number): void {
    this.night.update(dt);
  }

  public reset(): void {
    // Classic state is reset by ZombiesMode and NightEnvironment is static.
  }
}
