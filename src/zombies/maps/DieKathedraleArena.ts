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
import { buildChancel } from './dieKathedrale/ChancelBuilder';
import { ColumnCandleFlames } from './dieKathedrale/ColumnCandleFlames';
import { buildEntrancePassages } from './dieKathedrale/EntrancePassages';
import { DieKathedraleAtmosphere } from './dieKathedrale/DieKathedraleAtmosphere';
import type { DieKathedraleBuildContext } from './dieKathedrale/DieKathedraleBuildContext';
import { DieKathedraleLighting } from './dieKathedrale/DieKathedraleLighting';
import { buildNaveDivisions } from './dieKathedrale/NaveDivisions';
import { buildNaveDressing } from './dieKathedrale/NaveDressing';
import { buildNaveFurniture } from './dieKathedrale/NaveFurniture';
import { buildNaveRuin } from './dieKathedrale/NaveRuin';
import { buildNaveShell } from './dieKathedrale/NaveShell';
import { buildPlaza } from './dieKathedrale/PlazaBuilder';
import { buildPlazaVista } from './dieKathedrale/PlazaVista';
import { buildSideChapels } from './dieKathedrale/SideChapels';
import {
  DIE_KATHEDRALE_AMBIENCE,
  DIE_KATHEDRALE_AMBIENT_EVENTS,
  DIE_KATHEDRALE_BARRIER_CONFIG,
  DIE_KATHEDRALE_BOX_PLACEMENT,
  DIE_KATHEDRALE_DOORS,
  DIE_KATHEDRALE_ENTRANCES,
  DIE_KATHEDRALE_INTRO,
  DIE_KATHEDRALE_INTRO_CUES,
  DIE_KATHEDRALE_LIGHT_SITES,
  DIE_KATHEDRALE_NAVIGATION_BOUNDS,
  DIE_KATHEDRALE_OPENINGS,
  DIE_KATHEDRALE_PLAYER_BOUNDS,
  DIE_KATHEDRALE_PLAYER_SPAWN,
  DIE_KATHEDRALE_SPAWNS,
  DIE_KATHEDRALE_START_ZONE,
  DIE_KATHEDRALE_WALL_BUYS,
  DIE_KATHEDRALE_WALL_THICKNESS,
  DIE_KATHEDRALE_ZOMBIE_EYES,
  DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES,
  DIE_KATHEDRALE_ZONES,
  type DieKathedraleZoneId,
} from './DieKathedraleConfig';
import { createDieKathedraleMaterials } from './DieKathedraleMaterials';
import { AmbientEventScheduler } from './shared/AmbientEventScheduler';
import { applySceneAmbience, createAmbienceHemisphereLight } from './shared/ArenaAmbience';
import { ArenaStructure } from './shared/ArenaStructure';
import { entrancePlayerStop } from './shared/EntrancePassage';
import { StaticMeshBatch } from './shared/StaticMeshBatch';
import type { ArenaAmbientCue, ZombieArena } from './ZombieArena';

/**
 * Walk-through entrances stop the player at the wall line, so no spawn
 * passage is ever walkable. Player only: zombies and bullets go through
 * once the boards are gone.
 */
const DOOR_PLAYER_STOPS: ReadonlyArray<THREE.Box3> = DIE_KATHEDRALE_ENTRANCES
  .filter((entrance) => entrance.kind === 'door')
  .map((entrance) => entrancePlayerStop(entrance, DIE_KATHEDRALE_OPENINGS.door.width, DIE_KATHEDRALE_OPENINGS.door.top, DIE_KATHEDRALE_WALL_THICKNESS));

/**
 * Die Kathedrale, Palma's Gothic cathedral by night, overrun.
 * The arena only orchestrates: builders shape the nave, the
 * chancel and the plaza, `DieKathedraleLighting` and `DieKathedraleAtmosphere` keep them
 * alive, and gameplay objects come from the shared barrier, door, wall-buy
 * and Mystery Box systems.
 *
 * The nave is one space split into zones by grilles, parapets and a
 * collapse that never reach the vault (`DIE_KATHEDRALE_SCREENS`). The run starts
 * in the narthex and buys its way, gate by gate (`DIE_KATHEDRALE_DOORS`), up the
 * central nave, into the side aisles and their chapels, onto the crossing
 * and the chancel, and out through the wicket to the plaza over the bay.
 * A zone's entrances wake when the first gate into it opens.
 */
export class DieKathedraleArena implements ZombieArena {
  public readonly id = 'die-kathedrale';
  public readonly group = new THREE.Group();
  public readonly ambience = DIE_KATHEDRALE_AMBIENCE;
  public readonly intro = DIE_KATHEDRALE_INTRO;
  public readonly zombieSkinShares = DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES;
  public readonly zombieEyes = DIE_KATHEDRALE_ZOMBIE_EYES;
  public readonly playerSpawn = DIE_KATHEDRALE_PLAYER_SPAWN;
  public readonly useWallCollision = true;
  public readonly playerBounds = DIE_KATHEDRALE_PLAYER_BOUNDS;
  public readonly navigationBounds = DIE_KATHEDRALE_NAVIGATION_BOUNDS;
  public readonly mysteryBoxPlacement = DIE_KATHEDRALE_BOX_PLACEMENT;
  public readonly doors: ReadonlyArray<PointDoor>;
  public readonly wallBuys: ReadonlyArray<WallBuy>;
  public onTopologyChanged: (() => void) | null = null;
  public onBarrierBoardRebuilt: (() => void) | null = null;
  public onAmbientCue: ((cue: ArenaAmbientCue) => void) | null = null;

  public colliders: ReadonlyArray<THREE.Object3D> = [];
  public wallColliders: ReadonlyArray<THREE.Box3> = [];
  public barriers: ReadonlyArray<WindowBarrier> = [];
  public spawnPoints: ReadonlyArray<ZombieSpawnDefinition> = [];

  private readonly structure = new ArenaStructure(this.group);
  private readonly allBarriers: ReadonlyArray<WindowBarrier>;
  private readonly barrierViews: ReadonlyArray<WindowBarrierView>;
  private readonly doorViews: ReadonlyArray<PointDoorView>;
  private readonly activeZones = new Set<DieKathedraleZoneId>([DIE_KATHEDRALE_START_ZONE]);
  private readonly openDoors = new Set<string>();
  private readonly ambientEvents = new AmbientEventScheduler(DIE_KATHEDRALE_AMBIENT_EVENTS);
  /** Bound once: the scheduler calls it from the frame loop. */
  private readonly playAmbientEvent = (cue: ArenaAmbientCue): void => this.onAmbientCue?.(cue);
  private readonly lighting: DieKathedraleLighting;
  private readonly atmosphere: DieKathedraleAtmosphere;
  /** Presentation only: the paid wicket remains locked and collidable throughout the film. */
  private readonly introWicket: THREE.Group;
  private introElapsed: number | null = null;
  private nextIntroCue = 0;

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly profile: DeviceProfile,
  ) {
    this.group.name = 'die-kathedrale';
    const materials = createDieKathedraleMaterials(profile.anisotropyLimit);
    const kit = { group: this.group, structure: this.structure, collider: materials.collider, materials, profile };
    // Interior and plaza merge into separate meshes, so the one behind the player is culled.
    const interior: DieKathedraleBuildContext = { ...kit, batch: new StaticMeshBatch() };
    const plaza: DieKathedraleBuildContext = { ...kit, batch: new StaticMeshBatch() };
    buildNaveShell(interior);
    buildChancel(interior);
    buildNaveDivisions(interior);
    buildSideChapels(interior);
    buildNaveFurniture(interior);
    buildNaveDressing(interior);
    buildNaveRuin(interior);
    buildPlaza(plaza);
    buildEntrancePassages(interior, plaza);
    buildPlazaVista(this.group);
    this.atmosphere = new DieKathedraleAtmosphere(interior);
    // No light casts shadows here: the vaults are too large for the shadow budget of a phone.
    interior.batch.build(this.group, 'die-kathedrale-interior', { castShadow: false, receiveShadow: false });
    plaza.batch.build(this.group, 'die-kathedrale-plaza', { castShadow: false, receiveShadow: false });
    this.group.add(createAmbienceHemisphereLight(this.ambience, profile.useReducedEffects));
    const candleFlames = new ColumnCandleFlames(this.group, materials.flame, DIE_KATHEDRALE_LIGHT_SITES);
    this.lighting = new DieKathedraleLighting(this.group, profile.quality, profile.useReducedEffects, DIE_KATHEDRALE_LIGHT_SITES, DIE_KATHEDRALE_PLAYER_SPAWN, candleFlames);

    this.allBarriers = DIE_KATHEDRALE_ENTRANCES.map((entrance) =>
      new WindowBarrier(entrance.id, entrance.x, entrance.z, entrance.outwardX, entrance.outwardZ, {
        ...DIE_KATHEDRALE_BARRIER_CONFIG,
        sill: DIE_KATHEDRALE_OPENINGS[entrance.kind].bottom,
      }));
    this.barrierViews = this.allBarriers.map((barrier) => {
      const view = new WindowBarrierView(barrier, this.group, () => this.onBarrierBoardRebuilt?.());
      view.group.traverse((object) => { object.castShadow = false; });
      return view;
    });

    this.doors = DIE_KATHEDRALE_DOORS.map((door) => new PointDoor(door.id, door.x, door.z, door.outwardX, door.outwardZ, { cost: door.cost }));
    this.doorViews = this.doors.map((door) => {
      // The nave's gates are iron leaves; the wicket keeps the shared boards.
      const gate = DIE_KATHEDRALE_DOORS.find((candidate) => candidate.id === door.id)?.kind === 'gate';
      const view = new PointDoorView(door, this.group, {
        reducedEffects: profile.useReducedEffects,
        ...(gate ? { panelMaterial: materials.gateIron, surface: 'metal' as const } : {}),
      });
      view.group.traverse((object) => { object.castShadow = false; });
      return view;
    });
    this.introWicket = this.doorViews[DIE_KATHEDRALE_DOORS.findIndex((door) => door.kind === 'wicket')].group;

    this.wallBuys = DIE_KATHEDRALE_WALL_BUYS.map((config) => new WallBuy(config));
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
    this.updateIntroCues(dt);
    for (const view of this.barrierViews) {
      if (view.group.visible) view.update(dt);
    }
    for (const view of this.doorViews) view.update(dt);
    this.lighting.update(dt, observerPosition, this.introElapsed === null ? this.activeZones : undefined);
    this.atmosphere.update(dt);
    if (this.introElapsed === null) this.ambientEvents.update(dt, this.playAmbientEvent);
  }

  public reset(): void {
    this.finishIntro();
    for (const barrier of this.allBarriers) barrier.reset();
    for (const view of this.barrierViews) view.reset();
    for (const door of this.doors) door.reset();
    for (const view of this.doorViews) view.reset();
    this.lighting.reset();
    this.atmosphere.reset();
    this.ambientEvents.reset();
    applySceneAmbience(this.scene, this.ambience, this.profile.useReducedEffects);
    this.openDoors.clear();
    this.activeZones.clear();
    this.activeZones.add(DIE_KATHEDRALE_START_ZONE);
    this.refreshZones();
  }

  /** Lets the camera through the real aperture without buying the plaza or changing topology. */
  public startIntro(): void {
    this.introElapsed = 0;
    this.nextIntroCue = 0;
    this.introWicket.visible = false;
  }

  /** Also used on skip/pause: restore the closed wicket and the spawn's light pool immediately. */
  public finishIntro(): void {
    if (this.introElapsed === null) return;
    this.introElapsed = null;
    this.introWicket.visible = true;
    this.lighting.reset();
  }

  /**
   * Opens a door its PointDoor just unlocked and wakes whichever of the two
   * zones it joins still slept; the leaf bursts away on its own afterwards.
   */
  public activateDoor(doorId: string): boolean {
    const door = DIE_KATHEDRALE_DOORS.find((candidate) => candidate.id === doorId);
    if (!door || this.openDoors.has(doorId)) return false;
    this.openDoors.add(doorId);
    for (const zone of door.zones) this.activeZones.add(zone);
    this.refreshZones();
    this.onTopologyChanged?.();
    return true;
  }

  public refreshSpawnPoints(): void {
    this.spawnPoints = DIE_KATHEDRALE_ZONES.filter((zone) => this.activeZones.has(zone)).flatMap((zone) => DIE_KATHEDRALE_SPAWNS[zone]);
  }

  public refreshColliders(): void {
    this.group.updateMatrixWorld(true);
    const closedDoors = this.doorViews
      .filter((_, index) => !this.openDoors.has(DIE_KATHEDRALE_DOORS[index].id))
      .map((view) => view.collider);
    this.colliders = [...this.structure.solids, ...closedDoors];
    this.wallColliders = [
      ...this.structure.playerWallBoxes(),
      mysteryBoxFootprint(this.mysteryBoxPlacement),
      ...closedDoors.map((collider) => new THREE.Box3().setFromObject(collider)),
      ...DOOR_PLAYER_STOPS,
    ];
  }

  private updateIntroCues(dt: number): void {
    if (this.introElapsed === null) return;
    this.introElapsed += Math.max(0, dt);
    while (this.nextIntroCue < DIE_KATHEDRALE_INTRO_CUES.length && DIE_KATHEDRALE_INTRO_CUES[this.nextIntroCue].time <= this.introElapsed) {
      this.playAmbientEvent(DIE_KATHEDRALE_INTRO_CUES[this.nextIntroCue++]);
    }
  }

  private refreshZones(): void {
    this.refreshSpawnPoints();
    this.barriers = this.allBarriers.filter((_, index) => this.activeZones.has(DIE_KATHEDRALE_ENTRANCES[index].zone));
    for (let index = 0; index < this.barrierViews.length; index++) {
      this.barrierViews[index].group.visible = this.activeZones.has(DIE_KATHEDRALE_ENTRANCES[index].zone);
    }
    this.refreshColliders();
  }
}
