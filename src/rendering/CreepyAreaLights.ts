import * as THREE from 'three';

export const CREEPY_AREA_LIGHT_COLOR = 0xff180c;

const BULB_LIT_COLOR = new THREE.Color(0xff2c18);
const BULB_DARK_COLOR = new THREE.Color(0x260100);

interface CreepyAreaLight {
  readonly light: THREE.PointLight;
  readonly bulbMaterial: THREE.MeshBasicMaterial;
  readonly baseIntensity: number;
  readonly phase: number;
}

/**
 * Produces an uneven electrical flutter with short, deep brownouts. Combining
 * slow and fast waves avoids a regular pulse while remaining deterministic.
 */
export function creepyLightLevel(time: number, phase: number): number {
  const flutter =
    0.84
    + Math.sin(time * 8.7 + phase) * 0.1
    + Math.sin(time * 19.3 + phase * 1.71) * 0.06;
  const faultSignal =
    Math.sin(time * 1.37 + phase * 0.73)
    + Math.sin(time * 3.91 + phase * 1.83) * 0.62
    + Math.sin(time * 7.13 + phase * 0.41) * 0.38;
  const brownout = THREE.MathUtils.smoothstep(faultSignal, 1.05, 1.72);
  return THREE.MathUtils.clamp(flutter * (1 - brownout * 0.94), 0.035, 1);
}

/** Shared controller for the red, failing practical lights in Zombies maps. */
export class CreepyAreaLights {
  private readonly fixtures: CreepyAreaLight[] = [];
  private time = 0;

  add(
    light: THREE.PointLight,
    bulbMaterial: THREE.MeshBasicMaterial,
    phase = this.fixtures.length * 2.417,
  ): void {
    light.color.setHex(CREEPY_AREA_LIGHT_COLOR);
    light.userData.mapRole = 'area-light';
    bulbMaterial.color.copy(BULB_LIT_COLOR);
    this.fixtures.push({
      light,
      bulbMaterial,
      baseIntensity: light.intensity,
      phase,
    });
  }

  update(dt: number): void {
    this.time += Math.max(0, dt);
    for (const fixture of this.fixtures) {
      const level = creepyLightLevel(this.time, fixture.phase);
      fixture.light.intensity = fixture.baseIntensity * level;
      fixture.bulbMaterial.color.copy(BULB_DARK_COLOR).lerp(BULB_LIT_COLOR, level);
    }
  }
}
