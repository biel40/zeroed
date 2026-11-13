import * as THREE from 'three';
import { ElectricArcRibbons, type ElectricArcStyle } from '../../../rendering/ElectricArcRibbons';
import { makeSoftDotTexture } from '../../doors/BuyableDoorVisual';
import type { UpgradeMachine } from '../shared/UpgradeMachine';
import { KOVKA_CORE_COLOR, KOVKA_REACTOR } from '../Station33Config';
import { KOVKA_REACTOR_FACE, kovkaElectrodeAngles } from './KovkaReactor';
import { KovkaReactorDrive, type KovkaReactorEvent } from './KovkaReactorDrive';
import type { Station33BuildContext } from './Station33BuildContext';

const { x: AXIS_X, axisY: AXIS_Y, frontZ: FRONT_Z } = KOVKA_REACTOR;
/** White-blue heat of the charge at its brightest, over the core's own blue. */
const HOT_COLOR = 0xdff0ff;
/** Points of the bore's rim the arcs strike, between the electrodes' ball ends. */
const RIM_ANCHORS = 6;
/** The iris's glowing blades, one per plate of the face. */
const IRIS_BLADES = 16;

/** Lightning across the face, electrode to electrode and onto the bore; fewer, shorter-lived bolts on reduced effects. */
const ARC_STYLE: ElectricArcStyle = {
  arcs: 6, pointsPerArc: 10, rerollInterval: 0.07, halfWidth: 0.05, jitter: 0.55, skinOffset: 0.06, color: 0x9fd4ff, activeChance: 0.6,
};
const ARC_STYLE_REDUCED: ElectricArcStyle = { ...ARC_STYLE, arcs: 3, pointsPerArc: 7 };

const PLANE_VERTEX = /* glsl */ `
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The charged iris over the plates: blades of light turning with the drive
 * (`uSpin`), a slow swirl through them and a glow hugging the bore, white
 * hot as the charge peaks; the discharge floods it from the bore outwards.
 */
const IRIS_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSpin;
  uniform float uCharge;
  uniform float uFlash;
  uniform float uInner;
  uniform float uOuter;
  uniform vec3 uColor;
  uniform vec3 uHot;
  varying vec2 vLocal;
  void main() {
    float radius = length(vLocal);
    float t = clamp((radius - uInner) / (uOuter - uInner), 0.0, 1.0);
    float angle = atan(vLocal.y, vLocal.x);
    float blades = pow(0.5 + 0.5 * cos(${IRIS_BLADES.toFixed(1)} * (angle - uSpin)), 8.0);
    float swirl = 0.5 + 0.5 * sin(angle * 3.0 - radius * 2.5 + uSpin * 2.0 - uTime * 4.0);
    float inner = 1.0 - smoothstep(0.0, 0.45, t);
    float edge = smoothstep(0.0, 0.04, t) * (1.0 - smoothstep(0.8, 1.0, t));
    float glow = (blades * (0.55 + 0.45 * swirl) + inner * 0.6) * edge * uCharge;
    vec3 color = mix(uColor, uHot, inner * uCharge) * glow * 1.4 + uHot * uFlash * (1.0 - t) * 1.2;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const RING_VERTEX = /* glsl */ `
  varying float vAngle;
  void main() {
    vAngle = atan(position.y, position.x);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Pulses of current chasing each other round the coil ring, faster than the iris turns. */
const RING_FRAGMENT = /* glsl */ `
  uniform float uSpin;
  uniform float uCharge;
  uniform float uFlash;
  uniform vec3 uColor;
  uniform vec3 uHot;
  varying float vAngle;
  void main() {
    float chase = pow(0.5 + 0.5 * cos(8.0 * (vAngle + uSpin * 1.6)), 10.0);
    vec3 color = mix(uColor, uHot, chase) * (0.25 + chase * 1.6) * uCharge + uHot * uFlash;
    gl_FragColor = vec4(color, 1.0);
  }
`;

const additive = {
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  forceSinglePass: true,
  toneMapped: false,
} as const;

function chargeUniforms(extra: Record<string, THREE.IUniform> = {}): Record<string, THREE.IUniform> {
  return {
    uTime: { value: 0 },
    uSpin: { value: 0 },
    uCharge: { value: 0 },
    uFlash: { value: 0 },
    uColor: { value: new THREE.Color(KOVKA_CORE_COLOR) },
    uHot: { value: new THREE.Color(HOT_COLOR) },
    ...extra,
  };
}

/**
 * The KOVKA reactor's show while the forge before it runs (`KovkaReactorDrive`
 * decides when and how hard): its iris of plates lights up in turning
 * blades, current chases round the coil ring, lightning jumps between the
 * electrodes and onto the bore, and the core blooms, all building to a
 * crescendo and a discharge flash as the forge ends, then running down.
 * The surges and the discharge go to `onEvent` for the map to voice.
 * Four draw calls while it runs (iris, ring, arcs, bloom), none at rest;
 * no lights; reduced effects throw fewer arcs.
 */
export class KovkaReactorForge {
  private readonly drive = new KovkaReactorDrive();
  private readonly iris: THREE.Mesh<THREE.RingGeometry, THREE.ShaderMaterial>;
  private readonly ring: THREE.Mesh<THREE.TorusGeometry, THREE.ShaderMaterial>;
  private readonly arcs: ElectricArcRibbons;
  private readonly bloom: THREE.Sprite;
  private readonly materials: readonly THREE.ShaderMaterial[];
  private time = 0;

  public constructor(
    context: Station33BuildContext,
    private readonly machine: UpgradeMachine,
    private readonly onEvent: (event: KovkaReactorEvent) => void,
  ) {
    const { boreRadius, irisRadius, coilRadius, electrodeReach, ringZ } = KOVKA_REACTOR_FACE;
    this.iris = new THREE.Mesh(new THREE.RingGeometry(boreRadius, irisRadius, 96, 1), new THREE.ShaderMaterial({
      name: 'kovka_reactor_iris',
      uniforms: chargeUniforms({ uInner: { value: boreRadius }, uOuter: { value: irisRadius } }),
      vertexShader: PLANE_VERTEX,
      fragmentShader: IRIS_FRAGMENT,
      ...additive,
    }));
    this.iris.name = 'kovka-reactor-iris';
    this.iris.position.set(AXIS_X, AXIS_Y, FRONT_Z + 0.03);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(coilRadius, 0.1, 4, 96), new THREE.ShaderMaterial({
      name: 'kovka_reactor_coil_ring',
      uniforms: chargeUniforms(),
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      ...additive,
    }));
    this.ring.name = 'kovka-reactor-coil-ring';
    this.ring.position.set(AXIS_X, AXIS_Y, ringZ + 0.12);
    this.materials = [this.iris.material, this.ring.material];

    const anchors = [
      ...kovkaElectrodeAngles().map((angle) => anchorOnFace(electrodeReach, angle, ringZ)),
      ...Array.from({ length: RIM_ANCHORS }, (_, index) => anchorOnFace(boreRadius, (index / RIM_ANCHORS) * Math.PI * 2 + 0.3, FRONT_Z + 0.05)),
    ];
    this.arcs = new ElectricArcRibbons(anchors, context.profile.useReducedEffects ? ARC_STYLE_REDUCED : ARC_STYLE);
    this.arcs.mesh.name = 'kovka-reactor-arcs';

    this.bloom = new THREE.Sprite(new THREE.SpriteMaterial({
      name: 'kovka_reactor_bloom', map: makeSoftDotTexture(), color: KOVKA_CORE_COLOR,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    }));
    this.bloom.name = 'kovka-reactor-bloom';
    this.bloom.position.set(AXIS_X, AXIS_Y, FRONT_Z + 0.4);

    context.group.add(this.iris, this.ring, this.arcs.mesh, this.bloom, ...anchors);
    this.render(0);
  }

  public update(dt: number): void {
    const step = Math.max(0, dt);
    this.time += step;
    this.drive.update(step, this.machine.forgeProgress, this.onEvent);
    this.render(step);
  }

  /** Restart: dark and still, with no discharge for a forge cut short. */
  public reset(): void {
    this.time = 0;
    this.drive.reset();
    this.arcs.hide();
    this.render(0);
  }

  private render(dt: number): void {
    const { charge, flash, spin, active } = this.drive;
    this.iris.visible = this.ring.visible = this.bloom.visible = active;
    if (!active) {
      this.arcs.hide();
      return;
    }
    // A fast, uneven throb, so the charge never reads as a steady lamp.
    const throb = 0.82 + 0.18 * Math.sin(this.time * 17) * Math.sin(this.time * 5.3);
    for (const material of this.materials) {
      const uniforms = material.uniforms;
      uniforms.uTime.value = this.time;
      uniforms.uSpin.value = spin;
      uniforms.uCharge.value = charge * throb;
      uniforms.uFlash.value = flash;
    }
    // Lightning only once the charge runs high, and all of it in the discharge.
    const lightning = THREE.MathUtils.smoothstep(charge, 0.55, 1) * throb;
    this.arcs.update(dt, Math.min(1, Math.max(lightning, flash)));
    const material = this.bloom.material;
    material.opacity = Math.min(1, 0.2 + 0.5 * charge * throb + flash * 0.8);
    this.bloom.scale.setScalar(3 + 3 * charge + flash * 6);
  }
}

/** An invisible point on the reactor's face the arcs strike, at polar (`radius`, `angle`) round its axis. */
function anchorOnFace(radius: number, angle: number, z: number): THREE.Object3D {
  const anchor = new THREE.Object3D();
  anchor.name = 'kovka-reactor-arc-anchor';
  anchor.position.set(AXIS_X + Math.cos(angle) * radius, AXIS_Y + Math.sin(angle) * radius, z);
  return anchor;
}
