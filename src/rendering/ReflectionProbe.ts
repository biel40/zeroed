import * as THREE from 'three';
import { CUBE_FACE_COUNT, ReflectionProbeSchedule } from './ReflectionProbeSchedule';

/** Tuning of the local reflections; every value is a look decision, not a contract. */
export const REFLECTION_PROBE = {
  /** Cube face size in pixels. 256 matches the stock environment, so swapping it in compiles nothing. */
  size: 256,
  /** Seconds between the end of one capture and the start of the next. */
  refreshSeconds: 1,
  /** Ambient light added only while capturing, so unlit rooms still give metal something to reflect. */
  fillIntensity: 0.6,
  /** `scene.environmentIntensity` once the captured surroundings replace the stock environment. */
  environmentIntensity: 1.25,
} as const;

const NEAR = 0.1;
const FAR = 120;

/**
 * Local reflections: captures the scene around the observer into a cube map
 * and publishes it as `scene.environment`, so metal, glass and wet surfaces
 * mirror the real room (its lamps, fire and walls) and bounce its light,
 * instead of a generic studio. The capture is time-sliced by
 * `ReflectionProbeSchedule`; a finished pass is published in one go.
 */
export class ReflectionProbe {
  private readonly target: THREE.WebGLCubeRenderTarget;
  private readonly camera: THREE.CubeCamera;
  private readonly fill = new THREE.AmbientLight(0xffffff, 0);
  private readonly schedule = new ReflectionProbeSchedule(REFLECTION_PROBE.refreshSeconds);
  private published = false;

  /**
   * @param hidden Left out of every capture: the first-person rig, which
   * would otherwise be mirrored as a floating weapon.
   */
  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly hidden: THREE.Object3D,
    textureType: THREE.TextureDataType,
  ) {
    this.target = new THREE.WebGLCubeRenderTarget(REFLECTION_PROBE.size, { type: textureType, generateMipmaps: false });
    this.camera = new THREE.CubeCamera(NEAR, FAR, this.target);
    this.camera.coordinateSystem = renderer.coordinateSystem;
    this.camera.updateCoordinateSystem();
    // Always in the scene at zero intensity: ambient light is a uniform, so
    // raising it for a capture never changes the compiled light setup.
    this.scene.add(this.fill);
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
    this.scene.remove(this.fill);
    if (this.scene.environment === this.target.texture) this.scene.environment = null;
    this.target.dispose();
  }

  private renderFace(face: number, position: THREE.Vector3): void {
    // A pass keeps the position of its first face so the six sides line up.
    if (face === 0) {
      this.camera.position.copy(position);
      this.camera.updateMatrixWorld();
    }
    const previousTarget = this.renderer.getRenderTarget();
    const wasVisible = this.hidden.visible;
    this.hidden.visible = false;
    this.fill.intensity = REFLECTION_PROBE.fillIntensity;
    this.renderer.setRenderTarget(this.target, face);
    this.renderer.render(this.scene, this.camera.children[face] as THREE.PerspectiveCamera);
    this.renderer.setRenderTarget(previousTarget);
    this.fill.intensity = 0;
    this.hidden.visible = wasVisible;
    if (face === CUBE_FACE_COUNT - 1) this.publish();
  }

  /** The renderer rebuilds its blurred copy of the cube the next time a material samples it. */
  private publish(): void {
    this.target.texture.needsPMREMUpdate = true;
    if (this.published) return;
    this.published = true;
    this.scene.environment?.dispose();
    this.scene.environment = this.target.texture;
    this.scene.environmentIntensity = REFLECTION_PROBE.environmentIntensity;
  }
}
