import * as THREE from 'three';
import type { QualityLevel } from '../../../core/DeviceProfile';
import { LA_SEU_MOON, type LaSeuLightSite } from '../LaSeuConfig';
import { POINT_LIGHT_BUDGET } from '../shared/PointLightBudget';

/** Seconds a real light takes to die at one site and to come up at the next. */
const FADE_SECONDS = 0.45;
/** Seconds between two looks at which sites are nearest. */
const RETARGET_INTERVAL = 0.25;
/** A site already burning counts as this much nearer (squared distance), so lights do not swap back and forth. */
const HELD_BIAS = 0.7;
const DECAY = 1.8;

/**
 * La Seu's real lights. The map has many more places a light could burn
 * than a device can afford, so a fixed pool (the quality budget, never
 * resized: a different count would recompile every shader) follows the
 * player: each pooled light sits on one of the nearest sites and fades out
 * and back in when it moves to another. The moon is one unshadowed
 * directional light. Nothing allocates after construction.
 */
export class LaSeuLighting {
  private readonly lights: THREE.PointLight[] = [];
  /** Site each pooled light sits on. */
  private readonly siteOf: Int16Array;
  /** Fade of each pooled light, 0..1. */
  private readonly level: Float32Array;
  private readonly wanted: Uint8Array;
  private readonly held: Uint8Array;
  private readonly distance: Float32Array;
  private readonly home: THREE.Vector3;
  private time = 0;
  private untilRetarget = 0;

  public constructor(
    group: THREE.Group,
    quality: QualityLevel,
    reducedEffects: boolean,
    private readonly sites: ReadonlyArray<LaSeuLightSite>,
    home: THREE.Vector3Like,
  ) {
    this.home = new THREE.Vector3(home.x, home.y, home.z);
    const count = Math.min(POINT_LIGHT_BUDGET[quality], sites.length);
    this.siteOf = new Int16Array(count);
    this.level = new Float32Array(count);
    this.wanted = new Uint8Array(sites.length);
    this.held = new Uint8Array(sites.length);
    this.distance = new Float32Array(sites.length);
    for (let index = 0; index < count; index++) {
      const light = new THREE.PointLight(0xffffff, 0, 1, DECAY);
      light.name = `laseu-light-${index}`;
      this.lights.push(light);
      group.add(light);
    }

    const moon = new THREE.DirectionalLight(LA_SEU_MOON.color, reducedEffects ? LA_SEU_MOON.reducedIntensity : LA_SEU_MOON.intensity);
    moon.name = 'laseu-moonlight';
    const { x, y, z } = LA_SEU_MOON.direction;
    moon.position.set(-x * 60, -y * 60, -z * 60);
    group.add(moon, moon.target);
    this.reset();
  }

  /** Real lights alive: always the whole pool. */
  public get pointLightCount(): number {
    return this.lights.length;
  }

  /** Puts the pool on the sites nearest the player spawn, fully lit, as a run starts. */
  public reset(): void {
    this.time = 0;
    this.untilRetarget = 0;
    this.held.fill(0);
    this.chooseSites(this.home);
    let next = 0;
    for (let index = 0; index < this.lights.length; index++) {
      while (!this.wanted[next]) next++;
      this.place(index, next++);
      this.level[index] = 1;
    }
    this.applyIntensities();
  }

  public update(dt: number, observer?: THREE.Vector3): void {
    const step = Math.max(0, dt);
    this.time += step;
    this.untilRetarget -= step;
    if (this.untilRetarget <= 0) {
      this.untilRetarget = RETARGET_INTERVAL;
      this.chooseSites(observer ?? this.home);
    }
    const fade = step / FADE_SECONDS;
    for (let index = 0; index < this.lights.length; index++) {
      if (this.wanted[this.siteOf[index]]) {
        this.level[index] = Math.min(1, this.level[index] + fade);
        continue;
      }
      this.level[index] = Math.max(0, this.level[index] - fade);
      if (this.level[index] > 0) continue;
      const free = this.freeWantedSite();
      if (free >= 0) {
        this.held[this.siteOf[index]] = 0;
        this.place(index, free);
      }
    }
    this.applyIntensities();
  }

  /** Marks the pool's worth of sites nearest `observer`, favouring the ones already lit. */
  private chooseSites(observer: THREE.Vector3): void {
    for (let site = 0; site < this.sites.length; site++) {
      const { x, y, z } = this.sites[site];
      const squared = (x - observer.x) ** 2 + (y - observer.y) ** 2 + (z - observer.z) ** 2;
      this.distance[site] = this.held[site] ? squared * HELD_BIAS : squared;
    }
    this.wanted.fill(0);
    for (let pick = 0; pick < this.lights.length; pick++) {
      let nearest = -1;
      for (let site = 0; site < this.sites.length; site++) {
        if (!this.wanted[site] && (nearest < 0 || this.distance[site] < this.distance[nearest])) nearest = site;
      }
      this.wanted[nearest] = 1;
    }
  }

  private freeWantedSite(): number {
    for (let site = 0; site < this.sites.length; site++) {
      if (this.wanted[site] && !this.held[site]) return site;
    }
    return -1;
  }

  private place(index: number, site: number): void {
    const { x, y, z, color, distance } = this.sites[site];
    const light = this.lights[index];
    light.position.set(x, y, z);
    light.color.setHex(color);
    light.distance = distance;
    this.siteOf[index] = site;
    this.held[site] = 1;
  }

  private applyIntensities(): void {
    for (let index = 0; index < this.lights.length; index++) {
      const site = this.sites[this.siteOf[index]];
      // Two slow sines out of step per site: a flame that wavers, never strobes.
      const phase = this.siteOf[index] * 1.7;
      const waver = site.flicker ? 0.86 + 0.14 * Math.sin(this.time * 9.1 + phase) * Math.sin(this.time * 3.7 + phase * 2.3) : 1;
      this.lights[index].intensity = site.intensity * this.level[index] * waver;
    }
  }
}
