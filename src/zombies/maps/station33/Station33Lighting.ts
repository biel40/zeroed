import * as THREE from 'three';
import { POINT_LIGHT_BUDGET } from '../shared/PointLightBudget';
import {
  AMBER_LAMP_COLOR,
  AMBER_SCONCES,
  EMERGENCY_COLOR,
  EMERGENCY_LAMP,
  FLUORESCENT_COLOR,
  FLUORESCENT_FIXTURES,
  STATION33_INTRO_POWER_UP,
  STATION33_POINT_LIGHTS,
  STATION33_START_ZONE,
  station33ZoneAt,
  type Station33LightCircuit,
  type Station33ZoneId,
} from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';
import { ceilingHeightAt } from './VaultProfile';

/** Fault windows of the fluorescent circuits: how often they stutter and how dark they get. */
const FLUORESCENT_FAULTS = {
  steady: { rate: 0.6, faultChance: 0.06, floor: 0.3 },
  unstable: { rate: 1.1, faultChance: 0.3, floor: 0.12 },
  failing: { rate: 1.7, faultChance: 0.6, floor: 0.02 },
} as const;

const CIRCUITS: ReadonlyArray<Station33LightCircuit> = ['steady', 'unstable', 'failing', 'amber', 'emergency'];
/** Each circuit runs its own clock offset, so no two fault patterns line up. */
const CIRCUIT_PHASES: Readonly<Record<Station33LightCircuit, number>> = {
  steady: 0.37,
  unstable: 2.91,
  failing: 5.13,
  amber: 1.7,
  emergency: 0,
};
/** Seconds a circuit stutters on its starters before it holds. */
const STARTER_FLICKER = 0.5;
const POWER_UP_END = Math.max(...Object.values(STATION33_INTRO_POWER_UP)) + STARTER_FLICKER;
/** Hanging height under the vault; lower ceilings mount fixtures just below them. */
const FIXTURE_Y = 4.05;
const FIXTURE_DROP = 0.25;
/** Metres past the door before the real lights follow the player into the other room. */
const ZONE_SWITCH_MARGIN = 0.6;
const TUBE_LENGTH = 1.55;

function hash(value: number): number {
  const s = Math.sin(value * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Brightness 0..1 of a light circuit at `time`. Fluorescents hum steadily
 * and fall into irregular stutter windows; amber bulbs breathe; the
 * battery emergency lamp pulses slowly. Deterministic and allocation free.
 */
export function circuitLevel(circuit: Station33LightCircuit, time: number, phase: number): number {
  if (circuit === 'emergency') return 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(time * 2.4 + phase));
  if (circuit === 'amber') return 0.9 + 0.06 * Math.sin(time * 1.7 + phase) + 0.04 * Math.sin(time * 5.3 + phase * 2);
  const fault = FLUORESCENT_FAULTS[circuit];
  const window = Math.floor(time * fault.rate + phase);
  if (hash(window + phase * 31) >= fault.faultChance) return 0.97 + 0.03 * hash(Math.floor(time * 30));
  const stutter = hash(Math.floor(time * 22) + window * 7.3);
  return stutter > 0.45 ? 1 : fault.floor + stutter * 0.3;
}

interface CircuitMaterial {
  readonly material: THREE.MeshBasicMaterial;
  readonly circuit: Station33LightCircuit;
  readonly baseColor: THREE.Color;
}

interface CircuitLight {
  readonly light: THREE.PointLight;
  readonly circuit: Station33LightCircuit;
  readonly baseIntensity: number;
  readonly zone: Station33ZoneId;
}

/**
 * Practical lights of the station: fluorescent rows, amber sconces and the
 * red emergency lamp. Emissive materials carry most of the light; of the
 * real lights in STATION33_POINT_LIGHTS only POINT_LIGHT_BUDGET stay visible,
 * the player's room first, a count fixed for the match so shaders never
 * recompile.
 */
export class Station33Lighting {
  private readonly circuitMaterials: CircuitMaterial[] = [];
  private readonly lights: CircuitLight[] = [];
  /** Room whose lights currently come first in the budget. */
  private lightZone: Station33ZoneId | null = null;
  private readonly levels = new Map<Station33LightCircuit, number>();
  private readonly tubeMaterials = new Map<Station33LightCircuit, THREE.MeshBasicMaterial>();
  private time = 0;
  private dipRemaining = 0;
  private dipDuration = 1;
  private tremorRemaining = 0;
  /** Seconds into a cold start, or null when the mains are simply on. */
  private powerUpElapsed: number | null = null;

  constructor(private readonly context: Station33BuildContext) {
    for (const circuit of CIRCUITS) {
      const color = circuit === 'amber' ? AMBER_LAMP_COLOR : circuit === 'emergency' ? EMERGENCY_COLOR : FLUORESCENT_COLOR;
      this.tubeMaterials.set(circuit, this.registerMaterial(
        new THREE.MeshBasicMaterial({ name: `station33_${circuit}_lamp`, color }),
        circuit,
      ));
    }
    this.buildFluorescentFixtures();
    this.buildSconces();
    this.buildEmergencyLamp();
    this.buildPointLights();
    this.showLightsFor(STATION33_START_ZONE);
    this.update(0);
  }

  /** Real lights currently visible (always the quality budget). */
  get visiblePointLights(): ReadonlyArray<THREE.PointLight> {
    return this.lights.filter((entry) => entry.light.visible).map((entry) => entry.light);
  }

  /** Emissive material driven by `circuit` (shared by every lamp on it). */
  circuitMaterial(circuit: Station33LightCircuit): THREE.MeshBasicMaterial {
    return this.tubeMaterials.get(circuit)!;
  }

  /** Makes any emissive material (lightbox, lamp head) follow a circuit from its current colour. */
  registerMaterial(material: THREE.MeshBasicMaterial, circuit: Station33LightCircuit): THREE.MeshBasicMaterial {
    this.circuitMaterials.push({ material, circuit, baseColor: material.color.clone() });
    return material;
  }

  /** Mains failure: everything but the emergency circuit dies, then stutters back. */
  powerDip(duration: number): void {
    this.dipDuration = Math.max(0.1, duration);
    this.dipRemaining = this.dipDuration;
  }

  /** Cold start: mains dark, then each circuit kicks on at its `STATION33_INTRO_POWER_UP` time. */
  powerUp(): void {
    this.powerUpElapsed = 0;
  }

  /** Ends a cold start at once: every circuit back to normal. */
  finishPowerUp(): void {
    this.powerUpElapsed = null;
  }

  /** A passing train shakes the supply: fluorescents waver while it lasts. */
  tremor(duration: number): void {
    this.tremorRemaining = Math.max(this.tremorRemaining, duration);
  }

  /** Animates every circuit; with an observer, the real lights follow them between rooms. */
  update(dt: number, observer?: THREE.Vector3): void {
    if (observer) this.followObserver(observer);
    this.time += Math.max(0, dt);
    this.dipRemaining = Math.max(0, this.dipRemaining - dt);
    this.tremorRemaining = Math.max(0, this.tremorRemaining - dt);
    if (this.powerUpElapsed !== null) {
      this.powerUpElapsed += Math.max(0, dt);
      if (this.powerUpElapsed >= POWER_UP_END) this.powerUpElapsed = null;
    }
    const mains = this.mainsLevel();
    for (const circuit of CIRCUITS) {
      const level = circuitLevel(circuit, this.time, CIRCUIT_PHASES[circuit]);
      this.levels.set(circuit, circuit === 'emergency' ? level : level * mains * this.powerUpLevel(circuit));
    }
    for (const entry of this.circuitMaterials) {
      entry.material.color.copy(entry.baseColor).multiplyScalar(Math.max(0.04, this.levels.get(entry.circuit)!));
    }
    for (const entry of this.lights) {
      entry.light.intensity = entry.baseIntensity * this.levels.get(entry.circuit)!;
    }
  }

  reset(): void {
    this.showLightsFor(STATION33_START_ZONE);
    this.time = 0;
    this.dipRemaining = 0;
    this.tremorRemaining = 0;
    this.powerUpElapsed = null;
    this.update(0);
  }

  /** Switches rooms only once the observer is clearly past the door, so the doorway never flickers. */
  private followObserver(observer: THREE.Vector3): void {
    const margin = this.lightZone === 'vestibule' ? -ZONE_SWITCH_MARGIN : ZONE_SWITCH_MARGIN;
    this.showLightsFor(station33ZoneAt(observer.x + margin));
  }

  /** The room's lights in authored priority, then the other room's, up to the quality budget. */
  private showLightsFor(zone: Station33ZoneId): void {
    if (zone === this.lightZone) return;
    this.lightZone = zone;
    const ordered = [...this.lights.filter((entry) => entry.zone === zone), ...this.lights.filter((entry) => entry.zone !== zone)];
    const budget = POINT_LIGHT_BUDGET[this.context.profile.quality];
    ordered.forEach((entry, index) => { entry.light.visible = index < budget; });
  }

  private powerUpLevel(circuit: Exclude<Station33LightCircuit, 'emergency'>): number {
    if (this.powerUpElapsed === null) return 1;
    const sinceKick = this.powerUpElapsed - STATION33_INTRO_POWER_UP[circuit];
    if (sinceKick < 0) return 0;
    if (sinceKick >= STARTER_FLICKER) return 1;
    // The starter strikes a few times before the tube holds.
    return hash(Math.floor(this.time * 24) + STATION33_INTRO_POWER_UP[circuit] * 17) > 0.45 ? 1 : 0.06;
  }

  private mainsLevel(): number {
    let level = 1;
    if (this.dipRemaining > 0) {
      const progress = 1 - this.dipRemaining / this.dipDuration;
      // Dead for most of the dip, then the starters kick the tubes back.
      level = progress < 0.75 ? 0.03 : hash(Math.floor(this.time * 25)) > 0.5 ? 1 : 0.1;
    }
    if (this.tremorRemaining > 0) level *= 0.86 + 0.14 * Math.sin(this.time * 31);
    return level;
  }

  private buildFluorescentFixtures(): void {
    const { batch, materials } = this.context;
    const deadTube = materials.greySteel;
    for (const fixture of FLUORESCENT_FIXTURES) {
      const ceiling = ceilingHeightAt(fixture.x);
      const y = Math.min(FIXTURE_Y, ceiling - FIXTURE_DROP);
      batch.addBox(materials.greySteel, fixture.x, y + 0.05, fixture.z, 0.26, 0.08, 1.75);
      for (const offset of [-0.65, 0.65]) {
        const rodLength = ceiling - (y + 0.09);
        const rod = new THREE.CylinderGeometry(0.012, 0.012, rodLength, 5);
        rod.translate(fixture.x, y + 0.09 + rodLength / 2, fixture.z + offset);
        batch.add(rod, materials.greySteel);
      }
      const tubeMaterial = fixture.circuit === 'dead' ? deadTube : this.circuitMaterial(fixture.circuit);
      for (const side of [-0.06, 0.06]) {
        const tube = new THREE.CylinderGeometry(0.024, 0.024, TUBE_LENGTH, 8);
        tube.rotateX(Math.PI / 2);
        tube.translate(fixture.x + side, y - 0.015, fixture.z);
        batch.add(tube, tubeMaterial);
      }
    }
  }

  private buildSconces(): void {
    const { batch, materials } = this.context;
    for (const sconce of AMBER_SCONCES) {
      const inward = sconce.x < 0 ? 1 : -1;
      const x = sconce.x + inward * 0.2;
      batch.addBox(materials.bronze, sconce.x + inward * 0.06, 2.75, sconce.z, 0.12, 0.3, 0.16);
      batch.addBox(materials.bronze, sconce.x + inward * 0.13, 2.6, sconce.z, 0.18, 0.04, 0.04);
      const globe = new THREE.SphereGeometry(0.13, 12, 8);
      globe.translate(x, 2.75, sconce.z);
      batch.add(globe, sconce.lit ? this.circuitMaterial('amber') : materials.windowGlass);
    }
  }

  private buildEmergencyLamp(): void {
    const { batch, materials } = this.context;
    const { x, y } = EMERGENCY_LAMP;
    const z = EMERGENCY_LAMP.z + 0.06;
    batch.addBox(materials.greySteel, x, y, z, 0.34, 0.24, 0.12);
    const lens = new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12);
    lens.rotateX(Math.PI / 2);
    lens.translate(x, y, z + 0.1);
    batch.add(lens, this.circuitMaterial('emergency'));
    for (const offset of [-0.07, 0, 0.07]) {
      batch.addBox(materials.greySteel, x + offset, y, z + 0.16, 0.012, 0.22, 0.012);
    }
  }

  private buildPointLights(): void {
    for (const config of STATION33_POINT_LIGHTS) {
      const light = new THREE.PointLight(config.color, config.intensity, config.distance, 1.7);
      light.position.set(config.x, config.y, config.z);
      light.castShadow = false;
      light.userData.mapRole = 'station-light';
      this.context.group.add(light);
      this.lights.push({ light, circuit: config.circuit, baseIntensity: config.intensity, zone: config.zone });
    }
  }
}
