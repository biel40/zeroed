import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getDeviceProfile, isQualityLevel, QUALITY_LEVELS } from '../src/core/DeviceProfile';
import { CUBE_FACE_COUNT, ReflectionProbeSchedule } from '../src/rendering/ReflectionProbeSchedule';
import {
  applySurfaceDetail,
  buildDetailNoise,
  installSurfaceDetail,
  WEAPON_SURFACE_DETAIL,
  ZOMBIE_SURFACE_DETAIL,
} from '../src/rendering/SurfaceDetail';
import { seededRandom } from '../src/weapons/ProceduralTextures';
import { POINT_LIGHT_BUDGET } from '../src/zombies/maps/shared/PointLightBudget';
import { dressZombieSources } from '../src/zombies/skins/ZombieSkinBuilder';

const DESKTOP = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  maxTouchPoints: 0,
  hardwareConcurrency: 32,
  deviceMemory: 32,
  matchMedia: () => ({ matches: false }),
};

describe('Ultra Max quality tier', () => {
  it('is a selectable level that no device is assigned automatically', () => {
    expect(isQualityLevel('ultraMax')).toBe(true);
    expect(getDeviceProfile(DESKTOP).quality).toBe('high');
    expect(getDeviceProfile(DESKTOP).useAdvancedRendering).toBe(false);
  });

  it('turns advanced rendering on only for Ultra Max', () => {
    for (const quality of QUALITY_LEVELS) {
      expect(getDeviceProfile(DESKTOP, quality).useAdvancedRendering).toBe(quality === 'ultraMax');
    }
    const ultra = getDeviceProfile(DESKTOP, 'ultraMax');
    const high = getDeviceProfile(DESKTOP, 'high');
    expect(ultra.useReducedEffects).toBe(false);
    expect(ultra.anisotropyLimit).toBeGreaterThan(high.anisotropyLimit);
    expect(ultra.pixelRatioLimit).toBeGreaterThanOrEqual(high.pixelRatioLimit);
    expect(POINT_LIGHT_BUDGET.ultraMax).toBeGreaterThan(POINT_LIGHT_BUDGET.high);
  });
});

describe('Reflection probe schedule', () => {
  const DT = 1 / 60;

  it('renders one face per frame, then rests until the next refresh', () => {
    const schedule = new ReflectionProbeSchedule(0.5);
    const firstPass = Array.from({ length: CUBE_FACE_COUNT }, () => schedule.advance(DT));
    expect(firstPass).toEqual([0, 1, 2, 3, 4, 5]);

    let restFrames = 0;
    while (schedule.advance(DT) === null) restFrames++;
    // 0.5 s at 60 fps, give or take the frame that crosses the threshold.
    expect(restFrames).toBeGreaterThanOrEqual(28);
    expect(restFrames).toBeLessThanOrEqual(30);
    // The frame that ended the rest already rendered face 0.
    expect(schedule.advance(DT)).toBe(1);
  });

  it('never skips or repeats a face inside a pass, whatever the frame time', () => {
    const schedule = new ReflectionProbeSchedule(0.2);
    const faces: number[] = [];
    for (let frame = 0; frame < 400; frame++) {
      const face = schedule.advance(frame % 3 === 0 ? 0.05 : 0.004);
      if (face !== null) faces.push(face);
    }
    expect(faces.length).toBeGreaterThan(CUBE_FACE_COUNT * 3);
    faces.forEach((face, index) => expect(face).toBe(index % CUBE_FACE_COUNT));
  });

  it('starts a fresh pass at once after a reset', () => {
    const schedule = new ReflectionProbeSchedule(10);
    for (let frame = 0; frame < 9; frame++) schedule.advance(DT);
    schedule.reset();
    expect(schedule.advance(DT)).toBe(0);
  });
});

describe('Procedural surface detail', () => {
  const SIZE = 16;

  it('builds the same noise from the same seed, using the whole byte range', () => {
    const first = buildDetailNoise(SIZE, seededRandom(7));
    const second = buildDetailNoise(SIZE, seededRandom(7));
    const other = buildDetailNoise(SIZE, seededRandom(8));
    expect(first).toHaveLength(SIZE ** 3 * 4);
    expect(first).toEqual(second);
    expect(first).not.toEqual(other);

    let minHeight = 255;
    let maxHeight = 0;
    for (let texel = 0; texel < SIZE ** 3; texel++) {
      minHeight = Math.min(minHeight, first[texel * 4 + 3]);
      maxHeight = Math.max(maxHeight, first[texel * 4 + 3]);
    }
    expect(minHeight).toBe(0);
    expect(maxHeight).toBe(255);
  });

  it('stores a gradient that matches the height and wraps across the tile edge', () => {
    const noise = buildDetailNoise(SIZE, seededRandom(21));
    const texel = (x: number, y: number, z: number): number => (((z + SIZE) % SIZE) * SIZE + ((y + SIZE) % SIZE)) * SIZE + ((x + SIZE) % SIZE);
    const height = (x: number, y: number, z: number): number => noise[texel(x, y, z) * 4 + 3];
    let agreeing = 0;
    let steep = 0;
    // The x = 0 column differentiates across the seam, so a tile that did not repeat would disagree here.
    for (let z = 0; z < SIZE; z++) {
      for (let y = 0; y < SIZE; y++) {
        const slope = height(1, y, z) - height(-1, y, z);
        if (Math.abs(slope) < 24) continue;
        steep++;
        const stored = noise[texel(0, y, z) * 4] - 127.5;
        if (Math.sign(stored) === Math.sign(slope)) agreeing++;
      }
    }
    expect(steep).toBeGreaterThan(10);
    expect(agreeing).toBe(steep);
  });

  it('chains onto earlier shader hooks and their cache key without installing twice', () => {
    const material = new THREE.MeshStandardMaterial();
    const calls: string[] = [];
    material.onBeforeCompile = () => { calls.push('earlier'); };
    material.customProgramCacheKey = () => 'earlier-key';

    installSurfaceDetail(material, ZOMBIE_SURFACE_DETAIL);
    const installed = material.onBeforeCompile;
    installSurfaceDetail(material, ZOMBIE_SURFACE_DETAIL);
    expect(material.onBeforeCompile).toBe(installed);
    expect(material.customProgramCacheKey()).toContain('earlier-key');
    expect(material.customProgramCacheKey()).not.toBe('earlier-key');

    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <common>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>',
    };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null as unknown as THREE.WebGLRenderer);
    expect(calls).toEqual(['earlier']);
    expect(shader.uniforms.uSurfaceDetailNoise.value).toBeInstanceOf(THREE.Data3DTexture);
    expect(shader.vertexShader).toContain('vSurfaceDetailPosition = position;');
    for (const chunk of ['#include <roughnessmap_fragment>', '#include <normal_fragment_maps>']) {
      expect(shader.fragmentShader).toContain(chunk);
    }
    expect(shader.fragmentShader).toContain('roughnessFactor');
  });

  it('keeps unlit and glowing materials out of a detailed model', () => {
    const steel = new THREE.MeshStandardMaterial();
    const glow = new THREE.MeshBasicMaterial();
    const glowHook = glow.onBeforeCompile;
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), steel), new THREE.Mesh(new THREE.BoxGeometry(), glow));

    applySurfaceDetail(root, WEAPON_SURFACE_DETAIL);
    expect(steel.customProgramCacheKey()).toContain('surface-detail');
    expect(glow.onBeforeCompile).toBe(glowHook);
  });
});

describe('Zombie horde look', () => {
  it('marks every loaded model for surface detail and leaves missing ones alone', () => {
    const walker = { scene: new THREE.Group(), clips: [] };
    const plain = { walker, brute: null };
    expect(dressZombieSources(plain)).toBe(plain);

    const dressed = dressZombieSources(plain, { surfaceDetail: true });
    expect(dressed.brute).toBeNull();
    expect(dressed.walker).toMatchObject({ scene: walker.scene, surfaceDetail: true });
  });
});
