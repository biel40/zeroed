import * as THREE from 'three';
import type { EvacuationStage } from '../../evacuation/EvacuationProtocol';
import { addSolidProxy } from '../shared/SolidProxy';
import { PROTOCOL33_BLAST_DOOR, PROTOCOL33_PANEL, STATION33_WALL_THICKNESS } from '../Station33Config';
import type { Station33BuildContext } from './Station33BuildContext';

/** Segments of the door's unlocking gauge. */
const GAUGE_SEGMENTS = 10;
const LAMP_OFF = new THREE.Color(0x200605);
const LAMP_RED = new THREE.Color(0xff2a12);
const LAMP_GREEN = new THREE.Color(0x46ff70);
const GAUGE_LIT = new THREE.Color(0xffa040);
const GAUGE_DARK = new THREE.Color(0x140b06);
/** Lightbox red, and how dark it sits before the power. */
const SIGN_RED = new THREE.Color(0xff3020);
const SIGN_DEAD = 0.04;
/** Lightbox face off the wall, in front of its steel housing. */
const SIGN_OUT = 0.02;
const HOUSING_DEPTH = 0.015;

/** What the panel shows this frame. */
export interface Protocol33PanelState {
  readonly powered: boolean;
  /** Which auxiliary systems are back, in the rules' order. */
  readonly restored: readonly boolean[];
  readonly stage: EvacuationStage;
  /** Door unlocking, 0..1. */
  readonly progress: number;
  readonly defended: boolean;
}

/**
 * The evacuation control panel on the workshop's east wall: a steel
 * cabinet with a slate face carrying the mains lamp, one lamp per
 * auxiliary system, the unlocking gauge and the big start button, under
 * the "ПРОТОКОЛ 33" lightbox; the "АВАРИЙНЫЙ ВЫХОД" lightbox hangs over the
 * blast door. Dead until the power comes on; red, then green, as the
 * systems return; the gauge blinks while nobody defends it.
 */
export class Protocol33Panel {
  private readonly mainsLamp: THREE.MeshBasicMaterial;
  private readonly systemLamps: THREE.MeshBasicMaterial[];
  private readonly segments: THREE.Mesh[] = [];
  private readonly gaugeLit = new THREE.MeshBasicMaterial({ name: 'protocol33_gauge_lit', color: GAUGE_LIT });
  private readonly gaugeDark = new THREE.MeshBasicMaterial({ name: 'protocol33_gauge_dark', color: GAUGE_DARK });
  private readonly button = new THREE.MeshBasicMaterial({ name: 'protocol33_button', color: LAMP_OFF });
  private readonly signs: THREE.MeshBasicMaterial;
  private time = 0;

  public constructor(context: Station33BuildContext, systems: number) {
    const { batch, materials, signage, group } = context;
    const { x, z, width, depth, height } = PROTOCOL33_PANEL;
    const front = x - depth;
    batch.addBox(materials.greySteel, x - depth / 2, height / 2, z, depth, height, width);
    batch.addBox(materials.hazardPaint, front - 0.004, 0.1, z, 0.01, 0.2, width);
    batch.addBox(materials.darkGranite, front - 0.01, 1.36, z, 0.02, 0.8, width - 0.16);
    addSolidProxy(context, 'protocol33-panel', { x: front, y: 0, z: z - width / 2 }, { x, y: height, z: z + width / 2 }, 'metal');
    const faceX = front - 0.03;
    const lamp = (name: string, along: number, y: number): THREE.MeshBasicMaterial => {
      const material = new THREE.MeshBasicMaterial({ name, color: LAMP_OFF });
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12).rotateZ(Math.PI / 2), material);
      mesh.position.set(faceX, y, z + along);
      group.add(mesh);
      return material;
    };
    this.mainsLamp = lamp('protocol33_mains_lamp', -0.36, 1.62);
    this.systemLamps = Array.from({ length: systems }, (_, index) => lamp(`protocol33_system_lamp_${index}`, -0.12 + index * 0.24, 1.62));
    const span = width - 0.36;
    const step = span / GAUGE_SEGMENTS;
    for (let index = 0; index < GAUGE_SEGMENTS; index++) {
      const segment = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.07, step * 0.7), this.gaugeDark);
      segment.position.set(faceX, 1.36, z - span / 2 + step * (index + 0.5));
      group.add(segment);
      this.segments.push(segment);
    }
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.06, 16).rotateZ(Math.PI / 2), this.button);
    button.position.set(faceX - 0.01, 1.1, z);
    group.add(button);
    batch.addBox(materials.greySteel, faceX + 0.01, 1.1, z, 0.02, 0.2, 0.2);
    // Both lightboxes share one material: dead, then red, then flashing with the alarm.
    this.signs = new THREE.MeshBasicMaterial({ name: 'protocol33_signs', map: signage.litMaterial.map, alphaTest: 0.5, color: SIGN_RED });
    const panelSign = new THREE.Mesh(signage.signGeometry('protocol-33', 1.1, 0.275).rotateY(-Math.PI / 2), this.signs);
    panelSign.position.set(x - SIGN_OUT, height + 0.42, z);
    batch.addBox(materials.greySteel, x - HOUSING_DEPTH / 2, panelSign.position.y, z, HOUSING_DEPTH, 0.35, 1.18);
    const door = PROTOCOL33_BLAST_DOOR;
    const roomFaceZ = door.z + STATION33_WALL_THICKNESS / 2;
    const exitSign = new THREE.Mesh(signage.signGeometry('emergency-exit', 1.6, 0.4), this.signs);
    exitSign.position.set(door.x, door.height + 0.5, roomFaceZ + SIGN_OUT);
    batch.addBox(materials.greySteel, door.x, exitSign.position.y, roomFaceZ + HOUSING_DEPTH / 2, 1.7, 0.48, HOUSING_DEPTH);
    group.add(panelSign, exitSign);
    this.render({ powered: false, restored: Array(systems).fill(false), stage: 'locked', progress: 0, defended: true });
  }

  /** Lamps, gauge, button and lightboxes for this frame; blinking runs on the panel's own clock. */
  public update(dt: number, state: Protocol33PanelState): void {
    this.time += Math.max(0, dt);
    this.render(state);
  }

  public reset(systems: number): void {
    this.time = 0;
    this.render({ powered: false, restored: Array(systems).fill(false), stage: 'locked', progress: 0, defended: true });
  }

  private render(state: Protocol33PanelState): void {
    const blink = Math.sin(this.time * 9) > 0;
    const running = state.stage === 'defending' || state.stage === 'escaping' || state.stage === 'completed';
    this.mainsLamp.color.copy(state.powered ? LAMP_GREEN : LAMP_OFF);
    for (let index = 0; index < this.systemLamps.length; index++) {
      this.systemLamps[index].color.copy(!state.powered ? LAMP_OFF : state.restored[index] ? LAMP_GREEN : LAMP_RED);
    }
    const lit = state.stage === 'escaping' || state.stage === 'completed' ? GAUGE_SEGMENTS : Math.floor(state.progress * GAUGE_SEGMENTS);
    const pausedBlink = state.stage === 'defending' && !state.defended && !blink;
    for (let index = 0; index < this.segments.length; index++) {
      this.segments[index].material = index < lit && !pausedBlink ? this.gaugeLit : this.gaugeDark;
    }
    const buttonLit = running || (state.stage === 'ready' && blink);
    this.button.color.copy(buttonLit ? LAMP_RED : LAMP_OFF);
    const signLevel = !state.powered ? SIGN_DEAD : running ? (blink ? 1.4 : 0.25) : 0.75 + 0.2 * Math.sin(this.time * 2.2);
    this.signs.color.copy(SIGN_RED).multiplyScalar(signLevel);
  }
}
