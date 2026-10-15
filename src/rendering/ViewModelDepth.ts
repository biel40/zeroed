import * as THREE from 'three';

/**
 * Near share of the depth range the first-person view model is squeezed into
 * (classic depth-range hack). The weapon, arms and knife then always win the
 * depth test against walls the player hugs, while keeping their own ordering,
 * the scene lights and fog — no second render pass. Only world geometry closer
 * than ~9 cm to the camera could still overlap, which player collision forbids.
 */
const VIEW_MODEL_DEPTH_RANGE = '0.1';

function compressDepth(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <project_vertex>',
    `#include <project_vertex>
    gl_Position.z = mix(-gl_Position.w, gl_Position.z, ${VIEW_MODEL_DEPTH_RANGE});`,
  );
}

/**
 * Draws every mesh under `root` in front of the world. Patches the materials
 * in place, so they must belong to the view model only: anything shared with
 * world objects (cached GLB materials) has to be cloned first. Cloned
 * materials do not inherit the patch.
 */
export function applyViewModelDepth(root: THREE.Object3D): void {
  root.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    for (const entry of Array.isArray(material) ? material : material ? [material] : []) {
      entry.onBeforeCompile = compressDepth;
    }
  });
}
