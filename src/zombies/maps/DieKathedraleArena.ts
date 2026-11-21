import * as THREE from 'three';
import { DIE_KATHEDRALE_FOOTSTEP_SURFACES } from './dieKathedrale/DieKathedraleFootstepSurfaces';
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
import { buildCatacombs } from './dieKathedrale/catacombs/CatacombsBuilder';
import { buildCryptStair, cryptStairTransitions } from './dieKathedrale/catacombs/CryptStair';
import { ExhalisAltarOffering } from './dieKathedrale/catacombs/ExhalisAltarOffering';
import { addFlameHalos } from './dieKathedrale/catacombs/FlameHalos';
import { TombLids } from './dieKathedrale/catacombs/TombLids';
import { SanctuaryMotes } from './dieKathedrale/catacombs/SanctuaryMotes';
import { UndergroundMood } from './dieKathedrale/catacombs/UndergroundMood';
import { undergroundPresence, type UndergroundPresence } from './dieKathedrale/catacombs/UndergroundPresence';
import { buildChancel } from './dieKathedrale/ChancelBuilder';
import { ColumnCandleFlames } from './dieKathedrale/ColumnCandleFlames';
import { buildEntrancePassages } from './dieKathedrale/EntrancePassages';
import { buildExterior } from './dieKathedrale/exterior/ExteriorGrounds';
import type { PalauBanner } from './dieKathedrale/exterior/PalauBanner';
import { palauStepSurfaces } from './dieKathedrale/exterior/PalauSteps';
import { DieKathedraleAtmosphere } from './dieKathedrale/DieKathedraleAtmosphere';
import type { DieKathedraleBuildContext } from './dieKathedrale/DieKathedraleBuildContext';
import { DieKathedraleLighting } from './dieKathedrale/DieKathedraleLighting';
import { DieKathedraleRingShrine } from './dieKathedrale/DieKathedraleRingShrine';
import { DIE_KATHEDRALE_RING_SITES } from './dieKathedrale/DieKathedraleRingSites';
import { buildNaveDivisions } from './dieKathedrale/NaveDivisions';
import { buildNaveDressing } from './dieKathedrale/NaveDressing';
import { buildNaveFurniture } from './dieKathedrale/NaveFurniture';
import { buildNaveRuin } from './dieKathedrale/NaveRuin';
import { buildNaveShell } from './dieKathedrale/NaveShell';
import { buildPlaza } from './dieKathedrale/PlazaBuilder';
import { buildPlazaVista } from './dieKathedrale/PlazaVista';
import { buildSideChapels } from './dieKathedrale/SideChapels';
import { bellTowerTransitions } from './dieKathedrale/upper/BellTowerStair';
import { buildUpperCathedral } from './dieKathedrale/upper/UpperCathedralBuilder';
import { UPPER_FLOOR } from './dieKathedrale/upper/UpperCathedralConfig';
import {
  CATACOMB_AMBIENT_EVENTS,
  CATACOMB_FLOOR,
  CATACOMB_LIGHT_SITES,
  CATACOMB_WALL_THICKNESS,
  CRYPT_EMERGENCE_SITES,
  CRYPT_TOMB_EMERGENCE,
  CRYPT_ZOMBIE_LOOK,
  EXHALIS_ALTAR_OFFERING,
} from './DieKathedraleCatacombsConfig';
import {
  CATACOMB_PLAYER_BOUNDS,
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
  dieKathedraleFloorY,
  siteFloor,
  type DieKathedraleZoneId,
} from './DieKathedraleConfig';
import { createDieKathedraleMaterials } from './DieKathedraleMaterials';
import { AmbientEventScheduler } from './shared/AmbientEventScheduler';
import { applySceneAmbience, createAmbienceHemisphereLight } from './shared/ArenaAmbience';
import { ArenaStructure } from './shared/ArenaStructure';
import { entrancePlayerStop } from './shared/EntrancePassage';
import { StaticMeshBatch } from './shared/StaticMeshBatch';
import type { ZombieEmergenceSite, ZombieEmergenceStage } from '../emergence/ZombieEmergence';
import type { ArenaAmbientCue, ArenaRingMachine, ArenaWeaponStation, ZombieArena } from './ZombieArena';

/** Height of a barrier's boards above its own floor, as on every map. */
const BARRIER_BOARD_Y = 1.15;
const CRYPT_GATE_ID = 'crypt-gate';
/** Past this depth the catacombs' own sounds take over from the cathedral's. */
const UNDERGROUND_SOUND_DEPTH = 0.5;
const UPPER_VIEW_EYE_Y = 8;
const UPPER_VISIBILITY = { x: -17, z: -43, radius: 36 } as const;

/**
 * Entrances stop the player at the wall line, so no spawn
 * passage is ever walkable. Player only: zombies and bullets go through
 * once the boards are gone.
 */
const ENTRANCE_PLAYER_STOPS: ReadonlyArray<THREE.Box3> = DIE_KATHEDRALE_ENTRANCES
  .map((entrance) => entrancePlayerStop(
    entrance,
    DIE_KATHEDRALE_OPENINGS[entrance.kind].width,
    DIE_KATHEDRALE_OPENINGS[entrance.kind].top,
    siteFloor(entrance) === CATACOMB_FLOOR ? CATACOMB_WALL_THICKNESS : DIE_KATHEDRALE_WALL_THICKNESS,
    dieKathedraleFloorY(siteFloor(entrance)),
  ));

/**
 * Die Kathedrale, Palma's Gothic cathedral by night, overrun, and the royal
 * catacombs beneath it. The arena only orchestrates: builders shape the
 * nave, chancel, grounds, tower, terraces and catacombs,
 * `DieKathedraleLighting` and the atmospheres keep them alive, and gameplay
 * objects come from the shared barrier, door, wall-buy and Mystery Box
 * systems.
 *
 * The nave is one space split into zones by grilles, parapets and a
 * collapse that never reach the vault (`DIE_KATHEDRALE_SCREENS`). The run starts
 * in the narthex and buys its way, gate by gate (`DIE_KATHEDRALE_DOORS`), up the
 * central nave, into the side aisles and their chapels, onto the crossing
 * and the chancel, and out to the grounds through the plaza or Mirador.
 * Separate gates in the crossing lead up to the bell stair and down to the crypt, where
 * more gates lead through the galleries, the pantheon, the reliquary and
 * the sanctuary. A zone's entrances wake when the first gate into it opens.
 *
 * The crypt stair remains visible from both ends while the groups beyond
 * each end are culled according to `undergroundPresence`.
 */
export class DieKathedraleArena implements ZombieArena {
  public readonly id = 'die-kathedrale';
  public readonly group = new THREE.Group();
  public readonly ambience = DIE_KATHEDRALE_AMBIENCE;
  public readonly intro = DIE_KATHEDRALE_INTRO;
  public readonly zombieSkinShares = DIE_KATHEDRALE_ZOMBIE_SKIN_SHARES;
  public readonly zombieFloorLook = CRYPT_ZOMBIE_LOOK;
  public readonly emergenceTuning = CRYPT_TOMB_EMERGENCE;
  public emergenceSites: ReadonlyArray<ZombieEmergenceSite> = [];
  public readonly zombieEyes = DIE_KATHEDRALE_ZOMBIE_EYES;
  public readonly playerSpawn = DIE_KATHEDRALE_PLAYER_SPAWN;
  public readonly useWallCollision = true;
  public readonly playerBounds = DIE_KATHEDRALE_PLAYER_BOUNDS;
  public readonly navigationBounds = DIE_KATHEDRALE_NAVIGATION_BOUNDS;
  public readonly floorTransitions = [
    ...cryptStairTransitions(DIE_KATHEDRALE_PLAYER_BOUNDS, CATACOMB_PLAYER_BOUNDS),
    ...bellTowerTransitions(DIE_KATHEDRALE_PLAYER_BOUNDS),
    ...palauStepSurfaces(DIE_KATHEDRALE_PLAYER_BOUNDS),
  ];
  public readonly footstepSurfaces = DIE_KATHEDRALE_FOOTSTEP_SURFACES;
  public readonly mysteryBoxPlacement = DIE_KATHEDRALE_BOX_PLACEMENT;
  public readonly ringMachines: ReadonlyArray<ArenaRingMachine>;
  public readonly doors: ReadonlyArray<PointDoor>;
  public readonly wallBuys: ReadonlyArray<WallBuy>;
  /** The base EXHALIS over the reliquary's altar, until the Wind Bow's quest replaces the sale. */
  public readonly weaponStations: ReadonlyArray<ArenaWeaponStation>;
  private readonly exhalisAltar: ExhalisAltarOffering;
  public onTopologyChanged: (() => void) | null = null;
  public onBarrierBoardRebuilt: (() => void) | null = null;
  public onAmbientCue: ((cue: ArenaAmbientCue) => void) | null = null;

  public colliders: ReadonlyArray<THREE.Object3D> = [];
  public wallColliders: ReadonlyArray<THREE.Box3> = [];
  public barriers: ReadonlyArray<WindowBarrier> = [];
  public spawnPoints: ReadonlyArray<ZombieSpawnDefinition> = [];

  private readonly cathedralGroup = new THREE.Group();
  private readonly catacombGroup = new THREE.Group();
  private readonly exteriorGroup = new THREE.Group();
  private readonly upperGroup = new THREE.Group();
  private readonly structures: ReadonlyArray<ArenaStructure>;
  private readonly allBarriers: ReadonlyArray<WindowBarrier>;
  private readonly barrierViews: ReadonlyArray<WindowBarrierView>;
  private readonly doorViews: ReadonlyArray<PointDoorView>;
  private readonly activeZones = new Set<DieKathedraleZoneId>([DIE_KATHEDRALE_START_ZONE]);
  private readonly openDoors = new Set<string>();
  private readonly ambientEvents = new AmbientEventScheduler(DIE_KATHEDRALE_AMBIENT_EVENTS);
  private readonly catacombEvents = new AmbientEventScheduler(CATACOMB_AMBIENT_EVENTS);
  /** Bound once: the scheduler calls it from the frame loop. */
  private readonly playAmbientEvent = (cue: ArenaAmbientCue): void => this.onAmbientCue?.(cue);
  private readonly lighting: DieKathedraleLighting;
  private readonly atmosphere: DieKathedraleAtmosphere;
  private readonly palauBanner: PalauBanner;
  private readonly mood: UndergroundMood;
  private readonly motes: SanctuaryMotes;
  private readonly tombLids: TombLids;
  private readonly presence: UndergroundPresence = { depth: 0, showCathedral: true, showCatacombs: false };
  private readonly home = new THREE.Vector3(DIE_KATHEDRALE_PLAYER_SPAWN.x, DIE_KATHEDRALE_PLAYER_SPAWN.y, DIE_KATHEDRALE_PLAYER_SPAWN.z);
  /** Presentation only: the paid wicket remains locked and collidable throughout the film. */
  private readonly introWicket: THREE.Group;
  private introElapsed: number | null = null;
  private nextIntroCue = 0;

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly profile: DeviceProfile,
  ) {
    this.group.name = 'die-kathedrale';
    this.cathedralGroup.name = 'die-kathedrale-cathedral';
    this.catacombGroup.name = 'die-kathedrale-catacombs';
    this.exteriorGroup.name = 'die-kathedrale-grounds';
    this.upperGroup.name = 'die-kathedrale-upper';
    this.group.add(this.cathedralGroup, this.catacombGroup);
    this.cathedralGroup.add(this.exteriorGroup, this.upperGroup);
    const materials = createDieKathedraleMaterials(profile.anisotropyLimit);
    const cathedralStructure = new ArenaStructure(this.cathedralGroup);
    const catacombStructure = new ArenaStructure(this.catacombGroup);
    const stairStructure = new ArenaStructure(this.group);
    const exteriorStructure = new ArenaStructure(this.exteriorGroup);
    const upperStructure = new ArenaStructure(this.upperGroup);
    this.structures = [cathedralStructure, stairStructure, catacombStructure, exteriorStructure, upperStructure];
    const context = (group: THREE.Group, structure: ArenaStructure): DieKathedraleBuildContext => ({
      group, structure, collider: materials.collider, materials, profile, batch: new StaticMeshBatch(),
    });
    // Each area merges into its own meshes, so the one out of view is culled.
    const interior = context(this.cathedralGroup, cathedralStructure);
    const plaza = context(this.cathedralGroup, cathedralStructure);
    const catacombs = context(this.catacombGroup, catacombStructure);
    const stair = context(this.group, stairStructure);
    const exterior = context(this.exteriorGroup, exteriorStructure);
    const upper = context(this.upperGroup, upperStructure);
    const terrace = context(this.upperGroup, upperStructure);
    buildNaveShell(interior);
    buildChancel(interior);
    buildNaveDivisions(interior);
    buildSideChapels(interior);
    buildNaveFurniture(interior);
    buildNaveDressing(interior);
    buildNaveRuin(interior);
    buildPlaza(plaza);
    this.palauBanner = buildExterior(exterior);
    buildUpperCathedral(upper, terrace);
    buildCryptStair(stair);
    buildCatacombs(catacombs);
    this.tombLids = new TombLids(catacombs);
    buildEntrancePassages({ interior, plaza, catacombs, exterior, upper });
    this.ringMachines = DIE_KATHEDRALE_RING_SITES.map((site) => new DieKathedraleRingShrine(
      site.zone === 'sideCourtyard' ? exterior : site.floor === UPPER_FLOOR ? terrace : interior, site,
    ));
    buildPlazaVista(this.cathedralGroup);
    this.atmosphere = new DieKathedraleAtmosphere(interior);
    this.motes = new SanctuaryMotes(this.catacombGroup, profile.quality);
    addFlameHalos(this.catacombGroup, CATACOMB_LIGHT_SITES.filter((site) => site.flicker && site.y < 0));
    // No light casts shadows here: the vaults are too large for the shadow budget of a phone.
    const unshadowed = { castShadow: false, receiveShadow: false };
    interior.batch.build(this.cathedralGroup, 'die-kathedrale-interior', unshadowed);
    plaza.batch.build(this.cathedralGroup, 'die-kathedrale-plaza', unshadowed);
    stair.batch.build(this.group, 'die-kathedrale-crypt-stair', unshadowed);
    catacombs.batch.build(this.catacombGroup, 'die-kathedrale-catacombs', unshadowed);
    exterior.batch.build(this.exteriorGroup, 'die-kathedrale-grounds', unshadowed);
    upper.batch.build(this.upperGroup, 'die-kathedrale-bell-tower', unshadowed);
    terrace.batch.build(this.upperGroup, 'die-kathedrale-roof-terraces', unshadowed);
    const hemisphere = createAmbienceHemisphereLight(this.ambience, profile.useReducedEffects);
    this.group.add(hemisphere);
    const candleFlames = new ColumnCandleFlames(this.cathedralGroup, materials.flame, DIE_KATHEDRALE_LIGHT_SITES);
    this.lighting = new DieKathedraleLighting(this.group, profile.quality, profile.useReducedEffects, DIE_KATHEDRALE_LIGHT_SITES, DIE_KATHEDRALE_PLAYER_SPAWN, candleFlames);
    this.mood = new UndergroundMood(scene, this.ambience, hemisphere, (share) => this.lighting.setMoonShare(share), profile.useReducedEffects);

    this.allBarriers = DIE_KATHEDRALE_ENTRANCES.map((entrance) => {
      const floor = siteFloor(entrance);
      return new WindowBarrier(entrance.id, entrance.x, entrance.z, entrance.outwardX, entrance.outwardZ, {
        ...DIE_KATHEDRALE_BARRIER_CONFIG,
        sill: DIE_KATHEDRALE_OPENINGS[entrance.kind].bottom,
      }, dieKathedraleFloorY(floor) + BARRIER_BOARD_Y, floor);
    });
    const levelOf = (floor: number): THREE.Group => {
      if (floor === CATACOMB_FLOOR) return this.catacombGroup;
      if (floor === UPPER_FLOOR) return this.upperGroup;
      return this.cathedralGroup;
    };
    const groupFor = (floor: number, zone: DieKathedraleZoneId): THREE.Group => {
      if (zone === 'esplanade' || zone === 'sideCourtyard') return this.exteriorGroup;
      if (zone === 'bellTower') return this.upperGroup;
      return levelOf(floor);
    };
    this.barrierViews = this.allBarriers.map((barrier, index) => {
      const { zone } = DIE_KATHEDRALE_ENTRANCES[index];
      const view = new WindowBarrierView(barrier, groupFor(barrier.floor, zone), () => this.onBarrierBoardRebuilt?.());
      view.group.traverse((object) => { object.castShadow = false; });
      return view;
    });

    this.doors = DIE_KATHEDRALE_DOORS.map((door) => {
      const floor = siteFloor(door);
      return new PointDoor(door.id, door.x, door.z, door.outwardX, door.outwardZ, { cost: door.cost }, dieKathedraleFloorY(floor), floor);
    });
    this.doorViews = this.doors.map((door, index) => {
      // The gates are iron leaves; the wicket keeps the shared boards.
      const { kind, zones } = DIE_KATHEDRALE_DOORS[index];
      const view = new PointDoorView(door, groupFor(door.floor, zones[1]), {
        reducedEffects: profile.useReducedEffects,
        ...(kind === 'gate' ? { panelMaterial: materials.gateIron, surface: 'metal' as const } : {}),
      });
      view.group.traverse((object) => { object.castShadow = false; });
      return view;
    });
    this.introWicket = this.doorViews[DIE_KATHEDRALE_DOORS.findIndex((door) => door.kind === 'wicket')].group;

    this.wallBuys = DIE_KATHEDRALE_WALL_BUYS.map((config) => new WallBuy(config));
    for (const wallBuy of this.wallBuys) {
      new WallBuyView(wallBuy, WEAPON_DEFINITIONS[wallBuy.weaponId], levelOf(wallBuy.floor), profile.useAdvancedRendering);
    }
    this.exhalisAltar = new ExhalisAltarOffering(this.catacombGroup, WEAPON_DEFINITIONS[EXHALIS_ALTAR_OFFERING.weaponId]);
    this.weaponStations = [this.exhalisAltar];

    this.showLevels(this.home);
    this.refreshZones();
  }

  /** Real lights alive (always the quality budget), for diagnostics and tests. */
  public get pointLightCount(): number {
    return this.lighting.pointLightCount;
  }

  public init(): void {
    applySceneAmbience(this.scene, this.ambience, this.profile.useReducedEffects);
    this.mood.reset();
  }

  public update(dt: number, observerPosition?: THREE.Vector3): void {
    this.updateIntroCues(dt);
    for (const view of this.barrierViews) {
      if (view.group.visible) view.update(dt);
    }
    for (const view of this.doorViews) view.update(dt);
    const observer = observerPosition ?? this.home;
    this.showLevels(observer);
    this.mood.update(this.presence.depth);
    this.lighting.update(dt, observerPosition, this.introElapsed === null ? this.activeZones : undefined);
    if (this.presence.showCathedral) this.atmosphere.update(dt);
    if (this.presence.showCathedral && this.exteriorGroup.visible) this.palauBanner.update(dt);
    if (this.presence.showCatacombs) {
      this.motes.update(dt);
      this.exhalisAltar.update(dt);
    }
    this.tombLids.update(dt);
    if (this.introElapsed !== null) return;
    if (this.presence.depth >= UNDERGROUND_SOUND_DEPTH) this.catacombEvents.update(dt, this.playAmbientEvent);
    else this.ambientEvents.update(dt, this.playAmbientEvent);
  }

  public reset(): void {
    this.finishIntro();
    for (const barrier of this.allBarriers) barrier.reset();
    for (const view of this.barrierViews) view.reset();
    for (const door of this.doors) door.reset();
    for (const view of this.doorViews) view.reset();
    this.lighting.reset();
    this.atmosphere.reset();
    this.palauBanner.reset();
    this.motes.reset();
    this.exhalisAltar.reset();
    for (const shrine of this.ringMachines) shrine.setDisplay('stocked');
    this.tombLids.reset();
    this.ambientEvents.reset();
    this.catacombEvents.reset();
    applySceneAmbience(this.scene, this.ambience, this.profile.useReducedEffects);
    this.mood.reset();
    this.openDoors.clear();
    this.activeZones.clear();
    this.activeZones.add(DIE_KATHEDRALE_START_ZONE);
    this.showLevels(this.home);
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
    this.emergenceSites = CRYPT_EMERGENCE_SITES.filter((site) => this.activeZones.has(site.zone));
  }

  /** A tomb's dead stir: its lid, if it has one still shut, grinds aside. */
  public disturbEmergenceSite(siteId: string, stage: ZombieEmergenceStage): void {
    if (stage === 'stir') this.tombLids.disturb(siteId);
  }

  public refreshColliders(): void {
    this.group.updateMatrixWorld(true);
    const closedDoors = this.doorViews
      .filter((_, index) => !this.openDoors.has(DIE_KATHEDRALE_DOORS[index].id))
      .map((view) => view.collider);
    this.colliders = [...this.structures.flatMap((structure) => structure.solids), ...closedDoors];
    this.wallColliders = [
      ...this.structures.flatMap((structure) => structure.playerWallBoxes()),
      mysteryBoxFootprint(this.mysteryBoxPlacement),
      ...closedDoors.map((collider) => new THREE.Box3().setFromObject(collider)),
      ...ENTRANCE_PLAYER_STOPS,
    ];
  }

  /** Draws only the levels the observer can see from where they are. */
  private showLevels(observer: THREE.Vector3): void {
    undergroundPresence(observer, this.openDoors.has(CRYPT_GATE_ID), this.presence);
    this.cathedralGroup.visible = this.presence.showCathedral;
    this.catacombGroup.visible = this.presence.showCatacombs;
    // The front and portals can reveal the neighbouring sectors before their gates open.
    const highView = observer.y > UPPER_VIEW_EYE_Y;
    this.exteriorGroup.visible = highView || observer.x > 3 || observer.z > 0;
    this.upperGroup.visible = highView || Math.hypot(observer.x - UPPER_VISIBILITY.x, observer.z - UPPER_VISIBILITY.z) < UPPER_VISIBILITY.radius;
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
