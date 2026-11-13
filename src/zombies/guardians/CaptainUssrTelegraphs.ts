import * as THREE from 'three';
import type { CaptainUssrBrain, CaptainUssrState, CaptainUssrTuning } from './CaptainUssrBrain';
import { smooth } from './CaptainUssrMotion';

/** What the telegraphs read from the brain each frame. */
export type CaptainUssrTelegraphSnapshot = Pick<CaptainUssrBrain, 'state' | 'stateProgress' | 'position' | 'heading' | 'shockwave'>;

const WARNING_RED = 0xff2a12;
/** Height of the marks over the ground, clear of it. */
const LIFT = 0.04;
/** The slam's cone: its glow across the windup, the pulse once its aim locks, and the flash of the impact (seconds). */
const CONE = { base: 0.1, loaded: 0.45, pulse: 0.15, flashSeconds: 0.3 } as const;
/** The shockwave: the line of its reach, the charge gathering inside it, and its rolling front. */
const WAVE = { reach: 0.55, gather: 0.18, front: 0.8 } as const;

/**
 * The ground marks of CAPITÁN URSS's area attacks, so each can be read and
 * dodged: the slam's cone glowing red through its windup (pulsing once its
 * aim is locked) and flashing as it lands; the shockwave's reach drawn on
 * the ground through its windup, with the charge gathering inside it, then
 * its front rolling out. Presentation only: the brain decides what lands.
 */
export class CaptainUssrTelegraphs {
  public readonly group = new THREE.Group();
  private readonly cone: THREE.Mesh;
  private readonly reach: THREE.Mesh;
  private readonly front: THREE.Mesh;
  private readonly materials: readonly THREE.MeshBasicMaterial[];
  private readonly coneMaterial: THREE.MeshBasicMaterial;
  private readonly reachMaterial: THREE.MeshBasicMaterial;
  private readonly frontMaterial: THREE.MeshBasicMaterial;
  private previous: CaptainUssrState = 'dormant';
  private flashLeft = 0;
  private time = 0;

  public constructor(private readonly tuning: CaptainUssrTuning) {
    this.group.name = 'captain-ussr-telegraphs';
    const material = (): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({
      color: WARNING_RED, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    this.coneMaterial = material();
    this.reachMaterial = material();
    this.frontMaterial = material();
    this.materials = [this.coneMaterial, this.reachMaterial, this.frontMaterial];
    const { slam, shockwave } = tuning;
    // A sector centred on -y, laid flat so it points along +z (the heading's forward).
    const half = Math.acos(slam.arcCos);
    this.cone = this.mark(new THREE.CircleGeometry(slam.range, 28, -Math.PI / 2 - half, half * 2), this.coneMaterial);
    this.reach = this.mark(new THREE.RingGeometry(shockwave.radius - 0.15, shockwave.radius, 72), this.reachMaterial);
    // Unit ring, scaled to the front's radius.
    this.front = this.mark(new THREE.RingGeometry(1 - shockwave.band / shockwave.radius, 1, 72), this.frontMaterial);
  }

  public update(dt: number, boss: CaptainUssrTelegraphSnapshot, groundY: number): void {
    const step = Math.max(0, dt);
    this.time += step;
    if (this.previous === 'slamWindup' && boss.state !== 'slamWindup' && boss.state !== 'enraged') this.flashLeft = CONE.flashSeconds;
    this.previous = boss.state;
    this.flashLeft = Math.max(0, this.flashLeft - step);
    this.showCone(boss, groundY);
    this.showShockwave(boss, groundY);
  }

  public reset(): void {
    this.previous = 'dormant';
    this.flashLeft = 0;
    for (const mesh of [this.cone, this.reach, this.front]) mesh.visible = false;
  }

  public dispose(): void {
    this.group.removeFromParent();
    for (const mesh of [this.cone, this.reach, this.front]) mesh.geometry.dispose();
    for (const material of this.materials) material.dispose();
  }

  private mark(geometry: THREE.BufferGeometry, material: THREE.MeshBasicMaterial): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry.rotateX(-Math.PI / 2), material);
    mesh.visible = false;
    mesh.renderOrder = 2;
    this.group.add(mesh);
    return mesh;
  }

  private showCone(boss: CaptainUssrTelegraphSnapshot, groundY: number): void {
    const winding = boss.state === 'slamWindup';
    this.cone.visible = winding || this.flashLeft > 0;
    if (!this.cone.visible) return;
    if (winding) {
      this.cone.position.set(boss.position.x, groundY + LIFT, boss.position.z);
      this.cone.rotation.y = boss.heading;
      const progress = boss.stateProgress;
      const locked = progress >= this.tuning.slam.aimLock ? CONE.pulse * (0.5 + 0.5 * Math.sin(this.time * 28)) : 0;
      this.coneMaterial.opacity = CONE.base + CONE.loaded * smooth(progress) + locked;
      return;
    }
    this.coneMaterial.opacity = (this.flashLeft / CONE.flashSeconds) * 0.9;
  }

  private showShockwave(boss: CaptainUssrTelegraphSnapshot, groundY: number): void {
    const { shockwave } = this.tuning;
    const winding = boss.state === 'shockwaveWindup';
    const wave = boss.shockwave;
    this.reach.visible = winding;
    this.front.visible = winding || wave.radius >= 0;
    if (winding) {
      const progress = boss.stateProgress;
      this.reach.position.set(boss.position.x, groundY + LIFT, boss.position.z);
      this.reachMaterial.opacity = WAVE.reach * smooth(progress / 0.3) * (0.75 + 0.25 * Math.sin(this.time * 12));
      // The charge gathers inside the reach, the front waiting at its feet.
      const gathered = Math.max(0.3, shockwave.radius * 0.25 * progress * progress);
      this.front.position.set(boss.position.x, groundY + LIFT, boss.position.z);
      this.front.scale.setScalar(gathered);
      this.frontMaterial.opacity = WAVE.gather + 0.3 * progress;
      return;
    }
    if (wave.radius < 0) return;
    this.front.position.set(wave.x, groundY + LIFT, wave.z);
    this.front.scale.setScalar(Math.max(0.05, wave.radius));
    this.frontMaterial.opacity = WAVE.front * (1 - 0.6 * (wave.radius / shockwave.radius));
  }
}
