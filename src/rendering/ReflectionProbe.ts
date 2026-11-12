import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CUBE_FACE_COUNT, ReflectionProbeSchedule } from './ReflectionProbeSchedule';

/** Tuning of the local reflections; every value is a look decision, not a contract. */
export const REFLECTION_PROBE = {
  /** Cube face size in pixels. 256 matches the stock environment, so swapping it in compiles nothing. */
  size: 256,
  /** Seconds between the end of one capture and the start of the next. */
  refreshSeconds: 0.5,
  /**
   * Strength of the captured room as reflections and bounced light, where 1
   * is physically plausible. Independent of how much studio fill a map uses.
   */
  localStrength: 0.8,
  /**
   * Share of the stock studio environment kept under the captured room. At 1
   * the ambient light every map was balanced with is intact and the room is
   * added on top; lower values trade that fill for purer local reflections.
   */
  stockShare: 1,
} as const;

const NEAR = 0.1;
const FAR = 120;
const STOCK_SIZE = 128;
const MAX_GAIN = 16;

/**
 * Factor the captured room is brightened by so that, once the map scales the
 * whole environment by `environmentIntensity`, it lands on `localStrength`.
 * Never below 1 (the capture is only ever amplified) and bounded when a map
 * turns its environment off.
 */
export function reflectionGain(localStrength: number, environmentIntensity: number): number {
  return THREE.MathUtils.clamp(localStrength / Math.max(environmentIntensity, 1e-3), 1, MAX_GAIN);
}

const BACKDROP_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/** With (destination colour, one) blending this multiplies what is already drawn by `uGain`. */
const GAIN_FRAGMENT = /* glsl */ `
uniform float uGain;
void main() {
  gl_FragColor = vec4(vec3(uGain - 1.0), 0.0);
}
`;

const BACKDROP_FRAGMENT = /* glsl */ `
uniform samplerCube uStock;
uniform float uShare;
varying vec3 vDirection;
void main() {
  gl_FragColor = vec4(textureCube(uStock, vDirection).rgb * uShare, 1.0);
}
`;

/**
 * Local reflections: captures the scene around the observer into a cube map
 * and publishes it as `scene.environment`, so metal, glass and wet surfaces
 * mirror the real room (its lamps, fire and walls) and bounce its light.
 * The stock studio environment is added over every capture: the maps are
 * dark interiors whose ambient light comes from it, and a capture alone
 * would leave them almost black. `scene.environmentIntensity` stays owned by
 * the map; the captured room is amplified to cancel it (`reflectionGain`). The capture is time-sliced by `ReflectionProbeSchedule`; a
 * finished pass is published in one go.
 */
export class ReflectionProbe {
  private readonly target: THREE.WebGLCubeRenderTarget;
  private readonly camera: THREE.CubeCamera;
  private readonly stock: THREE.WebGLCubeRenderTarget;
  /** A box around the capture point that adds the stock environment to a rendered face. */
  private readonly backdrop: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
  /** The same box, drawn first: amplifies the captured room. */
  private readonly gain: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
  private readonly backdropScene = new THREE.Scene();
  private readonly schedule = new ReflectionProbeSchedule(REFLECTION_PROBE.refreshSeconds);
  private published = false;
  private readonly mutedIntensities: number[] = [];

  /**
   * @param hidden Left out of every capture: the first-person rig, which
   * would otherwise be mirrored as a floating weapon.
   * @param muted Lights switched off for every capture: a shot's flash caught
   * in one would keep lighting the room until the next capture.
   */
  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly hidden: THREE.Object3D,
    private readonly muted: readonly THREE.Light[],
    textureType: THREE.TextureDataType,
  ) {
    this.target = new THREE.WebGLCubeRenderTarget(REFLECTION_PROBE.size, { type: textureType, generateMipmaps: false });
    this.camera = new THREE.CubeCamera(NEAR, FAR, this.target);
    this.camera.coordinateSystem = renderer.coordinateSystem;
    this.camera.updateCoordinateSystem();

    this.stock = new THREE.WebGLCubeRenderTarget(STOCK_SIZE, { type: textureType, generateMipmaps: false });
    const studio = new RoomEnvironment();
    new THREE.CubeCamera(NEAR, FAR, this.stock).update(renderer, studio);
    studio.dispose();

    this.backdrop = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.ShaderMaterial({
      uniforms: { uStock: { value: this.stock.texture }, uShare: { value: REFLECTION_PROBE.stockShare } },
      vertexShader: BACKDROP_VERTEX,
      fragmentShader: BACKDROP_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    }));
    this.gain = new THREE.Mesh(this.backdrop.geometry, new THREE.ShaderMaterial({
      uniforms: { uGain: { value: 1 } },
      vertexShader: BACKDROP_VERTEX,
      fragmentShader: GAIN_FRAGMENT,
      side: THREE.BackSide,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
    }));
    this.gain.renderOrder = 0;
    this.backdrop.renderOrder = 1;
    this.gain.frustumCulled = this.backdrop.frustumCulled = false;
    this.backdropScene.add(this.gain, this.backdrop);
  }

  /** Captures all six faces now and publishes them; for the loading screen. */
  public capture(position: THREE.Vector3): void {
    this.schedule.reset();
    for (let face = 0; face < CUBE_FACE_COUNT; face++) this.update(0, position);
  }

  /** Renders at most one face this frame, around the observer. */
  public update(dt: number, position: THREE.Vector3): void {
    const face = this.schedule.advance(dt);
    if (face !== null) this.renderFace(face, position);
  }

  public dispose(): void {
    if (this.scene.environment === this.target.texture) this.scene.environment = null;
    this.target.dispose();
    this.stock.dispose();
    this.backdrop.geometry.dispose();
    this.backdrop.material.dispose();
    this.gain.material.dispose();
  }

  private renderFace(face: number, position: THREE.Vector3): void {
    // A pass keeps the position of its first face so the six sides line up.
    if (face === 0) {
      this.camera.position.copy(position);
      this.camera.updateMatrixWorld();
      this.backdrop.position.copy(position);
      this.gain.position.copy(position);
      this.gain.material.uniforms.uGain.value = reflectionGain(REFLECTION_PROBE.localStrength, this.scene.environmentIntensity);
    }
    const faceCamera = this.camera.children[face] as THREE.PerspectiveCamera;
    const previousTarget = this.renderer.getRenderTarget();
    const previousAutoClear = this.renderer.autoClear;
    const wasVisible = this.hidden.visible;
    this.hidden.visible = false;
    // Intensity, not visibility: a different light count would recompile every lit shader.
    for (let index = 0; index < this.muted.length; index++) {
      this.mutedIntensities[index] = this.muted[index].intensity;
      this.muted[index].intensity = 0;
    }
    this.renderer.setRenderTarget(this.target, face);
    this.renderer.render(this.scene, faceCamera);
    this.renderer.autoClear = false;
    this.renderer.render(this.backdropScene, faceCamera);
    this.renderer.autoClear = previousAutoClear;
    this.renderer.setRenderTarget(previousTarget);
    this.hidden.visible = wasVisible;
    for (let index = 0; index < this.muted.length; index++) this.muted[index].intensity = this.mutedIntensities[index];
    if (face === CUBE_FACE_COUNT - 1) this.publish();
  }

  /** The renderer rebuilds its blurred copy of the cube the next time a material samples it. */
  private publish(): void {
    this.target.texture.needsPMREMUpdate = true;
    if (this.published) return;
    this.published = true;
    this.scene.environment?.dispose();
    this.scene.environment = this.target.texture;
  }
}
