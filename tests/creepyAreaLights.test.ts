import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CREEPY_AREA_LIGHT_COLOR,
  CreepyAreaLights,
  creepyLightLevel,
} from '../src/rendering/CreepyAreaLights';

describe('CreepyAreaLights', () => {
  it('creates an irregular pattern with deep brownouts instead of a steady pulse', () => {
    const samples = Array.from({ length: 600 }, (_, index) => creepyLightLevel(index / 60, 1.7));

    expect(Math.min(...samples)).toBeLessThan(0.2);
    expect(Math.max(...samples)).toBeGreaterThan(0.85);
    expect(new Set(samples.map((sample) => sample.toFixed(3))).size).toBeGreaterThan(100);
  });

  it('turns registered fixtures red and flickers their light and visible bulb together', () => {
    const controller = new CreepyAreaLights();
    const light = new THREE.PointLight(0xffffff, 4, 8, 1.8);
    const bulb = new THREE.MeshBasicMaterial({ color: 0xffffff });
    controller.add(light, bulb, 0.8);
    const initialBulb = bulb.color.getHex();

    controller.update(0.37);
    const firstIntensity = light.intensity;
    const firstBulb = bulb.color.getHex();
    controller.update(0.41);

    expect(light.color.getHex()).toBe(CREEPY_AREA_LIGHT_COLOR);
    expect(light.userData.mapRole).toBe('area-light');
    expect(light.intensity).not.toBe(firstIntensity);
    expect(bulb.color.getHex()).not.toBe(firstBulb);
    expect(firstBulb).not.toBe(initialBulb);
  });
});
