import * as THREE from 'three';
import type { CaptainUssrBrain, CaptainUssrState, CaptainUssrStrip, CaptainUssrTuning } from './CaptainUssrBrain';
import { smooth } from './CaptainUssrMotion';

/** What the telegraphs read from the brain each frame. */
export type CaptainUssrTelegraphSnapshot = Pick<CaptainUssrBrain,
  'state' | 'stateProgress' | 'position' | 'heading' | 'shockwave' | 'sweepMark' | 'sweepStrikes'>;

const WARNING_RED = 0xff2a12;
/** Height of the marks over the ground, clear of it. */
const LIFT = 0.04;
/** The slam's cone: its glow across the windup, the pulse once its aim locks, and the flash of the impact (seconds). */
const CONE = { base: 0.1, loaded: 0.45, pulse: 0.15, flashSeconds: 0.3 } as const;
/** The shockwave: the line of its reach, the charge gathering inside it, and its rolling front. */
const WAVE = { reach: 0.55, gather: 0.18, front: 0.8 } as const;
/** The electrical sweep is blue, not red, and drawn as a long band between two solid rails. */
const SWEEP_BLUE = 0x2fb6ff;
const SWEEP_FLASH = 0xbfeaff;
/**
 * The sweep's strip: its dim band, the charge filling it out from its centre
 * line to the rails as the strike nears, the rails' width (m) and pulse, and
 * the flash of the strike (seconds).
 */
const SWEEP = { band: 0.14, charge: 0.4, railWidth: 0.16, rail: 0.75, railPulse: 0.2, flash: 0.95, flashSeconds: 0.35 } as const;

/**
 * The ground marks of CAPITÁN URSS's area attacks, so each can be read and
 * dodged: the slam's cone glowing red through its windup (pulsing once its
 * aim is locked) and flashing as it lands; the shockwave's reach drawn on
 * the ground through its windup, with the charge gathering inside it, then
 * its front rolling out; each strip of the electrical sweep as a blue band
 * between two rails, filling up as its strike nears, then flashing as it
 * strikes. Presentation only: the brain decides what lands.
 */
export class CaptainUssrTelegraphs {
  public readonly group = new THREE.Group();
  private readonly cone: THREE.Mesh;
  private readonly reach: THREE.Mesh;
  private readonly front: THREE.Mesh;
  /** The marked strip: its band, its rails and the charge across it, laid along +z and stretched to its length. */
  private readonly strip = new THREE.Group();
  private readonly stripCharge: THREE.Mesh;
  private readonly stripFlash: THREE.Mesh;
  private readonly materials: readonly THREE.MeshBasicMaterial[];
  private readonly coneMaterial: THREE.MeshBasicMaterial;
  private readonly reachMaterial: THREE.MeshBasicMaterial;
  private readonly frontMaterial: THREE.MeshBasicMaterial;
  private readonly bandMaterial: THREE.MeshBasicMaterial;
  private readonly chargeMaterial: THREE.MeshBasicMaterial;
  private readonly railMaterial: THREE.MeshBasicMaterial;
  private readonly stripFlashMaterial: THREE.MeshBasicMaterial;
  /** The strip drawn last frame: the one that struck when the strikes count moves on. */
  private readonly lastStrip = { fromX: 0, fromZ: 0, toX: 0, toZ: 0 };
  private lastStripDrawn = false;
  private seenStrikes = 0;
  private stripFlashLeft = 0;
  private previous: CaptainUssrState = 'dormant';
  private flashLeft = 0;
  private time = 0;

  public constructor(private readonly tuning: CaptainUssrTuning) {
    this.group.name = 'captain-ussr-telegraphs';
    const material = (color = WARNING_RED, blending: THREE.Blending = THREE.AdditiveBlending): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0, depthWrite: false, blending,
      side: THREE.DoubleSide, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    this.coneMaterial = material();
    this.reachMaterial = material();
    this.frontMaterial = material();
    this.bandMaterial = material(SWEEP_BLUE);
    this.chargeMaterial = material(SWEEP_BLUE);
    // Solid rails, so the strip's edges read on bright snow as well as in the dark.
    this.railMaterial = material(SWEEP_BLUE, THREE.NormalBlending);
    this.stripFlashMaterial = material(SWEEP_FLASH);
    this.materials = [
      this.coneMaterial, this.reachMaterial, this.frontMaterial,
      this.bandMaterial, this.chargeMaterial, this.railMaterial, this.stripFlashMaterial,
    ];
    const { slam, shockwave, sweep } = tuning;
    // A sector centred on -y, laid flat so it points along +z (the heading's forward).
    const half = Math.acos(slam.arcCos);
    this.cone = this.mark(new THREE.CircleGeometry(slam.range, 28, -Math.PI / 2 - half, half * 2), this.coneMaterial);
    this.reach = this.mark(new THREE.RingGeometry(shockwave.radius - 0.15, shockwave.radius, 72), this.reachMaterial);
    // Unit ring, scaled to the front's radius.
    this.front = this.mark(new THREE.RingGeometry(1 - shockwave.band / shockwave.radius, 1, 72), this.frontMaterial);
    // The strip: unit length along +z, its true width across.
    const railX = sweep.width / 2 - SWEEP.railWidth / 2;
    this.stripCharge = this.flat(new THREE.PlaneGeometry(1, 1), this.chargeMaterial);
    this.strip.add(
      this.flat(new THREE.PlaneGeometry(sweep.width, 1), this.bandMaterial),
      this.flat(new THREE.PlaneGeometry(SWEEP.railWidth, 1).translate(-railX, 0, 0), this.railMaterial),
      this.flat(new THREE.PlaneGeometry(SWEEP.railWidth, 1).translate(railX, 0, 0), this.railMaterial),
      this.stripCharge,
    );
    this.strip.visible = false;
    this.group.add(this.strip);
    this.stripFlash = this.mark(new THREE.PlaneGeometry(sweep.width, 1), this.stripFlashMaterial);
  }

  public update(dt: number, boss: CaptainUssrTelegraphSnapshot, groundY: number): void {
    const step = Math.max(0, dt);
    this.time += step;
    if (this.previous === 'slamWindup' && boss.state !== 'slamWindup' && boss.state !== 'enraged') this.flashLeft = CONE.flashSeconds;
    this.previous = boss.state;
    this.flashLeft = Math.max(0, this.flashLeft - step);
    this.showCone(boss, groundY);
    this.showShockwave(boss, groundY);
    this.showSweep(step, boss, groundY);
  }

  public reset(): void {
    this.previous = 'dormant';
    this.flashLeft = 0;
    this.lastStripDrawn = false;
    this.seenStrikes = 0;
    this.stripFlashLeft = 0;
    for (const mark of [this.cone, this.reach, this.front, this.strip, this.stripFlash]) mark.visible = false;
  }

  public dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    for (const material of this.materials) material.dispose();
  }

  private mark(geometry: THREE.BufferGeometry, material: THREE.MeshBasicMaterial): THREE.Mesh {
    const mesh = this.flat(geometry, material);
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }

  /** A ground mark laid flat: its +y turned to -z, drawn over the ground. */
  private flat(geometry: THREE.BufferGeometry, material: THREE.MeshBasicMaterial): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry.rotateX(-Math.PI / 2), material);
    mesh.renderOrder = 2;
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

  /**
   * The marked strip filling up from its centre line as its strike nears;
   * when the strikes count moves on, the strip drawn last frame flashes.
   * Nothing is left once it has fallen.
   */
  private showSweep(dt: number, boss: CaptainUssrTelegraphSnapshot, groundY: number): void {
    const defeated = boss.state === 'defeated';
    if (boss.sweepStrikes > this.seenStrikes && this.lastStripDrawn) {
      this.place(this.stripFlash, this.lastStrip, groundY);
      this.stripFlashLeft = SWEEP.flashSeconds + dt;
    }
    this.seenStrikes = boss.sweepStrikes;
    this.stripFlashLeft = defeated ? 0 : Math.max(0, this.stripFlashLeft - dt);
    this.stripFlash.visible = this.stripFlashLeft > 0;
    this.stripFlashMaterial.opacity = SWEEP.flash * Math.min(1, this.stripFlashLeft / SWEEP.flashSeconds);
    const mark = defeated ? null : boss.sweepMark;
    this.strip.visible = mark !== null;
    this.lastStripDrawn = mark !== null;
    if (!mark) return;
    Object.assign(this.lastStrip, mark);
    this.place(this.strip, mark, groundY);
    const progress = boss.state === 'sweepWindup' ? boss.stateProgress : 1;
    this.bandMaterial.opacity = SWEEP.band;
    this.stripCharge.scale.x = Math.max(0.05, this.tuning.sweep.width * smooth(progress));
    this.chargeMaterial.opacity = SWEEP.charge * (0.4 + 0.6 * progress);
    // The rails throb faster as the strike nears.
    this.railMaterial.opacity = SWEEP.rail + SWEEP.railPulse * Math.sin(this.time * (8 + 16 * progress));
  }

  /** Lays a strip-shaped mark (unit length along +z) over `strip`. */
  private place(mark: THREE.Object3D, strip: CaptainUssrStrip, groundY: number): void {
    const dx = strip.toX - strip.fromX;
    const dz = strip.toZ - strip.fromZ;
    mark.position.set((strip.fromX + strip.toX) / 2, groundY + LIFT, (strip.fromZ + strip.toZ) / 2);
    mark.rotation.y = Math.atan2(dx, dz);
    mark.scale.z = Math.max(0.01, Math.hypot(dx, dz));
  }
}
