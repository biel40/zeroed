export interface SoulLampDefinition {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly floor: number;
}

export interface SoulLampState {
  readonly id: string;
  activated: boolean;
  currentSouls: number;
  pendingSouls: number;
  completed: boolean;
}

export interface SoulArrivalResult {
  readonly lampCompleted: boolean;
  readonly unlocked: boolean;
}

/** Authoritative, run-local state for the complete soul-lamp ritual. */
export class SecretRoomState {
  readonly lamps: SoulLampState[];
  unlocked = false;
  ritualScareTriggered = false;

  constructor(
    readonly definitions: ReadonlyArray<SoulLampDefinition>,
    readonly requiredSouls: number,
    readonly captureRadius: number,
  ) {
    this.lamps = definitions.map((definition) => ({
      id: definition.id,
      activated: false,
      currentSouls: 0,
      pendingSouls: 0,
      completed: false,
    }));
  }

  get completedLamps(): number {
    return this.lamps.reduce((total, lamp) => total + (lamp.completed ? 1 : 0), 0);
  }

  activateLamp(lampIndex: number): boolean {
    const lamp = this.lamps[lampIndex];
    if (!lamp || lamp.activated) return false;
    lamp.activated = true;
    return true;
  }

  /** Reserves one nearby lamp slot while its soul is still travelling. */
  beginSoul(x: number, z: number, floor: number): number | null {
    const radiusSq = this.captureRadius * this.captureRadius;
    let nearestIndex: number | null = null;
    let nearestDistanceSq = radiusSq;

    for (let index = 0; index < this.lamps.length; index++) {
      const lamp = this.lamps[index];
      const definition = this.definitions[index];
      if (
        definition.floor !== floor ||
        !lamp.activated ||
        lamp.completed ||
        lamp.currentSouls + lamp.pendingSouls >= this.requiredSouls
      ) continue;
      const dx = x - definition.position.x;
      const dz = z - definition.position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq > nearestDistanceSq) continue;
      nearestDistanceSq = distanceSq;
      nearestIndex = index;
    }

    if (nearestIndex === null) return null;
    this.lamps[nearestIndex].pendingSouls++;
    return nearestIndex;
  }

  absorbSoul(lampIndex: number): SoulArrivalResult {
    const lamp = this.lamps[lampIndex];
    if (!lamp || lamp.pendingSouls <= 0 || lamp.completed) {
      return { lampCompleted: false, unlocked: false };
    }

    lamp.pendingSouls--;
    lamp.currentSouls++;
    const lampCompleted = lamp.currentSouls >= this.requiredSouls;
    if (lampCompleted) lamp.completed = true;

    const unlocked = lampCompleted && !this.unlocked && this.completedLamps === this.lamps.length;
    if (unlocked) this.unlocked = true;
    return { lampCompleted, unlocked };
  }

  triggerRitualScare(): boolean {
    if (!this.unlocked || this.ritualScareTriggered) return false;
    this.ritualScareTriggered = true;
    return true;
  }

  reset(): void {
    this.unlocked = false;
    this.ritualScareTriggered = false;
    for (const lamp of this.lamps) {
      lamp.activated = false;
      lamp.currentSouls = 0;
      lamp.pendingSouls = 0;
      lamp.completed = false;
    }
  }
}
