import * as THREE from 'three';
import type { Weapon } from './Weapon';
import type { MagazineDropPool } from './MagazineDrop';
import type { ReloadAnimConfig, ReloadPhase } from './WeaponTypes';

/** View-model parts the animator drives; any of them may be absent. */
export interface ReloadParts {
  /** Detachable magazine / power cell (Mesh or small Group). */
  magazine: THREE.Object3D | null;
  /** Charging handle / bolt knob. */
  handle: THREE.Object3D | null;
  /** Belt feed cover pivot (rotates open). */
  cover: THREE.Object3D | null;
}

interface HomePose {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
}

function captureHome(object: THREE.Object3D): HomePose {
  return { position: object.position.clone(), quaternion: object.quaternion.clone() };
}

function restoreHome(object: THREE.Object3D, home: HomePose): void {
  object.position.copy(home.position);
  object.quaternion.copy(home.quaternion);
}

/** Smooth 0→1→0 curve over [start, end] for a progress value. */
function pulse(p: number, start: number, end: number): number {
  if (p <= start || p >= end) return 0;
  return Math.sin(((p - start) / (end - start)) * Math.PI);
}

/** 0→1 eased ramp over [start, end]. */
function ramp(p: number, start: number, end: number): number {
  const t = Math.min(1, Math.max(0, (p - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

/**
 * Phase-driven reload choreography. Driven by Weapon.stateProgress so the
 * visuals can never desync from the ammo logic (Weapon stays the authority:
 * ammunition is granted when the state completes, never by the animation).
 * Emits one ReloadPhase event per threshold crossed for audio sync, drops
 * the detached magazine into the world pool, and restores every part when
 * the reload is interrupted (weapon switch cancels the state).
 */
export class ReloadAnimator {
  /** Fired once per threshold: magOut → magDrop → magIn → magSeat → charge… */
  onPhase: ((phase: ReloadPhase) => void) | null = null;

  // Body-motion outputs consumed by WeaponView every frame.
  bodyDip = 0;
  bodyTilt = 0;
  bodyRoll = 0;
  /** 0..1 energy spin-up (cell style); WeaponView boosts its glow pulse. */
  chargeGlow = 0;

  private readonly magHome: HomePose | null = null;
  private readonly handleHome: HomePose | null = null;
  private readonly coverHome: HomePose | null = null;
  private readonly fired = new Set<ReloadPhase>();
  private wasReloading = false;

  constructor(
    private readonly config: ReloadAnimConfig,
    private readonly parts: ReloadParts,
    private readonly dropPool: MagazineDropPool | null,
  ) {
    if (parts.magazine) this.magHome = captureHome(parts.magazine);
    if (parts.handle) this.handleHome = captureHome(parts.handle);
    if (parts.cover) this.coverHome = captureHome(parts.cover);
  }

  update(weapon: Weapon): void {
    if (weapon.state !== 'reloading') {
      if (this.wasReloading) this.restore();
      this.wasReloading = false;
      return;
    }
    if (!this.wasReloading) {
      // Fresh reload: re-arm the phase thresholds.
      this.fired.clear();
      this.wasReloading = true;
    }

    const p = weapon.stateProgress;
    const c = this.config;
    this.cross(p, c.magOut, 'magOut');
    this.cross(p, c.magDrop, 'magDrop');
    this.cross(p, c.magIn, 'magIn');
    this.cross(p, c.magSeat, 'magSeat');
    if (weapon.reloadType === 'empty' && c.charge >= 0) {
      this.cross(p, c.charge, 'chargeStart');
      this.cross(p, c.chargeEnd, 'chargeEnd');
    }
    if (c.coverOpen !== undefined) this.cross(p, c.coverOpen, 'coverOpen');
    if (c.coverClose !== undefined) this.cross(p, c.coverClose, 'coverClose');

    this.animateMagazine(p);
    this.animateHandle(p, weapon.reloadType === 'empty');
    this.animateCover(p);
    this.animateBody(p);
  }

  /** Bolt-cycle between shots (L96): the handle works the action. */
  updateCycling(progress: number): void {
    const handle = this.parts.handle;
    if (!handle || !this.handleHome) return;
    this.applyHandleMotion(handle, progress);
  }

  private cross(p: number, threshold: number, phase: ReloadPhase): void {
    if (p < threshold || this.fired.has(phase)) return;
    this.fired.add(phase);
    if (phase === 'magDrop' && this.parts.magazine) {
      // The part leaves the weapon: world-space drop, view-model mag hidden
      // until a fresh one is inserted at magIn.
      this.dropPool?.drop(this.parts.magazine);
      this.parts.magazine.visible = false;
    }
    this.onPhase?.(phase);
  }

  private animateMagazine(p: number): void {
    const mag = this.parts.magazine;
    if (!mag || !this.magHome) return;
    const c = this.config;
    const height = c.magSize[1];

    if (p >= c.magDrop && p < c.magIn) return; // on the floor, hidden
    if (p < c.magOut || p >= c.magSeat) {
      if (p >= c.magSeat) restoreHome(mag, this.magHome);
      if (p >= c.magIn) mag.visible = true;
      return;
    }

    if (p < c.magDrop) {
      // Detaching: slide/rock out of the well.
      const t = ramp(p, c.magOut, c.magDrop);
      this.applyMagOut(mag, t, height);
      return;
    }
    // Fresh magazine coming in.
    mag.visible = true;
    const t = ramp(p, c.magIn, c.magSeat);
    this.applyMagIn(mag, t, height);
  }

  /** Magazine leaving the weapon, per style. t: 0 (seated) → 1 (free). */
  private applyMagOut(mag: THREE.Object3D, t: number, height: number): void {
    const home = this.magHome as HomePose;
    mag.position.copy(home.position);
    mag.quaternion.copy(home.quaternion);
    switch (this.config.style) {
      case 'rock':
        // AK rock: pivot nose-forward around the front lug, then away.
        mag.rotateX(-t * 0.9);
        mag.position.y -= t * height * 0.9;
        mag.position.z -= t * height * 0.35;
        break;
      case 'belt':
        mag.position.x -= t * height * 0.6;
        mag.position.y -= t * height * 1.1;
        break;
      case 'cell':
        // Power cell rises out of its cage with a slow spin.
        mag.position.y += t * height * 1.5;
        mag.rotateY(t * 2.2);
        break;
      case 'rifle':
        // STANAG magazine clears the well down and slightly rearward.
        mag.position.y -= t * height * 1.2;
        mag.position.z += t * height * 0.25;
        mag.rotateX(t * 0.18);
        break;
      case 'pistol':
        mag.position.y -= t * height * 1.25;
        mag.position.z += t * height * 0.12;
        mag.rotateX(t * 0.12);
        break;
      default:
        mag.position.y -= t * height * 1.15;
        mag.rotateX(t * 0.25);
        break;
    }
  }

  /** Fresh magazine being inserted. t: 0 (approach) → 1 (seated). */
  private applyMagIn(mag: THREE.Object3D, t: number, height: number): void {
    const home = this.magHome as HomePose;
    mag.position.copy(home.position);
    mag.quaternion.copy(home.quaternion);
    const inv = 1 - t;
    switch (this.config.style) {
      case 'rock':
        mag.rotateX(-inv * 0.9);
        mag.position.y -= inv * height * 0.9;
        mag.position.z -= inv * height * 0.35;
        break;
      case 'belt':
        mag.position.x -= inv * height * 0.6;
        mag.position.y -= inv * height * 1.1;
        break;
      case 'cell':
        mag.position.y += inv * height * 1.5;
        mag.rotateY(t * 0.6);
        break;
      case 'rifle':
        mag.position.y -= inv * height * 1.45;
        mag.position.z += inv * height * 0.25;
        mag.rotateX(inv * 0.12);
        break;
      case 'pistol':
        mag.position.y -= inv * height * 1.5;
        mag.position.z += inv * height * 0.12;
        mag.rotateX(inv * 0.08);
        break;
      default:
        mag.position.y -= inv * height * 1.4;
        break;
    }
    // Seat with a tiny overshoot slap at the very end.
    if (t > 0.85 && this.config.style !== 'cell') {
      mag.position.y += Math.sin(((t - 0.85) / 0.15) * Math.PI) * 0.006;
    }
  }

  private animateHandle(p: number, workAction: boolean): void {
    const handle = this.parts.handle;
    if (!handle || !this.handleHome) return;
    const c = this.config;
    if (!workAction || c.charge < 0 || p < c.charge || p > c.chargeEnd) {
      restoreHome(handle, this.handleHome);
      return;
    }
    const t = (p - c.charge) / (c.chargeEnd - c.charge);
    this.applyHandleMotion(handle, t);
  }

  /** Rack motion: out, dwell, home. Bolt style adds the knob lift. */
  private applyHandleMotion(handle: THREE.Object3D, t: number): void {
    const home = this.handleHome as HomePose;
    handle.position.copy(home.position);
    handle.quaternion.copy(home.quaternion);
    // Pull back over the first 40 %, hold, return by the end.
    const pull = t < 0.4 ? ramp(t, 0, 0.4) : t < 0.55 ? 1 : 1 - ramp(t, 0.55, 1);
    handle.position.z += pull * 0.042;
    if (this.config.style === 'bolt') {
      // Bolt knob: lift, ride back, slam forward, lock down.
      const lift = t < 0.12 ? ramp(t, 0, 0.12) : t > 0.88 ? 1 - ramp(t, 0.88, 1) : 1;
      handle.rotateZ(lift * 0.7);
      handle.position.y += lift * 0.008;
    }
  }

  private animateCover(p: number): void {
    const cover = this.parts.cover;
    if (!cover || !this.coverHome) return;
    const c = this.config;
    if (c.coverOpen === undefined || c.coverClose === undefined) return;
    cover.quaternion.copy(this.coverHome.quaternion);
    const opening = ramp(p, c.coverOpen, c.coverOpen + 0.07);
    const closing = ramp(p, c.coverClose, c.coverClose + 0.07);
    cover.rotateX(-(opening - closing) * 1.85);
  }

  /** Whole-weapon motion flavor per style; the parts are the real show. */
  private animateBody(p: number): void {
    const c = this.config;
    const base = Math.sin(p * Math.PI);
    this.bodyDip = -base * 0.05;
    switch (c.style) {
      case 'rock':
        this.bodyTilt = -base * 0.3;
        this.bodyRoll = pulse(p, c.magOut, c.magSeat) * 0.3 + base * 0.12;
        break;
      case 'belt':
        this.bodyTilt = -base * 0.22;
        // Roll left while the feed cover is up.
        this.bodyRoll =
          -(ramp(p, c.coverOpen ?? 0.2, (c.coverOpen ?? 0.2) + 0.1) -
            ramp(p, c.coverClose ?? 0.7, (c.coverClose ?? 0.7) + 0.1)) * 0.3;
        break;
      case 'bolt':
        this.bodyTilt = -base * 0.26 - pulse(p, c.charge, c.chargeEnd) * 0.1;
        this.bodyRoll = base * 0.14;
        break;
      case 'cell':
        // Tilt up towards the player while the cell is out.
        this.bodyTilt = -base * 0.34;
        this.bodyRoll = base * 0.1;
        this.chargeGlow = pulse(p, c.charge, c.chargeEnd);
        break;
      case 'pistol':
        // One-handed flip: the muzzle dips and the gun cants inboard while
        // the support hand swaps the magazine, then snaps level for the
        // slide release.
        this.bodyTilt = -base * 0.3;
        this.bodyRoll = pulse(p, c.magOut, c.magSeat) * 0.45 + base * 0.08;
        break;
      case 'rifle': {
        const swap = pulse(p, c.magOut, c.magSeat);
        const action = c.charge >= 0 ? pulse(p, c.charge, c.chargeEnd) : 0;
        const seat = pulse(p, c.magIn, Math.min(1, c.magSeat + 0.06));
        this.bodyDip = -base * 0.035 - seat * 0.008;
        this.bodyTilt = -base * 0.18 - action * 0.08;
        this.bodyRoll = swap * 0.18 - action * 0.06;
        break;
      }
      default:
        this.bodyTilt = -base * 0.34;
        this.bodyRoll = base * 0.26;
        break;
    }
  }

  /** Reload interrupted (weapon switch): everything back to battery. */
  private restore(): void {
    if (this.parts.magazine && this.magHome) {
      this.parts.magazine.visible = true;
      restoreHome(this.parts.magazine, this.magHome);
    }
    if (this.parts.handle && this.handleHome) restoreHome(this.parts.handle, this.handleHome);
    if (this.parts.cover && this.coverHome) restoreHome(this.parts.cover, this.coverHome);
    this.bodyDip = 0;
    this.bodyTilt = 0;
    this.bodyRoll = 0;
    this.chargeGlow = 0;
  }
}
