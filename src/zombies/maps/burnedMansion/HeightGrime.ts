import * as THREE from 'three';

/** Darkening that ramps smoothly from none at `fromY` to `darkness` at `toY` (world metres, either order). */
export interface HeightGrimeBand {
  readonly fromY: number;
  readonly toY: number;
  readonly darkness: number;
}

/**
 * Darkens a material by world height: smoke banked under a ceiling or damp
 * rising from a floor. One shader variant serves every band (the band is a
 * uniform), and only the base colour changes, so lighting stays physical.
 * Not for instanced meshes: the height ignores the instance matrix.
 */
export function addHeightGrime(material: THREE.MeshStandardMaterial, band: HeightGrimeBand): void {
  const uniform = { value: new THREE.Vector3(band.fromY, band.toY, band.darkness) };
  material.userData.heightGrime = band;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.grimeBand = uniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGrimeY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrimeY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 grimeBand;\nvarying float vGrimeY;')
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n'
          + 'float grimeRamp = clamp((vGrimeY - grimeBand.x) / (grimeBand.y - grimeBand.x), 0.0, 1.0);\n'
          + 'diffuseColor.rgb *= 1.0 - grimeBand.z * grimeRamp * grimeRamp * (3.0 - 2.0 * grimeRamp);',
      );
  };
  material.customProgramCacheKey = () => 'mansion-height-grime';
}
