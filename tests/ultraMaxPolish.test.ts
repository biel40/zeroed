import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { describe, expect, it, vi } from 'vitest';
import { getDeviceProfile, QUALITY_LEVELS } from '../src/core/DeviceProfile';
import { PostProcessing } from '../src/rendering/PostProcessing';
import { applyEnvironmentSurfaceDetail, installSurfaceDetail, WEAPON_SURFACE_DETAIL } from '../src/rendering/SurfaceDetail';
import { addHeightGrime } from '../src/zombies/maps/burnedMansion/HeightGrime';

const DESKTOP = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  maxTouchPoints: 0, hardwareConcurrency: 32, deviceMemory: 32,
  matchMedia: () => ({ matches: false }),
};

function surface(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: new THREE.Texture(), normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture(),
  });
  material.userData.metersPerTile = 2.4;
  return material;
}

function shaderFor(material: THREE.MeshStandardMaterial): THREE.WebGLProgramParametersWithUniforms {
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <map_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>',
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, null as unknown as THREE.WebGLRenderer);
  return shader;
}

describe('Ultra Max environment detail', () => {
  it('leaves the existing materials untouched in every lower preset', () => {
    for (const quality of QUALITY_LEVELS.filter((level) => level !== 'ultraMax')) {
      const material = surface();
      const compile = material.onBeforeCompile;
      const version = material.version;
      const root = new THREE.Mesh(new THREE.BoxGeometry(), material);
      applyEnvironmentSurfaceDetail(root, getDeviceProfile(DESKTOP, quality).useAdvancedRendering);
      expect(material.onBeforeCompile).toBe(compile);
      expect(material.version).toBe(version);
      expect(material.userData.surfaceDetail).toBeUndefined();
    }
  });

  it('details baked opaque surfaces once, retaining maps, relief and existing height grime', () => {
    const material = surface();
    const maps = [material.map, material.normalMap, material.roughnessMap];
    addHeightGrime(material, { fromY: 1, toY: 3, darkness: 0.5 });
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), [material, material]));
    applyEnvironmentSurfaceDetail(root, true);
    const version = material.version;
    applyEnvironmentSurfaceDetail(root, true);
    expect(material.version).toBe(version);
    expect([material.map, material.normalMap, material.roughnessMap]).toEqual(maps);
    expect(material.customProgramCacheKey()).toContain('mansion-height-grime');
    const shader = shaderFor(material);
    expect(shader.uniforms.grimeBand).toBeDefined();
    expect(shader.uniforms.uSurfaceDetailNoise.value).toBeInstanceOf(THREE.Data3DTexture);
    expect(shader.fragmentShader).toContain('diffuseColor.rgb *= 1.0 - grimeBand.z');
    expect(shader.fragmentShader).toContain('#include <normal_fragment_maps>');
  });

  it('shares the existing bounded noise with weapons and excludes decals, unlit and untagged materials', () => {
    const baked = surface();
    const decal = surface();
    decal.transparent = true;
    const plain = new THREE.MeshStandardMaterial();
    const glow = new THREE.MeshBasicMaterial();
    const root = new THREE.Group();
    for (const material of [baked, decal, plain, glow]) root.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
    applyEnvironmentSurfaceDetail(root, true);
    for (const material of [decal, plain, glow]) expect(material.userData.surfaceDetail).toBeUndefined();
    const weapon = new THREE.MeshStandardMaterial();
    installSurfaceDetail(weapon, WEAPON_SURFACE_DETAIL);
    const environmentShader = shaderFor(baked);
    expect(environmentShader.uniforms.uSurfaceDetailNoise.value).toBe(shaderFor(weapon).uniforms.uSurfaceDetailNoise.value);
    const noise = environmentShader.uniforms.uSurfaceDetailNoise.value as THREE.Data3DTexture;
    expect(noise.image.data?.byteLength).toBeLessThanOrEqual(128 * 1024);
  });
});

describe('Ultra Max post-processing lifecycle', () => {
  it.each([true, false])('keeps bloom reachable within the render target range (HDR supported=%s)', (hdr) => {
    const renderer = {
      getSize: (out: THREE.Vector2): THREE.Vector2 => out.set(640, 360),
      getPixelRatio: (): number => 1,
      extensions: { has: (): boolean => hdr },
      info: { autoReset: true },
    } as unknown as THREE.WebGLRenderer;
    const processing = new PostProcessing(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), { film: true, occlusion: false });
    const composer = (processing as unknown as { composer: EffectComposer }).composer;
    const bloom = composer.passes.find((pass) => pass instanceof UnrealBloomPass) as UnrealBloomPass;
    if (hdr) {
      expect(processing.sceneTarget.texture.type).toBe(THREE.HalfFloatType);
      expect(bloom.threshold).toBeGreaterThan(1);
    } else {
      expect(processing.sceneTarget.texture.type).toBe(THREE.UnsignedByteType);
      expect(bloom.threshold).toBeLessThan(1);
      expect(bloom.threshold).toBeGreaterThan(0.85);
    }
    processing.dispose();
  });

  it.each([true, false])('releases bloom targets, output material and composer buffers (film=%s)', (film) => {
    const renderer = {
      getSize: (out: THREE.Vector2): THREE.Vector2 => out.set(640, 360),
      getPixelRatio: (): number => 1,
      extensions: { has: (): boolean => true },
      info: { autoReset: true },
    } as unknown as THREE.WebGLRenderer;
    const processing = new PostProcessing(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), { film, occlusion: false });
    // Exercise the real Three.js passes without a WebGL context; their GPU resources emit dispose events.
    const composer = (processing as unknown as { composer: {
      passes: Array<{
        dispose: () => void;
        renderTargetBright?: THREE.WebGLRenderTarget;
        materialHighPassFilter?: THREE.ShaderMaterial;
      }>;
      renderTarget1: THREE.WebGLRenderTarget;
      renderTarget2: THREE.WebGLRenderTarget;
    } }).composer;
    const disposals = composer.passes.map((pass) => vi.spyOn(pass, 'dispose'));
    const bloomTarget = composer.passes.find((pass) => pass.renderTargetBright)?.renderTargetBright;
    const released = vi.fn();
    bloomTarget?.addEventListener('dispose', released);
    const brightMaterial = composer.passes.find((pass) => pass.materialHighPassFilter)?.materialHighPassFilter;
    const brightReleased = vi.fn();
    brightMaterial?.addEventListener('dispose', brightReleased);
    const buffers = [composer.renderTarget1, composer.renderTarget2].map((target) => vi.spyOn(target, 'dispose'));
    processing.dispose();
    for (const dispose of [...disposals, ...buffers]) expect(dispose).toHaveBeenCalledOnce();
    expect(released).toHaveBeenCalledOnce();
    expect(brightReleased).toHaveBeenCalledOnce();
  });
});
