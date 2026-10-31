import * as THREE from 'three';
import type { EvacuationStage } from '../../evacuation/EvacuationProtocol';
import type { MapPower } from '../shared/MapPower';
import { PowerLever } from '../shared/PowerLever';
import {
  PROTOCOL33_BLAST_DOOR,
  PROTOCOL33_ENDING,
  PROTOCOL33_PANEL,
  PROTOCOL33_RULES,
  PROTOCOL33_SURFACE_Y,
  PROTOCOL33_SWITCHES,
  PROTOCOL33_TRUCK,
  type Protocol33Switch,
} from '../Station33Config';
import type { ArenaEvacuation, ArenaEvacuationSwitch, ArenaUsePoint } from '../ZombieArena';
import { BlastDoor } from './BlastDoor';
import { Protocol33Panel } from './Protocol33Panel';
import type { Station33BuildContext } from './Station33BuildContext';
import type { Station33Lighting } from './Station33Lighting';
import { station33PowerLeverLook } from './Station33Machines';

const STATUS_OFF = new THREE.Color(0x1d0605);
const STATUS_RED = new THREE.Color(0xc41a0c);
const STATUS_GREEN = new THREE.Color(0x46ff70);
/** Height of each switch's status lamp, over its danger plate. */
const STATUS_LAMP_Y = 3.15;
/** The ventilation fan's centre, radius and full speed (rad/s), and how fast it spins up. */
const FAN = { y: 3.95, radius: 0.42, speed: 14, spinUp: 4 } as const;

/** One auxiliary system: its lever, status lamp and (ventilation) wall fan. */
interface AuxiliarySystem {
  readonly lever: PowerLever;
  readonly lamp: THREE.MeshBasicMaterial;
  readonly rotor: THREE.Object3D | null;
  spin: number;
}

/**
 * Station 33's evacuation (Protocol 33), as the map presents it: the two
 * auxiliary switches (the shared knife switch, each with a status lamp and
 * the ventilation's wall fan), the control panel, the blast door and the
 * alarm. `ZombiesMode` runs the protocol through `ArenaEvacuation`; the
 * arena reads `hordeConverging` and `blastDoorCollider` for its layout and
 * hears through `onLayoutChanged` when either changes.
 */
export class Protocol33 implements ArenaEvacuation {
  public readonly rules = PROTOCOL33_RULES;
  public readonly ending = PROTOCOL33_ENDING;
  public readonly defenseRadius = PROTOCOL33_PANEL.defenseRadius;
  public readonly panel: ArenaUsePoint = {
    position: { x: PROTOCOL33_PANEL.x - PROTOCOL33_PANEL.depth - 0.4, y: 1.3, z: PROTOCOL33_PANEL.z },
    floor: 0,
    useRange: 2.0,
    lookDotMin: 0.45,
  };

  /** Boarding at the truck's open box body, on the surface. */
  public readonly extraction: ArenaUsePoint = {
    position: { x: PROTOCOL33_TRUCK.x, y: PROTOCOL33_SURFACE_Y + 1.5, z: PROTOCOL33_TRUCK.z + PROTOCOL33_TRUCK.length / 2 + 0.8 },
    floor: 1,
    useRange: 2.4,
    lookDotMin: 0.35,
  };

  public readonly exitPosition = { x: PROTOCOL33_BLAST_DOOR.x, y: 1.2, z: PROTOCOL33_BLAST_DOOR.z };
  public readonly switches: ReadonlyArray<ArenaEvacuationSwitch>;
  private readonly systems: ReadonlyArray<AuxiliarySystem>;
  private readonly panelView: Protocol33Panel;
  private readonly door: BlastDoor;
  private readonly panelState = {
    powered: false,
    restored: PROTOCOL33_SWITCHES.map(() => false),
    stage: 'locked' as EvacuationStage,
    progress: 0,
    defended: true,
  };

  public constructor(
    context: Station33BuildContext,
    private readonly lighting: Station33Lighting,
    private readonly power: MapPower,
    private readonly onLayoutChanged: () => void,
  ) {
    this.systems = PROTOCOL33_SWITCHES.map((config, index) => ({
      lever: new PowerLever(context, config, station33PowerLeverLook(context, config.plate), () => { this.panelState.restored[index] = true; }),
      lamp: buildStatusLamp(context, config),
      rotor: config.fan ? buildFan(context, config) : null,
      spin: 0,
    }));
    this.switches = PROTOCOL33_SWITCHES.map((config, index) => ({ labelKey: config.labelKey, lever: this.systems[index].lever }));
    this.panelView = new Protocol33Panel(context, PROTOCOL33_SWITCHES.length);
    this.door = new BlastDoor(context);
  }

  public get powered(): boolean {
    return this.power.on;
  }

  /** While the protocol runs, the horde converges on the workshop. */
  public get hordeConverging(): boolean {
    return this.panelState.stage === 'defending' || this.panelState.stage === 'escaping';
  }

  /** The blast door's solid while it is shut, else null. */
  public get blastDoorCollider(): THREE.Mesh | null {
    return this.door.isClosed ? this.door.collider : null;
  }

  public showStage(stage: EvacuationStage): void {
    if (stage === this.panelState.stage) return;
    const wasConverging = this.hordeConverging;
    this.panelState.stage = stage;
    if (stage === 'defending') this.lighting.soundAlarm();
    const doorOpened = stage === 'escaping' && this.door.openDoor();
    if (doorOpened || this.hordeConverging !== wasConverging) this.onLayoutChanged();
  }

  public showDefense(progress: number, defended: boolean): void {
    this.panelState.progress = THREE.MathUtils.clamp(progress, 0, 1);
    this.panelState.defended = defended;
  }

  public update(dt: number): void {
    const step = Math.max(0, dt);
    this.panelState.powered = this.power.on;
    for (let index = 0; index < this.systems.length; index++) {
      const system = this.systems[index];
      system.lever.update(step);
      const restored = this.panelState.restored[index];
      system.lamp.color.copy(!this.power.on ? STATUS_OFF : restored ? STATUS_GREEN : STATUS_RED);
      if (!system.rotor) continue;
      system.spin = THREE.MathUtils.damp(system.spin, restored ? FAN.speed : 0, FAN.spinUp, step);
      system.rotor.rotation.z += system.spin * step;
    }
    this.door.update(step);
    this.panelView.update(step, this.panelState);
  }

  /** New run: switches open, lamps dark, fan still, door shut, alarm off (the lighting resets itself). */
  public reset(): void {
    this.systems.forEach((system, index) => {
      system.lever.reset();
      system.spin = 0;
      system.rotor?.rotation.set(0, 0, 0);
      this.panelState.restored[index] = false;
    });
    this.panelState.powered = false;
    this.panelState.stage = 'locked';
    this.panelState.progress = 0;
    this.panelState.defended = true;
    this.door.reset();
    this.panelView.reset(PROTOCOL33_SWITCHES.length);
    this.update(0);
  }
}

/** A caged status lamp on the wall over the switch's plate: dark, red with the power, green once restored. */
function buildStatusLamp(context: Station33BuildContext, config: Protocol33Switch): THREE.MeshBasicMaterial {
  const { batch, materials, group } = context;
  const at = (out: number): THREE.Vector3 => new THREE.Vector3(config.x + config.facingX * out, STATUS_LAMP_Y, config.z + config.facingZ * out);
  const plate = at(0.03);
  const across = config.facingX !== 0 ? { x: 0.06, z: 0.22 } : { x: 0.22, z: 0.06 };
  batch.addBox(materials.greySteel, plate.x, plate.y, plate.z, across.x, 0.22, across.z);
  const material = new THREE.MeshBasicMaterial({ name: `protocol33_status_${config.id}`, color: STATUS_OFF });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), material);
  lamp.position.copy(at(0.13));
  group.add(lamp);
  return material;
}

/** The ventilation's wall fan above its switch: a dark duct mouth, a ring and a four-bladed rotor. */
function buildFan(context: Station33BuildContext, config: Protocol33Switch): THREE.Object3D {
  const { batch, materials, group } = context;
  const yaw = Math.atan2(config.facingX, config.facingZ);
  const mount = new THREE.Group();
  mount.position.set(config.x + config.facingX * 0.06, FAN.y, config.z + config.facingZ * 0.06);
  mount.rotation.y = yaw;
  mount.name = 'protocol33-fan';
  const duct = new THREE.CircleGeometry(FAN.radius, 20).rotateY(yaw).translate(config.x + config.facingX * 0.01, FAN.y, config.z + config.facingZ * 0.01);
  batch.add(duct, materials.rubber);
  const ring = new THREE.TorusGeometry(FAN.radius, 0.045, 6, 24).rotateY(yaw)
    .translate(config.x + config.facingX * 0.06, FAN.y, config.z + config.facingZ * 0.06);
  batch.add(ring, materials.greySteel);
  const rotor = new THREE.Group();
  rotor.name = 'protocol33-fan-rotor';
  for (let blade = 0; blade < 4; blade++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, FAN.radius - 0.08, 0.015).translate(0, (FAN.radius - 0.08) / 2 + 0.05, 0), materials.paintedSteel);
    mesh.rotation.set(0, 0.35, (blade * Math.PI) / 2, 'ZYX');
    rotor.add(mesh);
  }
  rotor.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10).rotateX(Math.PI / 2), materials.greySteel));
  mount.add(rotor);
  if (context.profile.useReducedEffects) mount.traverse((object) => { object.castShadow = false; });
  group.add(mount);
  return rotor;
}
