import * as THREE from 'three';
import type { DeviceProfile } from '../core/DeviceProfile';
import type { ShootingRange } from '../range/ShootingRange';

const FOG_COLOR = 0x0b1018;
const FOG_DENSITY = 0.016;
const MOON_COLOR = 0x93b0dd;
const SODIUM_COLOR = 0xff9540;

interface FlickeringLight {
  light: THREE.PointLight;
  base: number;
  seed: number;
  /** 0 = steady, 1 = fully unreliable; negative = slow pulse. */
  instability: number;
}

function makeNightSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#02040a');
  gradient.addColorStop(0.5, '#0a1220');
  gradient.addColorStop(0.78, '#12202c');
  gradient.addColorStop(1, '#16262f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Sparse star field on a small tileable canvas; drawn once at mode start. */
function makeStarsTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.clearRect(0, 0, 512, 512);
  for (let i = 0; i < 220; i++) {
    const alpha = 0.25 + Math.random() * 0.75;
    const size = Math.random() < 0.92 ? 1 : 2;
    ctx.fillStyle = `rgba(214,228,248,${alpha.toFixed(2)})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Zombies-mode atmosphere: converts the sunny range into a moonlit,
 * fog-drenched night scene. The range geometry is never touched — the sun
 * directional is restyled into moonlight (no extra shadow-casting light),
 * and a few practical fixtures (sodium floods, a failing tube, an emergency
 * beacon) add warm/cold pools of light. Dust motes drift through the air.
 * Shooting Range mode never sees any of this: a mode owns its environment.
 */
export class NightEnvironment {
  private readonly group = new THREE.Group();
  private readonly flickering: FlickeringLight[] = [];
  private readonly dust: THREE.Points;
  private readonly dustBase: Float32Array;
  private readonly dustCount: number;
  private time = 0;

  constructor(
    scene: THREE.Scene,
    range: ShootingRange,
    setExposure: (exposure: number) => void,
    profile: DeviceProfile,
  ) {
    // --- Sky, fog, exposure ---
    scene.background = makeNightSkyTexture();
    scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
    scene.environmentIntensity = profile.useReducedEffects ? 0.1 : 0.14;
    setExposure(profile.useReducedEffects ? 0.92 : 0.88);

    // Stars: a far cylinder band, unaffected by fog.
    const stars = new THREE.Mesh(
      new THREE.CylinderGeometry(330, 330, 190, 24, 1, true),
      new THREE.MeshBasicMaterial({
        map: makeStarsTexture(),
        transparent: true,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    stars.position.set(0, 70, -60);
    this.group.add(stars);

    // A pale moon disc aligned with the moonlight direction.
    const moon = new THREE.Mesh(
      new THREE.CircleGeometry(9, 24),
      new THREE.MeshBasicMaterial({ color: 0xdde8f8, fog: false }),
    );
    moon.position.set(-95, 130, -215);
    moon.lookAt(0, 1.7, 4);
    this.group.add(moon);

    // --- Sun → moonlight (reuses the existing shadow-casting light) ---
    const moonlight = range.sun;
    moonlight.color.setHex(MOON_COLOR);
    moonlight.intensity = profile.useReducedEffects ? 0.42 : 0.55;
    moonlight.position.set(-42, 62, -40);
    moonlight.target.position.set(0, 0, -30);

    range.hemisphere.color.setHex(0x223448);
    range.hemisphere.groundColor.setHex(0x0a0c0e);
    range.hemisphere.intensity = 0.32;

    // --- Practical fixtures ---
    // Warm sodium floods under the roof, washing the firing line in amber.
    this.addFixture(-7.4, 2.82, 4.2, SODIUM_COLOR, 15, 19, 0.12);
    this.addFixture(7.4, 2.82, 4.2, SODIUM_COLOR, 15, 19, 0.12);
    // A failing cold tube on the back wall: the one unreliable light.
    this.addFixture(0, 2.25, 8.45, 0xbfd8ff, 5, 11, 0.8);
    // Red emergency beacon in the dark left corner; slow breathing pulse.
    this.addFixture(-8.0, 2.0, 8.5, 0xff2a18, 3.2, 8, -1);

    // --- Dust motes drifting through the light shafts ---
    this.dustCount = profile.useReducedEffects ? 60 : 140;
    this.dustBase = new Float32Array(this.dustCount * 3);
    const positions = new Float32Array(this.dustCount * 3);
    for (let i = 0; i < this.dustCount; i++) {
      this.dustBase[i * 3] = -12 + Math.random() * 24;
      this.dustBase[i * 3 + 1] = 0.25 + Math.random() * 3.6;
      this.dustBase[i * 3 + 2] = -38 + Math.random() * 46;
    }
    positions.set(this.dustBase);
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.dust = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        color: 0x93a7c4,
        size: 0.035,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    this.dust.frustumCulled = false;
    this.group.add(this.dust);

    scene.add(this.group);
  }

  /** Small emissive bulb + point light; instability < 0 means slow pulse. */
  private addFixture(
    x: number,
    y: number,
    z: number,
    color: number,
    intensity: number,
    distance: number,
    instability: number,
  ): void {
    const light = new THREE.PointLight(color, intensity, distance, 1.8);
    light.position.set(x, y, z);
    const bulbMaterial = new THREE.MeshBasicMaterial({ color, fog: false });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), bulbMaterial);
    bulb.position.set(x, y, z);
    this.group.add(light, bulb);
    this.flickering.push({
      light,
      base: intensity,
      seed: Math.random() * 100,
      instability,
    });
  }

  update(dt: number): void {
    this.time += dt;

    for (const f of this.flickering) {
      if (f.instability < 0) {
        // Emergency beacon: slow breathing pulse.
        const pulse = 0.6 + 0.4 * Math.sin(this.time * 2.1 + f.seed);
        f.light.intensity = f.base * pulse;
        continue;
      }
      // Mains hum: mostly steady with small wavering; the unstable tube
      // occasionally drops out for a beat. Subtle, never a strobe.
      const waver =
        Math.sin(this.time * 13 + f.seed) * 0.5 + Math.sin(this.time * 31 + f.seed * 2) * 0.5;
      let level = 1 - f.instability * 0.16 * (0.5 + 0.5 * waver);
      if (f.instability > 0.5 && Math.sin(this.time * 1.7 + f.seed) > 0.985) level *= 0.25;
      f.light.intensity = f.base * level;
    }

    // Dust drift: slow vertical bob and a light horizontal push.
    const positions = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.dustCount; i++) {
      const phase = i * 1.618;
      positions.setY(i, this.dustBase[i * 3 + 1] + Math.sin(this.time * 0.35 + phase) * 0.35);
      positions.setX(
        i,
        this.dustBase[i * 3] + Math.sin(this.time * 0.12 + phase * 2) * 0.6,
      );
    }
    positions.needsUpdate = true;
  }
}
