import * as THREE from 'three';
import type { Weapon } from './Weapon';
import type { MagazineDropPool } from './MagazineDrop';
import type { ReloadAnimConfig, ReloadPhase } from './WeaponTypes';

/** Charging-handle rack travel in meters. */
export const HANDLE_TRAVEL = 0.042;
/** Share of a rack at which the hand lets the spring-loaded handle go; it slams home over the next few. */
export const HANDLE_RELEASE_FRACTION = 0.55;
const HANDLE_SLAM = 0.08;
/** Bolt-action stroke (meters) and knob lift (radians) of the L96A1 action. */
const BOLT_TRAVEL = 0.085;
const BOLT_LIFT = 0.9;
/** Fraction of an action cycle at which the bolt reaches its rearmost point. */
export const BOLT_REAR_FRACTION = 0.4;
/**
 * Bolt-action magazine swap: the rifle turns its left flank to the eye and
 * moves into the middle of the screen so its whole length shows.
 */
const RIFLE_SHOW_YAW = 0.5;
const RIFLE_SHOW_SHIFT = new THREE.Vector3(-0.07, 0.05, -0.24);
/** Box magazine turned towards the eye (roll, then pitch) to show its top. */
const BOX_SHOW_ROLL = 0.6;
const BOX_SHOW_PITCH = 0.35;
/** Belt feed cover swing (radians): front-hinged, it stands just short of upright. */
const COVER_OPEN = 1.5;
/** Screw-on canister: bayonet twist (radians) and pull-off stroke (meters). */
const CANISTER_TWIST = 0.85;
const CANISTER_PULL = 0.07;
/** Where the hand carries the canister to refill it, off the bottom of the screen. */
const CANISTER_AWAY = new THREE.Vector3(-0.07, -0.3, 0.1);
const CANISTER_AWAY_TILT = -0.7;
/** Share of the unscrew and screw-on windows spent turning the bayonet. */
const CANISTER_TWIST_SHARE = 0.35;

/** View-model parts the animator drives; any of them may be absent. */
export interface ReloadParts {
  /** Detachable magazine / power cell (Mesh or small Group). */
  magazine: THREE.Object3D | null;
  /** Charging handle / bolt knob. */
  handle: THREE.Object3D | null;
  /** Belt feed cover pivot (rotates open). */
  cover: THREE.Object3D | null;
  /** Cartridges riding on the magazine: hidden while an emptied one is out. */
  rounds?: THREE.Object3D | null;
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
  /** Yaw and camera-space offset that swing a long rifle out to show it whole. */
  bodyYaw = 0;
  readonly bodyShift = new THREE.Vector3();
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
    // An emptied magazine comes out (and drops) without its rounds; the
    // fresh one shows them from the moment the hand brings it in.
    if (this.parts.rounds) this.parts.rounds.visible = weapon.reloadType !== 'empty' || p >= c.magIn;
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

  /** Immediate cleanup for hidden/restarted view models. */
  reset(): void {
    this.restore();
    this.fired.clear();
    this.wasReloading = false;
  }

  private cross(p: number, threshold: number, phase: ReloadPhase): void {
    if (p < threshold || this.fired.has(phase)) return;
    this.fired.add(phase);
    if (phase === 'magDrop' && this.parts.magazine && this.config.style !== 'canister') {
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
    if (c.style === 'canister') {
      this.applyCanister(mag, p);
      return;
    }

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

  /**
   * Screw-on canister, never dropped: twist the bayonet open and pull it off
   * the coupling, carry it off screen to refill, bring it back, push it home
   * and twist it locked with a small snap.
   */
  private applyCanister(canister: THREE.Object3D, p: number): void {
    const home = this.magHome as HomePose;
    const c = this.config;
    canister.position.copy(home.position);
    canister.quaternion.copy(home.quaternion);
    if (p < c.magOut || p >= c.magSeat) return;

    let twist = 1;
    let pull = 1;
    let away = 0;
    let snap = 0;
    if (p < c.magDrop) {
      const turned = c.magOut + (c.magDrop - c.magOut) * CANISTER_TWIST_SHARE;
      twist = ramp(p, c.magOut, turned);
      pull = ramp(p, turned, c.magDrop);
    } else if (p < c.magIn) {
      const lead = (c.magIn - c.magDrop) * 0.4;
      away = ramp(p, c.magDrop, c.magDrop + lead) * (1 - ramp(p, c.magIn - lead, c.magIn));
    } else {
      const pushed = c.magIn + (c.magSeat - c.magIn) * (1 - CANISTER_TWIST_SHARE);
      pull = 1 - ramp(p, c.magIn, pushed);
      twist = 1 - ramp(p, pushed, c.magSeat);
      snap = pulse(p, pushed, c.magSeat);
    }
    canister.position.z -= pull * CANISTER_PULL - snap * 0.002;
    canister.position.addScaledVector(CANISTER_AWAY, away);
    canister.rotateX(away * CANISTER_AWAY_TILT);
    canister.rotateZ(twist * CANISTER_TWIST);
  }

  /** Magazine leaving the weapon, per style. t: 0 (seated) → 1 (free). */
  private applyMagOut(mag: THREE.Object3D, t: number, height: number): void {
    const home = this.magHome as HomePose;
    mag.position.copy(home.position);
    mag.quaternion.copy(home.quaternion);
    switch (this.config.style) {
      case 'rock':
        // AK rock: pivot on the front lug so the base swings forward, then away.
        mag.rotateX(t * 0.9);
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
      case 'bolt':
        // Box magazine drawn straight down out of the well, then its open top
        // turned to the eye: an emptied one shows its follower.
        mag.position.y -= ramp(t, 0, 0.7) * height * 1.5;
        mag.rotateZ(ramp(t, 0.6, 1) * BOX_SHOW_ROLL);
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
        mag.rotateX(inv * 0.9);
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
      case 'bolt': {
        // The fresh magazine is held up with its rounds to the eye, then
        // aligned under the well and pushed straight up into it.
        const show = 1 - ramp(t, 0.4, 0.7);
        const lift = 1 - ramp(t, 0.6, 1);
        mag.position.y -= lift * height * 1.4 + show * 0.03;
        mag.position.x -= show * 0.035;
        mag.position.z += show * 0.025;
        mag.rotateZ(show * BOX_SHOW_ROLL);
        mag.rotateX(show * BOX_SHOW_PITCH);
        break;
      }
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
    const bolt = this.config.style === 'bolt';
    // Pull back over the first 40 % and hold. The hand pushes a bolt home by
    // the end; a spring-loaded slide or handle is let go and slams home.
    const pull = t < BOLT_REAR_FRACTION
      ? ramp(t, 0, BOLT_REAR_FRACTION)
      : t < HANDLE_RELEASE_FRACTION
        ? 1
        : 1 - ramp(t, HANDLE_RELEASE_FRACTION, bolt ? 1 : HANDLE_RELEASE_FRACTION + HANDLE_SLAM);
    handle.position.z += pull * (bolt ? BOLT_TRAVEL : HANDLE_TRAVEL);
    if (bolt) {
      // The bolt group pivots on the bore axis: lift the knob, ride back,
      // slam forward and lock down.
      const lift = t < 0.12 ? ramp(t, 0, 0.12) : t > 0.88 ? 1 - ramp(t, 0.88, 1) : 1;
      handle.rotateZ(lift * BOLT_LIFT);
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
    cover.rotateX(-(opening - closing) * COVER_OPEN);
  }

  /** Whole-weapon motion flavor per style; the parts are the real show. */
  private animateBody(p: number): void {
    const c = this.config;
    const base = Math.sin(p * Math.PI);
    this.bodyDip = -base * 0.05;
    this.bodyYaw = 0;
    this.bodyShift.set(0, 0, 0);
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
      case 'bolt': {
        // The long rifle swings out across the screen, left flank to the eye,
        // for the magazine swap, then goes back on the shoulder for the bolt.
        const present = ramp(p, 0, c.magOut) * (1 - ramp(p, c.magSeat, c.charge));
        const seat = pulse(p, c.magSeat - 0.03, c.magSeat + 0.03);
        this.bodyDip = -seat * 0.006;
        this.bodyTilt = -present * 0.08 - pulse(p, c.charge, c.chargeEnd) * 0.1;
        this.bodyRoll = -present * 0.24;
        this.bodyYaw = present * RIFLE_SHOW_YAW;
        this.bodyShift.copy(RIFLE_SHOW_SHIFT).multiplyScalar(present);
        break;
      }
      case 'cell':
        // Tilt up towards the player while the cell is out.
        this.bodyTilt = -base * 0.34;
        this.bodyRoll = base * 0.1;
        this.chargeGlow = pulse(p, c.charge, c.chargeEnd);
        break;
      case 'canister': {
        // Tilted up and canted inboard towards the support hand; the plasma
        // dims while the canister is off and surges once it is locked on.
        const off = ramp(p, c.magOut, c.magDrop) * (1 - ramp(p, c.magIn, c.magSeat));
        this.bodyTilt = -base * 0.22;
        this.bodyRoll = off * 0.3 + base * 0.06;
        this.chargeGlow = pulse(p, c.charge, c.chargeEnd) - off * 0.45;
        break;
      }
      case 'pistol':
        // The muzzle dips and the gun cants inboard during the magazine swap,
        // then snaps level for the slide release.
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
    if (this.parts.rounds) this.parts.rounds.visible = true;
    if (this.parts.handle && this.handleHome) restoreHome(this.parts.handle, this.handleHome);
    if (this.parts.cover && this.coverHome) restoreHome(this.parts.cover, this.coverHome);
    this.bodyDip = 0;
    this.bodyTilt = 0;
    this.bodyRoll = 0;
    this.bodyYaw = 0;
    this.bodyShift.set(0, 0, 0);
    this.chargeGlow = 0;
  }
}
