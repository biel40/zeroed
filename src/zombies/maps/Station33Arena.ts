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
import { buildCocheras } from './station33/CocherasBuilder';
import { buildConsigna } from './station33/ConsignaBuilder';
import { buildDoorFrames } from './station33/DoorFrames';
import { buildEscalatorHead } from './station33/EscalatorHeadBuilder';
import { PowerLever } from './station33/PowerLever';
import { RingLocker } from './station33/RingLocker';
import { buildServicePassages } from './station33/ServicePassageBuilder';
import { Station33Atmosphere } from './station33/Station33Atmosphere';
import type { Station33BuildContext } from './station33/Station33BuildContext';
import { Station33Lighting } from './station33/Station33Lighting';
import { Station33Power } from './station33/Station33Power';
import { createStation33Signage } from './station33/Station33Signage';
import { buildSubestacion } from './station33/SubestacionBuilder';
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
  STATION33_MAINS,
  STATION33_NAVIGATION_BOUNDS,
  STATION33_OPENINGS,
  STATION33_PLAYER_BOUNDS,
  STATION33_PLAYER_SPAWN,
  STATION33_RING_LOCKERS,
  STATION33_SPAWNS,
  STATION33_START_ZONE,
  STATION33_WALL_BUYS,
  STATION33_WALL_THICKNESS,
  STATION33_ZOMBIE_EYES,
  STATION33_ZOMBIE_SKINS,
  type Station33AmbientEvent,
  type Station33ZoneId,
} from './Station33Config';
import { createStation33Materials } from './Station33Materials';
import type { ArenaAmbientCue, ArenaRingMachine, ZombieArena } from './ZombieArena';

/** Seconds the motor-generators shake the station as they spin up. */
const MAINS_SPIN_UP = 2.5;

/**
 * Walk-through entrances stop the player at the wall line, so no spawn
 * passage is ever walkable whatever the player rectangle covers. Player
 * only: zombies and bullets go through once the boards are gone.
 */
const GATE_PLAYER_STOPS: ReadonlyArray<THREE.Box3> = STATION33_BARRIERS
  .filter((barrier) => barrier.kind === 'gate')
  .map((barrier) => {
    const { width, top } = STATION33_OPENINGS.gate;
    const halfAlong = width / 2;
    const halfAcross = STATION33_WALL_THICKNESS / 2;
    const alongX = barrier.outwardX === 0;
    return new THREE.Box3(
      new THREE.Vector3(barrier.x - (alongX ? halfAlong : halfAcross), 0, barrier.z - (alongX ? halfAcross : halfAlong)),
      new THREE.Vector3(barrier.x + (alongX ? halfAlong : halfAcross), top, barrier.z + (alongX ? halfAcross : halfAlong)),
    );
  });

/**
 * Station 33, a deep Soviet metro station overrun by the dead. Single-player
 * and premium; the closed beta unlocks it from the map menu. The arena only
 * orchestrates: zone builders shape the geometry, `Station33Lighting` and
 * `Station33Atmosphere` keep it alive, and gameplay objects come from the
 * shared barrier, door, wall-buy and Mystery Box systems.
 *
 * Phase 1 is the entrance vestibule with four entrances and the AK-47 and
 * Vector wall buys; the escalator north of it is the sealed frontier.
 * Phase 2 is the luggage office behind the first paid door: two more
 * entrances, the MP5, the Mystery Box and the locker that sells the
 * Resurrection ring. Phase 3 is the train sheds behind the second door:
 * two abandoned trains, three more entrances, the M60 and the crew locker
 * that sells the Sleight of Hand ring once the power is on. Phase 4 is the
 * machine room behind the third door: two more entrances and the main
 * switch, which powers the station for the rest of the run.
 */
export class Station33Arena implements ZombieArena {
  readonly id = 'station-33';
  readonly group = new THREE.Group();
  readonly ambience = STATION33_AMBIENCE;
  readonly zombieSkins = STATION33_ZOMBIE_SKINS;
  readonly zombieEyes = STATION33_ZOMBIE_EYES;
  readonly intro = STATION33_INTRO;
  readonly playerSpawn = STATION33_PLAYER_SPAWN;
  readonly useWallCollision = true;
  readonly playerBounds = STATION33_PLAYER_BOUNDS;
  readonly navigationBounds = STATION33_NAVIGATION_BOUNDS;
  readonly mysteryBoxPlacement = STATION33_BOX_PLACEMENT;
  readonly doors: ReadonlyArray<PointDoor>;
  readonly wallBuys: ReadonlyArray<WallBuy>;
  readonly ringMachines: ReadonlyArray<ArenaRingMachine>;
  readonly powerSwitch: PowerLever;
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
  private readonly power = new Station33Power();
  private readonly ambientEvents = new AmbientEventScheduler(STATION33_AMBIENT_EVENTS);
  private readonly hemisphere: THREE.HemisphereLight;
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
    buildCocheras(context, this.lighting);
    buildSubestacion(context, this.lighting);
    buildDoorFrames(context);
    buildServicePassages(context, this.lighting, STATION33_BARRIERS);
    this.ringLockers = STATION33_RING_LOCKERS.map((locker) => new RingLocker(context, locker, this.power));
    this.ringMachines = this.ringLockers;
    this.powerSwitch = new PowerLever(context, () => this.switchOnPower());
    this.atmosphere = new Station33Atmosphere(context, this.lighting);
    context.batch.build(this.group, 'station33-static', { castShadow: !profile.useReducedEffects, receiveShadow: true });
    this.hemisphere = createAmbienceHemisphereLight(this.ambience, profile.useReducedEffects);
    this.group.add(this.hemisphere);

    this.allBarriers = STATION33_BARRIERS.map((barrier) =>
      new WindowBarrier(barrier.id, barrier.x, barrier.z, barrier.outwardX, barrier.outwardZ, {
        ...STATION33_BARRIER_CONFIG,
        sill: STATION33_OPENINGS[barrier.kind].bottom,
      }));
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
    this.applyAmbience();
  }

  update(dt: number, observerPosition?: THREE.Vector3): void {
    this.updateIntroCues(dt);
    for (const view of this.barrierViews) {
      if (view.group.visible) view.update(dt);
    }
    for (const view of this.doorViews) view.update(dt);
    for (const locker of this.ringLockers) locker.update(dt);
    this.powerSwitch.update(dt);
    this.ambientEvents.update(dt, this.playAmbientEvent);
    this.lighting.update(dt, observerPosition);
    this.atmosphere.update(dt);
  }

  reset(): void {
    for (const barrier of this.allBarriers) barrier.reset();
    for (const view of this.barrierViews) view.reset();
    for (const door of this.doors) door.reset();
    for (const view of this.doorViews) view.reset();
    this.power.reset();
    this.powerSwitch.reset();
    for (const locker of this.ringLockers) locker.reset();
    this.introTime = null;
    this.ambientEvents.reset();
    this.lighting.reset();
    this.atmosphere.reset();
    this.applyAmbience();
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
   * Brings the station's power on for the rest of the run, as the main
   * switch closes: the motor-generators shake the station, the lights cut
   * out and kick back in brighter and steadier with the `mains` fixtures
   * alive, the fill light rises and the haze thins, and every ring locker
   * blazes (those that waited for power start selling). A reset turns the
   * power off again.
   */
  switchOnPower(): void {
    if (this.power.on) return;
    this.power.switchOn();
    this.lighting.restoreMains();
    this.lighting.tremor(MAINS_SPIN_UP);
    this.atmosphere.tremor(MAINS_SPIN_UP);
    this.applyAmbience();
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
      ...GATE_PLAYER_STOPS,
    ];
  }

  /** Real lights currently visible (always the quality budget), for diagnostics and tests. */
  get pointLightCount(): number {
    return this.lighting.visiblePointLights.length;
  }

  /** The map's mood, raised by the mains once the main switch is thrown. */
  private applyAmbience(): void {
    const reduced = this.profile.useReducedEffects;
    applySceneAmbience(this.scene, this.ambience, reduced);
    const { intensity, reducedIntensity } = this.ambience.hemisphereLight;
    this.hemisphere.intensity = reduced ? reducedIntensity : intensity;
    if (!this.power.on) return;
    this.hemisphere.intensity *= STATION33_MAINS.hemisphereBoost;
    this.scene.environmentIntensity *= STATION33_MAINS.environmentBoost;
    (this.scene.fog as THREE.FogExp2).density *= STATION33_MAINS.fogDensityScale;
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
