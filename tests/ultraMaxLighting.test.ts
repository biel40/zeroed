import * as THREE from 'three';
import { GTAOShader } from 'three/examples/jsm/shaders/GTAOShader.js';
import { describe, expect, it } from 'vitest';
import { advancedFeatures } from '../src/rendering/AdvancedRenderingFeatures';
import { maskViewModelDepth } from '../src/rendering/AmbientOcclusion';
import { LAMP_SHADOWS, LampShadows } from '../src/rendering/LampShadows';
import { reflectionGain } from '../src/rendering/ReflectionProbe';

const DT = 1 / 60;

function lamp(scene: THREE.Object3D, x: number, intensity = 8, reach = 12): THREE.PointLight {
  const light = new THREE.PointLight(0xffffff, intensity, reach);
  light.position.set(x, 3, 0);
  scene.add(light);
  return light;
}

function casters(lights: readonly THREE.PointLight[]): THREE.PointLight[] {
  return lights.filter((light) => light.castShadow);
}

describe('Lamp shadows', () => {
  it('lets the lamps nearest the observer cast, always the same number', () => {
    const scene = new THREE.Scene();
    const lights = [0, 10, 20, 30, 40].map((x) => lamp(scene, x));
    const shadows = new LampShadows(scene, new Set());
    const observer = new THREE.Vector3(1, 1.7, 0);

    shadows.update(DT, observer);
    expect(casters(lights)).toEqual([lights[0], lights[1]]);

    // A sprint: 3 m/s.
    for (let x = 1; x <= 40; x += 0.05) {
      shadows.update(DT, observer.set(x, 1.7, 0));
      expect(casters(lights)).toHaveLength(LAMP_SHADOWS.casters);
    }
    expect(casters(lights)).toEqual([lights[3], lights[4]]);
  });

  it('moves a fixed pool of shadow maps between lamps and hands each lamp its own shadow back', () => {
    const scene = new THREE.Scene();
    const lights = [0, 10, 20, 30].map((x) => lamp(scene, x));
    const own = lights.map((light) => light.shadow);
    const shadows = new LampShadows(scene, new Set());
    const pooled = new Set<object>();
    const observer = new THREE.Vector3();

    for (let x = 0; x <= 30; x += 0.05) {
      shadows.update(DT, observer.set(x, 1.7, 0));
      for (const light of casters(lights)) pooled.add(light.shadow);
    }
    expect(pooled.size).toBe(LAMP_SHADOWS.casters);
    for (const shadow of pooled) expect(own).not.toContain(shadow);
    expect(lights[0].castShadow).toBe(false);
    expect(lights[0].shadow).toBe(own[0]);
  });

  it('does not swap casters while the observer hovers between two lamps', () => {
    const scene = new THREE.Scene();
    const lights = [0, 10, 20].map((x) => lamp(scene, x));
    const shadows = new LampShadows(scene, new Set());
    const observer = new THREE.Vector3(9, 1.7, 0);
    shadows.update(DT, observer);
    const settled = casters(lights);

    // Lamps 0 and 20 are equally far at x = 10: a step either side must not flip them.
    for (let frame = 0; frame < 240; frame++) {
      shadows.update(DT, observer.set(frame % 2 === 0 ? 9.6 : 10.4, 1.7, 0));
      expect(casters(lights)).toEqual(settled);
    }
  });

  it('skips hidden lamps, excluded lights, small glows and brief flashes', () => {
    const scene = new THREE.Scene();
    const hiddenRoom = new THREE.Group();
    hiddenRoom.visible = false;
    scene.add(hiddenRoom);
    const hidden = lamp(hiddenRoom, 0.5);
    const muzzle = lamp(scene, 0.2);
    const glow = lamp(scene, 0.4, 8, 2.5);
    const flash = lamp(scene, 0.6, 0);
    const lights = [lamp(scene, 6), lamp(scene, 12)];
    const shadows = new LampShadows(scene, new Set([muzzle]));
    const observer = new THREE.Vector3(0, 1.7, 0);

    for (let frame = 0; frame < 120; frame++) {
      // A lightning strike or an energy burst: bright for a few frames only.
      flash.intensity = frame % 40 >= 20 && frame % 40 < 26 ? 40 : 0;
      shadows.update(DT, observer);
      expect(casters(lights)).toEqual(lights);
      for (const light of [hidden, muzzle, glow, flash]) expect(light.castShadow).toBe(false);
    }
  });

  it('refreshes one shadow map per frame, in turn', () => {
    const scene = new THREE.Scene();
    const lights = [0, 10].map((x) => lamp(scene, x));
    const shadows = new LampShadows(scene, new Set());
    const observer = new THREE.Vector3(5, 1.7, 0);
    shadows.update(DT, observer);

    const refreshed: number[] = [];
    for (let frame = 0; frame < 6; frame++) {
      for (const light of lights) light.shadow.needsUpdate = false;
      shadows.update(DT, observer);
      const due = lights.filter((light) => light.shadow.needsUpdate);
      expect(due).toHaveLength(1);
      refreshed.push(lights.indexOf(due[0]));
    }
    expect(new Set(refreshed).size).toBe(2);
    expect(refreshed[0]).not.toBe(refreshed[1]);
    for (const light of lights) expect(light.shadow.autoUpdate).toBe(false);
  });

  it('returns every lamp to its own shadow when disposed', () => {
    const scene = new THREE.Scene();
    const lights = [0, 10, 20].map((x) => lamp(scene, x));
    const own = lights.map((light) => light.shadow);
    const shadows = new LampShadows(scene, new Set());
    shadows.update(DT, new THREE.Vector3());
    shadows.dispose();
    expect(casters(lights)).toEqual([]);
    expect(lights.map((light) => light.shadow)).toEqual(own);
  });
});

describe('Ambient occlusion', () => {
  it('finds the depth read of the stock shader and masks the view model out of it', () => {
    const patched = maskViewModelDepth(GTAOShader.fragmentShader);
    expect(patched).not.toBe(GTAOShader.fragmentShader);
    expect(patched).toContain('float getDepth(const vec2 uv)');
    expect(patched).toMatch(/depth < \d\.\d+ \? 1\.0 : depth/);
  });
});

describe('Reflection gain', () => {
  it('keeps the reflected room at the same strength whatever share of the environment a map uses', () => {
    expect(reflectionGain(0.8, 0.4)).toBeCloseTo(2);
    expect(reflectionGain(0.8, 0.1)).toBeCloseTo(8);
  });

  it('never dims the capture and stays bounded when a map switches the environment off', () => {
    expect(reflectionGain(0.8, 2)).toBe(1);
    expect(Number.isFinite(reflectionGain(0.8, 0))).toBe(true);
    expect(reflectionGain(0.8, 0)).toBeLessThanOrEqual(16);
  });
});

describe('Advanced rendering switches', () => {
  it('turns everything on unless the address switches a feature off', () => {
    expect(advancedFeatures('')).toEqual({ shadows: true, occlusion: true, reflections: true, film: true });
    expect(advancedFeatures('?map=station33&gfx-off=shadows,film')).toEqual({
      shadows: false, occlusion: true, reflections: true, film: false,
    });
    expect(advancedFeatures('?gfx-off=unknown')).toEqual({ shadows: true, occlusion: true, reflections: true, film: true });
  });
});
