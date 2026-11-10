import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createFireParticles,
  fireFadeIn,
  fireHeatColor,
  fireParticleAge,
  firelightFlicker,
  type FireFootprint,
} from '../src/zombies/maps/shared/FireParticles';
import { seededRandom } from '../src/zombies/maps/shared/ProceduralNoise';

const LIFE = { min: 0.8, max: 1.4 } as const;

const SOURCES: ReadonlyArray<FireFootprint> = [
  { radius: 2.5, height: 6 },
  { radius: 1, height: 3 },
  { radius: 3, height: 4 },
];

describe('Fire particles', () => {
  it('shares the particles out by the size of each fire, every one inside its source', () => {
    const particles = createFireParticles(600, SOURCES, LIFE, seededRandom(5));
    expect(particles).toHaveLength(600);
    const counts = SOURCES.map((_, index) => particles.filter((particle) => particle.source === index).length);
    expect(counts[0]).toBeGreaterThan(counts[2]);
    expect(counts[2]).toBeGreaterThan(counts[1]);
    expect(counts[1]).toBeGreaterThan(0);
    for (const particle of particles) {
      const source = SOURCES[particle.source];
      expect(Math.hypot(particle.offsetX, particle.offsetZ)).toBeLessThanOrEqual(source.radius + 1e-9);
      expect(particle.life).toBeGreaterThanOrEqual(LIFE.min);
      expect(particle.life).toBeLessThanOrEqual(LIFE.max);
    }
  });

  it('draws the same particles from the same seed', () => {
    expect(createFireParticles(40, SOURCES, LIFE, seededRandom(11))).toEqual(createFireParticles(40, SOURCES, LIFE, seededRandom(11)));
  });

  it('cycles every particle through its life, from 0 up to just short of 1', () => {
    const [particle] = createFireParticles(1, SOURCES, LIFE, seededRandom(9));
    for (let time = 0; time < 10; time += 0.07) {
      const age = fireParticleAge(particle, time);
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(1);
    }
    expect(fireParticleAge(particle, particle.life * 3)).toBeCloseTo(fireParticleAge(particle, 0), 9);
  });

  it('burns white-hot at the root, through orange, out to nothing', () => {
    const color = new THREE.Color();
    const root = fireHeatColor(0, color).clone();
    expect(root.r).toBe(1);
    expect(root.g).toBeGreaterThan(0.8);
    const middle = fireHeatColor(0.5, color).clone();
    expect(middle.r).toBeGreaterThan(middle.g);
    expect(middle.g).toBeGreaterThan(middle.b);
    expect(fireHeatColor(1, color).getHex()).toBe(0x000000);
  });

  it('eases each particle in instead of popping it at full strength', () => {
    expect(fireFadeIn(0)).toBe(0);
    expect(fireFadeIn(0.06)).toBeCloseTo(0.5, 9);
    expect(fireFadeIn(0.5)).toBe(1);
  });

  it('flickers firelight within a fixed band, and phase keeps neighbouring fires apart', () => {
    let lowest = Infinity;
    let highest = -Infinity;
    for (let time = 0; time < 20; time += 0.013) {
      const flicker = firelightFlicker(time);
      lowest = Math.min(lowest, flicker);
      highest = Math.max(highest, flicker);
    }
    expect(lowest).toBeGreaterThanOrEqual(0.64);
    expect(highest).toBeLessThanOrEqual(1);
    expect(highest - lowest).toBeGreaterThan(0.2);
    expect(firelightFlicker(1.7, 0)).toBe(firelightFlicker(1.7, 0));
    expect(firelightFlicker(1.7, 2.1)).not.toBeCloseTo(firelightFlicker(1.7, 0), 3);
  });
});
