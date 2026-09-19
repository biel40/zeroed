import * as THREE from 'three';
import type { DeviceProfile } from '../core/DeviceProfile';
import type { OutdoorArena } from '../range/OutdoorArena';
import { CreepyAreaLights } from '../rendering/CreepyAreaLights';

const FOG_COLOR = 0x0b1018;
const FOG_DENSITY = 0.016;
const MOON_COLOR = 0x93b0dd;

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
 * Zombies-mode atmosphere: converts the sunny arena into a moonlit,
 * fog-drenched night scene. The arena geometry is never touched — the sun
 * directional is restyled into moonlight (no extra shadow-casting light),
 * and a few failing red practical fixtures add hostile, uneven pools of
 * light. Dust motes drift through the air.
 * Classic Zombies owns this treatment of the shared outdoor arena geometry.
 */
export class NightEnvironment {
  private readonly group = new THREE.Group();
  private readonly areaLights = new CreepyAreaLights();
  private readonly dust: THREE.Points;
  private readonly dustBase: Float32Array;
  private readonly dustCount: number;
  private time = 0;

  constructor(
    scene: THREE.Scene,
    arena: OutdoorArena,
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
    const moonlight = arena.sun;
    moonlight.color.setHex(MOON_COLOR);
    moonlight.intensity = profile.useReducedEffects ? 0.42 : 0.55;
    moonlight.position.set(-42, 62, -40);
    moonlight.target.position.set(0, 0, -30);

    arena.hemisphere.color.setHex(0x223448);
    arena.hemisphere.groundColor.setHex(0x0a0c0e);
    arena.hemisphere.intensity = 0.32;

    // --- Practical fixtures ---
    // Every zone light shares the same failing red electrical treatment, but
    // uses a different phase so the arena never flashes as one uniform strobe.
    this.addFixture(-7.4, 2.82, 4.2, 15, 19);
    this.addFixture(7.4, 2.82, 4.2, 15, 19);
    this.addFixture(0, 2.25, 8.45, 5, 11);
    this.addFixture(-8.0, 2.0, 8.5, 3.2, 8);

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

  /** Small visible bulb paired with one red, failing point light. */
  private addFixture(
    x: number,
    y: number,
    z: number,
    intensity: number,
    distance: number,
  ): void {
    const light = new THREE.PointLight(0xffffff, intensity, distance, 1.8);
    light.position.set(x, y, z);
    const bulbMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), bulbMaterial);
    bulb.position.set(x, y, z);
    bulb.userData.mapRole = 'area-light-bulb';
    this.group.add(light, bulb);
    this.areaLights.add(light, bulbMaterial);
  }

  update(dt: number): void {
    this.time += dt;
    this.areaLights.update(dt);

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
