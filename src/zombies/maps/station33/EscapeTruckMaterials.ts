import * as THREE from 'three';
import type { Station33Materials } from '../Station33Materials';

/**
 * The evacuation truck's surfaces, kept few because every one is a draw
 * call on the sprung body: the station's olive enamel, rubber, snow and red
 * enamel shared as they are, plus the truck's own road grime, dark steel,
 * see-through cab glass, cab trim, lit kung windows and instrument dials,
 * built once per arena. The cab trim and the kung windows carry a dim red
 * emergency glow that `lightTruckCabin` raises with the truck's lamps.
 */
export interface EscapeTruckMaterials {
  readonly paint: THREE.MeshStandardMaterial;
  /** Olive enamel caked with road grime, slush and rust: arches, sills, lower flanks, exhaust and springs. Both faces render. */
  readonly grime: THREE.MeshStandardMaterial;
  /** Black-painted and bare dark steel: frame, bumper, steps, hinges, handles, bezels, levers. */
  readonly darkSteel: THREE.MeshStandardMaterial;
  /** Tyres and rims, black vinyl seats, seals and cables. */
  readonly rubber: THREE.MeshStandardMaterial;
  /** Thin, slightly tinted glass of the cab and mirrors: the interior shows through, the night reflects on it. */
  readonly glass: THREE.MeshStandardMaterial;
  /** The box body's small windows, red with the emergency lamps of the survivors inside once lit. */
  readonly kungWindow: THREE.MeshStandardMaterial;
  /** The cab's painted trim: dashboard, engine cover, door cards, roof liner. */
  readonly cabin: THREE.MeshStandardMaterial;
  /** Analog dial faces, dark until the panel lamps light them. */
  readonly gaugeFace: THREE.MeshBasicMaterial;
  /** Snow on the roofs, and the whitewashed panels behind the red crosses. */
  readonly snow: THREE.MeshStandardMaterial;
  readonly redEnamel: THREE.MeshStandardMaterial;
}

/** Red emergency light at full strength: a faint wash on the cab trim, the kung's windows aglow. */
const CABIN_GLOW = { trim: 0.16, kungWindow: 0.75 } as const;
const EMERGENCY_RED = new THREE.Color(0xff2a14);
const GAUGE_DARK = new THREE.Color(0x1a1c18);
const GAUGE_LIT = new THREE.Color(0xd9ffcf);
const DIAL_SIZE = 64;

export function createEscapeTruckMaterials(station: Station33Materials): EscapeTruckMaterials {
  const grime = station.paintedSteel.clone();
  grime.name = 'truck_grime';
  grime.color.set(0x8f7f68);
  grime.roughness = 1;
  grime.metalness = 0.15;
  grime.side = THREE.DoubleSide;
  const cabin = station.paintedSteel.clone();
  cabin.name = 'truck_cabin';
  cabin.color.set(0x858c7e);
  cabin.metalness = 0.2;
  cabin.emissive.copy(EMERGENCY_RED);
  cabin.emissiveIntensity = 0;
  return {
    paint: station.paintedSteel,
    grime,
    darkSteel: new THREE.MeshStandardMaterial({ name: 'truck_dark_steel', color: 0x202326, roughness: 0.5, metalness: 0.6 }),
    rubber: station.rubber,
    glass: new THREE.MeshStandardMaterial({
      name: 'truck_glass',
      color: 0x22302f,
      roughness: 0.04,
      metalness: 0.1,
      transparent: true,
      opacity: 0.3,
      envMapIntensity: 1.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    kungWindow: new THREE.MeshStandardMaterial({
      name: 'truck_kung_window', color: 0x0c1312, roughness: 0.08, metalness: 0.3, emissive: EMERGENCY_RED, emissiveIntensity: 0,
    }),
    cabin,
    gaugeFace: new THREE.MeshBasicMaterial({ name: 'truck_gauge_face', map: makeGaugeDialTexture(), color: GAUGE_DARK.clone() }),
    snow: station.snow,
    redEnamel: station.redEnamel,
  };
}

/** Sets the cabin's red emergency glow and the dial lamps to `level` (0 dark, 1 full); no allocation. */
export function lightTruckCabin(materials: EscapeTruckMaterials, level: number): void {
  materials.cabin.emissiveIntensity = CABIN_GLOW.trim * level;
  materials.kungWindow.emissiveIntensity = CABIN_GLOW.kungWindow * level;
  materials.gaugeFace.color.lerpColors(GAUGE_DARK, GAUGE_LIT, level);
}

/**
 * An analog dial (64 px): a dark face, white graduations over a 270° sweep
 * with every fifth one long, a red band at the top of the scale and a hub.
 * The needles are geometry, so one face serves every instrument.
 */
export function makeGaugeDialTexture(): THREE.DataTexture {
  const data = new Uint8Array(DIAL_SIZE * DIAL_SIZE * 4);
  const sweep = Math.PI * 1.5;
  const start = Math.PI * 1.25;
  const ticks = 20;
  for (let y = 0; y < DIAL_SIZE; y++) {
    for (let x = 0; x < DIAL_SIZE; x++) {
      const u = (x + 0.5) / (DIAL_SIZE / 2) - 1;
      const v = (y + 0.5) / (DIAL_SIZE / 2) - 1;
      const radius = Math.hypot(u, v);
      // Clockwise from the lower left, through the top, to the lower right.
      const along = ((start - Math.atan2(v, u)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) / sweep;
      const onScale = along <= 1;
      const tick = Math.abs(along * ticks - Math.round(along * ticks));
      const major = Math.round(along * ticks) % 5 === 0;
      let rgb: readonly [number, number, number] = [16, 18, 15];
      if (onScale && tick < (major ? 0.16 : 0.1) && radius > (major ? 0.62 : 0.72) && radius < 0.88) rgb = [214, 222, 202];
      else if (onScale && along > 0.8 && radius > 0.84 && radius < 0.92) rgb = [190, 38, 26];
      else if (radius < 0.1) rgb = [120, 124, 116];
      const offset = (y * DIAL_SIZE + x) * 4;
      data[offset] = rgb[0];
      data[offset + 1] = rgb[1];
      data[offset + 2] = rgb[2];
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, DIAL_SIZE, DIAL_SIZE, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
