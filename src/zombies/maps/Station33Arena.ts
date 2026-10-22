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
import { AmbientEventScheduler } from './shared/AmbientEventScheduler';
import { applySceneAmbience, createAmbienceHemisphereLight } from './shared/ArenaAmbience';
import { ArenaStructure } from './shared/ArenaStructure';
import { StaticMeshBatch } from './shared/StaticMeshBatch';
import { buildConsigna } from './station33/ConsignaBuilder';
import { buildEscalatorHead } from './station33/EscalatorHeadBuilder';
import { RingLocker } from './station33/RingLocker';
import { buildServicePassages } from './station33/ServicePassageBuilder';
import { Station33Atmosphere } from './station33/Station33Atmosphere';
import type { Station33BuildContext } from './station33/Station33BuildContext';
import { Station33Lighting } from './station33/Station33Lighting';
import { createStation33Signage } from './station33/Station33Signage';
import { buildVestibule } from './station33/VestibuleBuilder';
import {
  STATION33_AMBIENCE,
  STATION33_AMBIENT_EVENTS,
  STATION33_BARRIER_CONFIG,
  STATION33_BARRIERS,
  STATION33_BOX_PLACEMENT,
  STATION33_DOORS,
  STATION33_INTRO,
  STATION33_INTRO_CUES,
  STATION33_NAVIGATION_BOUNDS,
  STATION33_PLAYER_BOUNDS,
  STATION33_PLAYER_SPAWN,
  STATION33_RING_LOCKERS,
  STATION33_SPAWNS,
  STATION33_START_ZONE,
  STATION33_WALL_BUYS,
  type Station33AmbientEvent,
  type Station33ZoneId,
} from './Station33Config';
import { createStation33Materials } from './Station33Materials';
import type { ArenaAmbientCue, ArenaRingMachine, ZombieArena } from './ZombieArena';

/**
 * Station 33, a deep Soviet metro station overrun by the dead. Single-player
 * and premium; the closed beta unlocks it from the map menu. The arena only
 * orchestrates: zone builders shape the geometry, `Station33Lighting` and
 * `Station33Atmosphere` keep it alive, and gameplay objects come from the
 * shared barrier, door, wall-buy and Mystery Box systems.
 *
 * Phase 1 is the entrance vestibule with four entrances and an AK-47 wall
 * buy; the escalator north of it is the sealed frontier. Phase 2 is the
 * luggage office behind the first paid door: two more entrances, the M4A1,
 * the Mystery Box and the locker that sells the Resurrection ring.
 */
export class Station33Arena implements ZombieArena {
  readonly id = 'station-33';
  readonly group = new THREE.Group();
  readonly ambience = STATION33_AMBIENCE;
  readonly intro = STATION33_INTRO;
  readonly playerSpawn = STATION33_PLAYER_SPAWN;
  readonly useWallCollision = true;
  readonly playerBounds = STATION33_PLAYER_BOUNDS;
  readonly navigationBounds = STATION33_NAVIGATION_BOUNDS;
  readonly mysteryBoxPlacement = STATION33_BOX_PLACEMENT;
  readonly doors: ReadonlyArray<PointDoor>;
  readonly wallBuys: ReadonlyArray<WallBuy>;
  readonly ringMachines: ReadonlyArray<ArenaRingMachine>;
  onTopologyChanged: (() => void) | null = null;
  onBarrierBoardRebuilt: (() => void) | null = null;
  onAmbientCue: ((cue: ArenaAmbientCue) => void) | null = null;

  colliders: ReadonlyArray<THREE.Object3D> = [];
  wallColliders: ReadonlyArray<THREE.Box3> = [];
  barriers: ReadonlyArray<WindowBarrier> = [];
  spawnPoints: ReadonlyArray<ZombieSpawnDefinition> = [];

  private readonly structure = new ArenaStructure(this.group);
  private readonly allBarriers: ReadonlyArray<WindowBarrier>;
  private readonly barrierViews: ReadonlyArray<WindowBarrierView>;
  private readonly doorViews: ReadonlyArray<PointDoorView>;
  private readonly ringLockers: ReadonlyArray<RingLocker>;
  private readonly activeZones = new Set<Station33ZoneId>([STATION33_START_ZONE]);
  private readonly lighting: Station33Lighting;
  private readonly atmosphere: Station33Atmosphere;
  private readonly ambientEvents = new AmbientEventScheduler(STATION33_AMBIENT_EVENTS);
  /** Seconds into the intro while its cues are pending, else null. */
  private introTime: number | null = null;
  private nextIntroCue = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly profile: DeviceProfile,
  ) {
    this.group.name = 'station-33';
    const materials = createStation33Materials(profile.anisotropyLimit);
    const context: Station33BuildContext = {
      group: this.group,
      structure: this.structure,
      batch: new StaticMeshBatch(),
      materials,
      signage: createStation33Signage(profile.anisotropyLimit),
      profile,
    };
    this.lighting = new Station33Lighting(context);
    this.lighting.registerMaterial(context.signage.litMaterial, 'unstable');
    buildVestibule(context);
    buildEscalatorHead(context, this.lighting);
    buildConsigna(context);
    buildServicePassages(context, this.lighting, STATION33_BARRIERS);
    this.ringLockers = STATION33_RING_LOCKERS.map((locker) => new RingLocker(context, locker));
    this.ringMachines = this.ringLockers;
    this.atmosphere = new Station33Atmosphere(context, this.lighting);
    context.batch.build(this.group, 'station33-static', { castShadow: !profile.useReducedEffects, receiveShadow: true });
    this.group.add(createAmbienceHemisphereLight(this.ambience, profile.useReducedEffects));

    this.allBarriers = STATION33_BARRIERS.map((barrier) =>
      new WindowBarrier(barrier.id, barrier.x, barrier.z, barrier.outwardX, barrier.outwardZ, STATION33_BARRIER_CONFIG));
    this.barrierViews = this.allBarriers.map((barrier) => {
      const view = new WindowBarrierView(barrier, this.group, () => this.onBarrierBoardRebuilt?.(), Math.random, materials.barrierSlat);
      if (profile.useReducedEffects) view.group.traverse((object) => { object.castShadow = false; });
      return view;
    });

    this.doors = STATION33_DOORS.map((door) => new PointDoor(door.id, door.x, door.z, door.outwardX, door.outwardZ, { cost: door.cost }));
    this.doorViews = this.doors.map((door) => {
      // Steel sheets instead of the mansion planks: same door, same burst.
      const view = new PointDoorView(door, this.group, {
        panelMaterial: materials.paintedSteel,
        surface: 'metal',
        reducedEffects: profile.useReducedEffects,
      });
      if (profile.useReducedEffects) view.group.traverse((object) => { object.castShadow = false; });
      return view;
    });

    this.wallBuys = STATION33_WALL_BUYS.map((config) => new WallBuy(config));
    for (const wallBuy of this.wallBuys) new WallBuyView(wallBuy, WEAPON_DEFINITIONS[wallBuy.weaponId], this.group);

    this.refreshZones();
  }

  init(): void {
    applySceneAmbience(this.scene, this.ambience, this.profile.useReducedEffects);
  }

  update(dt: number, observerPosition?: THREE.Vector3): void {
    this.updateIntroCues(dt);
    for (const view of this.barrierViews) {
      if (view.group.visible) view.update(dt);
    }
    for (const view of this.doorViews) view.update(dt);
    for (const locker of this.ringLockers) locker.update(dt);
    this.ambientEvents.update(dt, this.playAmbientEvent);
    this.lighting.update(dt, observerPosition);
    this.atmosphere.update(dt);
  }

  reset(): void {
    for (const barrier of this.allBarriers) barrier.reset();
    for (const view of this.barrierViews) view.reset();
    for (const door of this.doors) door.reset();
    for (const view of this.doorViews) view.reset();
    for (const locker of this.ringLockers) locker.reset();
    this.introTime = null;
    this.ambientEvents.reset();
    this.lighting.reset();
    this.atmosphere.reset();
    this.activeZones.clear();
    this.activeZones.add(STATION33_START_ZONE);
    this.refreshZones();
  }

  /** The hall wakes from a blackout while the intro camera looks on. */
  startIntro(): void {
    this.introTime = 0;
    this.nextIntroCue = 0;
    this.lighting.powerUp();
  }

  finishIntro(): void {
    this.introTime = null;
    this.lighting.finishPowerUp();
  }

  /**
   * Opens the zone behind a door its PointDoor just unlocked. The topology
   * changes at once; the steel sheets burst away on their own afterwards.
   * The escalator frontier is sealed, not for sale.
   */
  activateDoor(doorId: string): boolean {
    const door = STATION33_DOORS.find((candidate) => candidate.id === doorId);
    if (!door || this.activeZones.has(door.zone)) return false;
    this.activeZones.add(door.zone);
    this.refreshZones();
    this.onTopologyChanged?.();
    return true;
  }

  refreshSpawnPoints(): void {
    this.spawnPoints = [...this.activeZones].flatMap((zone) => STATION33_SPAWNS[zone]);
  }

  refreshColliders(): void {
    this.group.updateMatrixWorld(true);
    const closedDoors = this.doorViews
      .filter((_, index) => !this.activeZones.has(STATION33_DOORS[index].zone))
      .map((view) => view.collider);
    this.colliders = [...this.structure.solids, ...closedDoors];
    this.wallColliders = [
      ...this.structure.playerWallBoxes(),
      mysteryBoxFootprint(this.mysteryBoxPlacement),
      ...closedDoors.map((collider) => new THREE.Box3().setFromObject(collider)),
    ];
  }

  /** Real lights currently visible (always the quality budget), for diagnostics and tests. */
  get pointLightCount(): number {
    return this.lighting.visiblePointLights.length;
  }

  private refreshZones(): void {
    this.refreshSpawnPoints();
    this.barriers = this.allBarriers.filter((_, index) => this.activeZones.has(STATION33_BARRIERS[index].zone));
    for (let index = 0; index < this.barrierViews.length; index++) {
      this.barrierViews[index].group.visible = this.activeZones.has(STATION33_BARRIERS[index].zone);
    }
    this.refreshColliders();
  }

  private updateIntroCues(dt: number): void {
    if (this.introTime === null) return;
    this.introTime += Math.max(0, dt);
    while (this.nextIntroCue < STATION33_INTRO_CUES.length && STATION33_INTRO_CUES[this.nextIntroCue].time <= this.introTime) {
      const { eventId } = STATION33_INTRO_CUES[this.nextIntroCue++];
      const event = STATION33_AMBIENT_EVENTS.find((candidate) => candidate.id === eventId);
      if (event) this.playAmbientEvent(event);
    }
    if (this.nextIntroCue >= STATION33_INTRO_CUES.length) this.introTime = null;
  }

  /** Bound once: the scheduler calls it from the frame loop. */
  private readonly playAmbientEvent = (event: Station33AmbientEvent): void => {
    if (event.effect === 'blackout') this.lighting.powerDip(event.duration);
    if (event.effect === 'tremor') {
      this.lighting.tremor(event.duration);
      this.atmosphere.tremor(event.duration);
    }
    this.onAmbientCue?.(event);
  };
}
