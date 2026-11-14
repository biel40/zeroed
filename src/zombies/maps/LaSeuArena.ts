import * as THREE from 'three';
import { WEAPON_DEFINITIONS } from '../../config/weapons';
import type { DeviceProfile } from '../../core/DeviceProfile';
import { WindowBarrier } from '../barriers/WindowBarrier';
import { WindowBarrierView } from '../barriers/WindowBarrierView';
import { PointDoor } from '../doors/PointDoor';
import { PointDoorView } from '../doors/PointDoorView';
import { mysteryBoxFootprint } from '../MysteryBoxFootprint';
import { WallBuy } from '../wallbuys/WallBuy';
import { WallBuyView } from '../wallbuys/WallBuyView';
import type { ZombieSpawnDefinition } from '../ZombieSpawner';
import { buildChancel } from './laSeu/ChancelBuilder';
import { buildEntrancePassages } from './laSeu/EntrancePassages';
import { LaSeuAtmosphere } from './laSeu/LaSeuAtmosphere';
import type { LaSeuBuildContext } from './laSeu/LaSeuBuildContext';
import { LaSeuLighting } from './laSeu/LaSeuLighting';
import { buildNaveDressing } from './laSeu/NaveDressing';
import { buildNaveFurniture } from './laSeu/NaveFurniture';
import { buildNaveShell } from './laSeu/NaveShell';
import { buildPlaza } from './laSeu/PlazaBuilder';
import { buildPlazaVista } from './laSeu/PlazaVista';
import {
  LA_SEU_AMBIENCE,
  LA_SEU_BARRIER_CONFIG,
  LA_SEU_BOX_PLACEMENT,
  LA_SEU_DOORS,
  LA_SEU_ENTRANCES,
  LA_SEU_LIGHT_SITES,
  LA_SEU_NAVIGATION_BOUNDS,
  LA_SEU_OPENINGS,
  LA_SEU_PLAYER_BOUNDS,
  LA_SEU_PLAYER_SPAWN,
  LA_SEU_SPAWNS,
  LA_SEU_START_ZONE,
  LA_SEU_WALL_BUYS,
  LA_SEU_WALL_THICKNESS,
  type LaSeuZoneId,
} from './LaSeuConfig';
import { createLaSeuMaterials } from './LaSeuMaterials';
import { applySceneAmbience, createAmbienceHemisphereLight } from './shared/ArenaAmbience';
import { ArenaStructure } from './shared/ArenaStructure';
import { entrancePlayerStop } from './shared/EntrancePassage';
import { StaticMeshBatch } from './shared/StaticMeshBatch';
import type { ZombieArena } from './ZombieArena';

/**
 * Walk-through entrances stop the player at the wall line, so no spawn
 * passage is ever walkable. Player only: zombies and bullets go through
 * once the boards are gone.
 */
const DOOR_PLAYER_STOPS: ReadonlyArray<THREE.Box3> = LA_SEU_ENTRANCES
  .filter((entrance) => entrance.kind === 'door')
  .map((entrance) => entrancePlayerStop(entrance, LA_SEU_OPENINGS.door.width, LA_SEU_OPENINGS.door.top, LA_SEU_WALL_THICKNESS));

/**
 * La Seu, Palma's Gothic cathedral by night, overrun. Single-player and
 * included. The arena only orchestrates: builders shape the nave, the
 * chancel and the plaza, `LaSeuLighting` and `LaSeuAtmosphere` keep them
 * alive, and gameplay objects come from the shared barrier, door, wall-buy
 * and Mystery Box systems.
 *
 * Phase 1 is the nave with its chancel (five entrances, the M14 by the
 * great doors and the AK-47 behind the altar) and, through the paid wicket
 * in the great doors, the entrance plaza over the bay: two more entrances,
 * the M60 and the Mystery Box.
 */
export class LaSeuArena implements ZombieArena {
  public readonly id = 'la-seu';
  public readonly group = new THREE.Group();
  public readonly ambience = LA_SEU_AMBIENCE;
  public readonly playerSpawn = LA_SEU_PLAYER_SPAWN;
  public readonly useWallCollision = true;
  public readonly playerBounds = LA_SEU_PLAYER_BOUNDS;
  public readonly navigationBounds = LA_SEU_NAVIGATION_BOUNDS;
  public readonly mysteryBoxPlacement = LA_SEU_BOX_PLACEMENT;
  public readonly doors: ReadonlyArray<PointDoor>;
  public readonly wallBuys: ReadonlyArray<WallBuy>;
  public onTopologyChanged: (() => void) | null = null;
  public onBarrierBoardRebuilt: (() => void) | null = null;

  public colliders: ReadonlyArray<THREE.Object3D> = [];
  public wallColliders: ReadonlyArray<THREE.Box3> = [];
  public barriers: ReadonlyArray<WindowBarrier> = [];
  public spawnPoints: ReadonlyArray<ZombieSpawnDefinition> = [];

  private readonly structure = new ArenaStructure(this.group);
  private readonly allBarriers: ReadonlyArray<WindowBarrier>;
  private readonly barrierViews: ReadonlyArray<WindowBarrierView>;
  private readonly doorViews: ReadonlyArray<PointDoorView>;
  private readonly activeZones = new Set<LaSeuZoneId>([LA_SEU_START_ZONE]);
  private readonly lighting: LaSeuLighting;
  private readonly atmosphere: LaSeuAtmosphere;

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly profile: DeviceProfile,
  ) {
    this.group.name = 'la-seu';
    const materials = createLaSeuMaterials(profile.anisotropyLimit);
    const kit = { group: this.group, structure: this.structure, collider: materials.collider, materials, profile };
    // Interior and plaza merge into separate meshes, so the one behind the player is culled.
    const interior: LaSeuBuildContext = { ...kit, batch: new StaticMeshBatch() };
    const plaza: LaSeuBuildContext = { ...kit, batch: new StaticMeshBatch() };
    buildNaveShell(interior);
    buildChancel(interior);
    buildNaveFurniture(interior);
    buildNaveDressing(interior);
    buildPlaza(plaza);
    buildEntrancePassages(interior, plaza);
    buildPlazaVista(this.group);
    this.atmosphere = new LaSeuAtmosphere(interior);
    // No light casts shadows here: the vaults are too large for the shadow budget of a phone.
    interior.batch.build(this.group, 'laseu-interior', { castShadow: false, receiveShadow: false });
    plaza.batch.build(this.group, 'laseu-plaza', { castShadow: false, receiveShadow: false });
    this.group.add(createAmbienceHemisphereLight(this.ambience, profile.useReducedEffects));
    this.lighting = new LaSeuLighting(this.group, profile.quality, profile.useReducedEffects, LA_SEU_LIGHT_SITES, LA_SEU_PLAYER_SPAWN);

    this.allBarriers = LA_SEU_ENTRANCES.map((entrance) =>
      new WindowBarrier(entrance.id, entrance.x, entrance.z, entrance.outwardX, entrance.outwardZ, {
        ...LA_SEU_BARRIER_CONFIG,
        sill: LA_SEU_OPENINGS[entrance.kind].bottom,
      }));
    this.barrierViews = this.allBarriers.map((barrier) => {
      const view = new WindowBarrierView(barrier, this.group, () => this.onBarrierBoardRebuilt?.());
      view.group.traverse((object) => { object.castShadow = false; });
      return view;
    });

    this.doors = LA_SEU_DOORS.map((door) => new PointDoor(door.id, door.x, door.z, door.outwardX, door.outwardZ, { cost: door.cost }));
    this.doorViews = this.doors.map((door) => {
      const view = new PointDoorView(door, this.group, { reducedEffects: profile.useReducedEffects });
      view.group.traverse((object) => { object.castShadow = false; });
      return view;
    });

    this.wallBuys = LA_SEU_WALL_BUYS.map((config) => new WallBuy(config));
    for (const wallBuy of this.wallBuys) new WallBuyView(wallBuy, WEAPON_DEFINITIONS[wallBuy.weaponId], this.group, profile.useAdvancedRendering);

    this.refreshZones();
  }

  /** Real lights alive (always the quality budget), for diagnostics and tests. */
  public get pointLightCount(): number {
    return this.lighting.pointLightCount;
  }

  public init(): void {
    applySceneAmbience(this.scene, this.ambience, this.profile.useReducedEffects);
  }

  public update(dt: number, observerPosition?: THREE.Vector3): void {
    for (const view of this.barrierViews) {
      if (view.group.visible) view.update(dt);
    }
    for (const view of this.doorViews) view.update(dt);
    this.lighting.update(dt, observerPosition);
    this.atmosphere.update(dt);
  }

  public reset(): void {
    for (const barrier of this.allBarriers) barrier.reset();
    for (const view of this.barrierViews) view.reset();
    for (const door of this.doors) door.reset();
    for (const view of this.doorViews) view.reset();
    this.lighting.reset();
    this.atmosphere.reset();
    applySceneAmbience(this.scene, this.ambience, this.profile.useReducedEffects);
    this.activeZones.clear();
    this.activeZones.add(LA_SEU_START_ZONE);
    this.refreshZones();
  }

  /** Opens the zone behind a door its PointDoor just unlocked; the planks burst away on their own afterwards. */
  public activateDoor(doorId: string): boolean {
    const door = LA_SEU_DOORS.find((candidate) => candidate.id === doorId);
    if (!door || this.activeZones.has(door.zone)) return false;
    this.activeZones.add(door.zone);
    this.refreshZones();
    this.onTopologyChanged?.();
    return true;
  }

  public refreshSpawnPoints(): void {
    this.spawnPoints = [...this.activeZones].flatMap((zone) => LA_SEU_SPAWNS[zone]);
  }

  public refreshColliders(): void {
    this.group.updateMatrixWorld(true);
    const closedDoors = this.doorViews
      .filter((_, index) => !this.activeZones.has(LA_SEU_DOORS[index].zone))
      .map((view) => view.collider);
    this.colliders = [...this.structure.solids, ...closedDoors];
    this.wallColliders = [
      ...this.structure.playerWallBoxes(),
      mysteryBoxFootprint(this.mysteryBoxPlacement),
      ...closedDoors.map((collider) => new THREE.Box3().setFromObject(collider)),
      ...DOOR_PLAYER_STOPS,
    ];
  }

  private refreshZones(): void {
    this.refreshSpawnPoints();
    this.barriers = this.allBarriers.filter((_, index) => this.activeZones.has(LA_SEU_ENTRANCES[index].zone));
    for (let index = 0; index < this.barrierViews.length; index++) {
      this.barrierViews[index].group.visible = this.activeZones.has(LA_SEU_ENTRANCES[index].zone);
    }
    this.refreshColliders();
  }
}
