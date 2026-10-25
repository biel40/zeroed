import * as THREE from 'three';
import type { Weapon } from './Weapon';
import type { MagazineDropPool } from './MagazineDrop';
import type { ReloadAnimConfig, ReloadPhase, ReloadPoseConfig, ReloadStyle } from './WeaponTypes';

/** Charging-handle rack travel in meters. */
export const HANDLE_TRAVEL = 0.042;
/** Share of a rack at which the hand releases the handle, or an open bolt catches on its sear. */
export const HANDLE_RELEASE_FRACTION = 0.55;
const HANDLE_SLAM = 0.08;
/** Actions worked by a spring-loaded handle or slide: let go at the rear, they slam home on their own. */
const SPRING_LOADED: ReadonlySet<ReloadStyle> = new Set(['pistol', 'rifle', 'rock', 'belt']);
/** Bolt-action stroke (meters) and knob lift (radians) of the L96A1 action. */
const BOLT_TRAVEL = 0.085;
const BOLT_LIFT = 0.9;
/** Fraction of an action cycle at which the bolt reaches its rearmost point. */
export const BOLT_REAR_FRACTION = 0.4;
/** Bolt-action box magazine turned towards the eye (roll, then pitch) to show its top. */
const BOLT_MAG_SHOW_ROLL = 0.6;
const BOLT_MAG_SHOW_PITCH = 0.35;
/** Belt feed cover swing (radians): front-hinged, it stands just short of upright. */
const COVER_OPEN = 1.5;
/** Reload share over which the feed cover is slammed shut, landing at coverClose. */
const COVER_SLAM = 0.05;
/** Screw-on canister: bayonet twist (radians) and pull-off stroke (meters). */
const CANISTER_TWIST = 0.85;
const CANISTER_PULL = 0.07;
/** Where the hand carries the canister to refill it, off the bottom of the screen. */
const CANISTER_AWAY = new THREE.Vector3(-0.07, -0.3, 0.1);
const CANISTER_AWAY_TILT = -0.7;
/** Share of the unscrew and screw-on windows spent turning the bayonet. */
const CANISTER_TWIST_SHARE = 0.35;
/** Locked-open pistol slide: the hand tugs it this share past the lock before letting go. */
const SLIDE_SLINGSHOT_OVERTRAVEL = 0.12;
/** Magazine lengths a box magazine travels past its well depth to hang fully clear. */
const BOX_CLEAR = 0.35;
/**
 * Fresh box magazine shown beside the well, in the weapon frame: lateral
 * clearance past its own width (meters, towards the near flank), a little
 * rearward, its top tipped to the eye.
 */
const BOX_SHOW_CLEARANCE = 0.045;
const BOX_SHOW_BACK = 0.012;
const BOX_SHOW_TIP = 0.3;
/** Where the hand brings it in from: off the bottom of the screen (drop in magazine lengths). */
const BOX_FETCH = new THREE.Vector3(-0.03, 0, 0.05);
const BOX_FETCH_DROP = 1.15;
/** AK-style magazine: hooked on its front lug with the base swung this far forward, then rocked home. */
const ROCK_HOOK = 0.45;

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

/** 0→1 over [start, end] gathering speed until it lands: a push or a slam. */
function accelerate(p: number, start: number, end: number): number {
  return Math.min(1, Math.max(0, (p - start) / (end - start))) ** 2;
}

/** Spring settle over t in [0, 1]: a quick swing that dies out, exactly 0 at both ends. */
function dampedWobble(t: number): number {
  return Math.exp(-5 * t) * Math.sin(3 * Math.PI * t);
}

/** 0→1 over [start, end] that arrives fast and swings slightly past 1 before settling (ease-out-back). */
function overshootRamp(p: number, start: number, end: number): number {
  const u = Math.min(1, Math.max(0, (p - start) / (end - start))) - 1;
  return 1 + u * u * (2.2 * u + 1.2);
}

/** Hit envelope over [start, end]: snaps to 1 in its first fifth, then dies away. */
function impact(p: number, start: number, end: number): number {
  if (p <= start || p >= end) return 0;
  const t = (p - start) / (end - start);
  return t < 0.2 ? Math.sin((t / 0.2) * (Math.PI / 2)) : (1 - (t - 0.2) / 0.8) ** 2;
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
  /** Yaw and camera-space offset that bring the weapon up to show the swap. */
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
    const empty = weapon.reloadType === 'empty';
    // An emptied magazine comes out (and drops) without its rounds; the
    // fresh one shows them from the moment the hand brings it in.
    if (this.parts.rounds) this.parts.rounds.visible = !empty || p >= c.magIn;
    this.cross(p, c.magOut, 'magOut');
    this.cross(p, c.magDrop, 'magDrop');
    this.cross(p, c.magIn, 'magIn');
    this.cross(p, c.magSeat, 'magSeat');
    if (empty && c.charge >= 0) {
      this.cross(p, c.charge, 'chargeStart');
      this.cross(p, this.actionHomeAt(), 'chargeEnd');
    }
    if (c.coverOpen !== undefined) this.cross(p, c.coverOpen, 'coverOpen');
    if (c.coverClose !== undefined) this.cross(p, c.coverClose, 'coverClose');

    this.animateMagazine(p);
    this.animateHandle(p, empty);
    this.animateCover(p);
    this.animateBody(p, empty);
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

  /**
   * Progress at which the action is ready: latched rear for an open bolt,
   * back in battery otherwise. A released spring-
   * loaded handle or slide slams home well before the hand has eased off,
   * so its foley and kick land on the impact, not at the end of the window.
   */
  private actionHomeAt(): number {
    const c = this.config;
    if (c.style === 'drum') return c.charge + (c.chargeEnd - c.charge) * HANDLE_RELEASE_FRACTION;
    if (!SPRING_LOADED.has(c.style)) return c.chargeEnd;
    return c.charge + (c.chargeEnd - c.charge) * (HANDLE_RELEASE_FRACTION + HANDLE_SLAM);
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

    if (p >= c.magDrop && p < c.magIn) {
      // On the floor, hidden: wait at the insertion start so the support
      // hand reaching for it meets the fresh magazine where it appears.
      this.applyMagIn(mag, 0, height);
      return;
    }
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
      // Pushed onto the coupling, then the bayonet is snapped shut.
      const pushed = c.magIn + (c.magSeat - c.magIn) * (1 - CANISTER_TWIST_SHARE);
      pull = 1 - ramp(p, c.magIn, pushed);
      twist = 1 - accelerate(p, pushed, c.magSeat);
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
    const clear = ((this.config.wellDepth ?? 1) + BOX_CLEAR) * height;
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
      case 'drum':
      case 'rifle':
        // The hand strips it down out of the well until it hangs clear,
        // tipping it away as it lets go.
        mag.translateY(-ramp(t, 0, 0.85) * clear);
        mag.rotateX(ramp(t, 0.55, 1) * 0.18);
        break;
      case 'pistol': {
        // The release pops it a few millimeters, then it slides out along
        // the raked grip, gathering speed, until it hangs fully clear.
        const pop = ramp(t, 0, 0.18) * 0.005;
        const fall = Math.max(0, (t - 0.12) / 0.88) ** 2 * clear;
        mag.translateY(-(pop + fall));
        mag.rotateX(t * t * 0.2);
        break;
      }
      case 'bolt':
        // Box magazine drawn straight down out of the well, then its open top
        // turned to the eye: an emptied one shows its follower.
        mag.position.y -= ramp(t, 0, 0.7) * height * 1.5;
        mag.rotateZ(ramp(t, 0.6, 1) * BOLT_MAG_SHOW_ROLL);
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
      case 'pistol':
      case 'drum':
      case 'rifle':
      case 'rock':
        this.applyBoxMagIn(mag, t, height);
        return;
      case 'belt':
        mag.position.x -= inv * height * 0.6;
        mag.position.y -= inv * height * 1.1;
        break;
      case 'cell':
        mag.position.y += inv * height * 1.5;
        mag.rotateY(t * 0.6);
        break;
      case 'bolt': {
        // The fresh magazine is held up with its rounds to the eye, then
        // aligned under the well and pushed straight up into it.
        const show = 1 - ramp(t, 0.4, 0.7);
        const lift = 1 - ramp(t, 0.6, 1);
        mag.position.y -= lift * height * 1.4 + show * 0.03;
        mag.position.x -= show * 0.035;
        mag.position.z += show * 0.025;
        mag.rotateZ(show * BOLT_MAG_SHOW_ROLL);
        mag.rotateX(show * BOLT_MAG_SHOW_PITCH);
        break;
      }
    }
    // Seated with a small overshoot at the very end: pushed up into a well,
    // or pressed down into the cell's cage.
    if (t > 0.85) {
      const overshoot = Math.sin(((t - 0.85) / 0.15) * Math.PI) * 0.006;
      mag.position.y += this.config.style === 'cell' ? -overshoot * 0.5 : overshoot;
    }
  }

  /**
   * Box magazine (pistol, rifle, AK): it rises into view beside the well and
   * is held a beat, turning its top round to the eye; it drops below the
   * well before sliding under it (never through the weapon), goes in by its
   * tip and is slammed home a hair past the catch and back, landing just
   * before magSeat so the seat foley meets the impact. An AK magazine is
   * hooked on its front lug, base forward, and rocked home by the slam.
   */
  private applyBoxMagIn(mag: THREE.Object3D, t: number, height: number): void {
    const c = this.config;
    const well = c.wellDepth ?? 1;
    const tipDepth = well - Math.min(0.2, well * 0.4);
    const fetch = 1 - ramp(t, 0, 0.3);
    const lowered = ramp(t, 0.5, 0.6);
    const beside = 1 - ramp(t, 0.56, 0.7);
    const tipIn = ramp(t, 0.7, 0.8);
    const slam = accelerate(t, 0.8, 0.97);
    const below = THREE.MathUtils.lerp(well * 0.45, well, lowered) * (1 - tipIn) + tipDepth * tipIn * (1 - slam);
    const hook = c.style === 'rock' ? ROCK_HOOK * lowered * (1 - slam) : 0;
    mag.position.x -= beside * (BOX_SHOW_CLEARANCE + c.magSize[0]);
    mag.position.z += beside * BOX_SHOW_BACK;
    mag.position.addScaledVector(BOX_FETCH, fetch);
    mag.position.y -= fetch * BOX_FETCH_DROP * height;
    mag.rotateZ((beside + fetch) * BOX_SHOW_TIP);
    mag.rotateX(fetch * 0.5 + hook);
    mag.rotateY(pulse(t, 0.25, 0.55) * 0.25);
    mag.translateY(-below * height + pulse(t, 0.97, 1) * 0.003);
  }

  private animateHandle(p: number, workAction: boolean): void {
    const handle = this.parts.handle;
    if (!handle || !this.handleHome) return;
    const c = this.config;
    if (c.style === 'drum' && workAction && c.charge >= 0) {
      // Open-bolt SMGs finish an empty magazine with the bolt forward. The
      // charging stroke catches it on the rear sear; there is no forward slam.
      restoreHome(handle, this.handleHome);
      handle.position.z -= HANDLE_TRAVEL * (1 - ramp(p, c.charge, this.actionHomeAt()));
      return;
    }
    // An emptied pistol stays open on its slide stop until the slide is released.
    const lockedOpen = workAction && c.style === 'pistol';
    if (lockedOpen && p < c.charge) {
      restoreHome(handle, this.handleHome);
      handle.position.z += HANDLE_TRAVEL;
      return;
    }
    if (!workAction || c.charge < 0 || p < c.charge || p > c.chargeEnd) {
      restoreHome(handle, this.handleHome);
      return;
    }
    const t = (p - c.charge) / (c.chargeEnd - c.charge);
    this.applyHandleMotion(handle, t, lockedOpen);
  }

  /**
   * Rack motion: out, dwell, home. Bolt style adds the knob lift; a slide
   * locked open starts at the rear and is slingshot off the lock instead.
   */
  private applyHandleMotion(handle: THREE.Object3D, t: number, lockedOpen = false): void {
    const home = this.handleHome as HomePose;
    handle.position.copy(home.position);
    handle.quaternion.copy(home.quaternion);
    const bolt = this.config.style === 'bolt';
    // Pull back over the first 40 % and hold. The hand pushes a bolt home by
    // the end; a spring-loaded slide or handle is let go and slams home.
    const slam = 1 - ramp(t, HANDLE_RELEASE_FRACTION, bolt ? 1 : HANDLE_RELEASE_FRACTION + HANDLE_SLAM);
    const pull = lockedOpen
      ? t < HANDLE_RELEASE_FRACTION
        ? 1 + pulse(t, 0.1, HANDLE_RELEASE_FRACTION) * SLIDE_SLINGSHOT_OVERTRAVEL
        : slam
      : t < BOLT_REAR_FRACTION
        ? ramp(t, 0, BOLT_REAR_FRACTION)
        : t < HANDLE_RELEASE_FRACTION
          ? 1
          : slam;
    handle.position.z += pull * (bolt ? BOLT_TRAVEL : HANDLE_TRAVEL);
    if (bolt) {
      // The bolt group pivots on the bore axis: lift the knob, ride back,
      // slam forward and lock down.
      const lift = t < 0.12 ? ramp(t, 0, 0.12) : t > 0.88 ? 1 - ramp(t, 0.88, 1) : 1;
      handle.rotateZ(lift * BOLT_LIFT);
    }
  }

  /** Feed cover: swung open on its latch, then slammed shut to land on coverClose. */
  private animateCover(p: number): void {
    const cover = this.parts.cover;
    if (!cover || !this.coverHome) return;
    const c = this.config;
    if (c.coverOpen === undefined || c.coverClose === undefined) return;
    cover.quaternion.copy(this.coverHome.quaternion);
    const opening = ramp(p, c.coverOpen, c.coverOpen + 0.07);
    const closing = accelerate(p, c.coverClose - COVER_SLAM, c.coverClose);
    cover.rotateX(-(opening - closing) * COVER_OPEN);
  }

  /**
   * Whole-weapon showcase, shared by every style and shaped by the weapon's
   * poses: it comes up with the swap turned to the eye (arriving with a
   * touch of overshoot), shakes at the release, leans to meet the fresh
   * magazine, jumps at the seat slap (and the feed cover slam) and, on an
   * empty reload, turns the action to the eye, is pushed against the pull
   * and kicks as the action slams home. It springs back to the hip with a
   * short, damped wobble. Energy weapons add their glow on top.
   */
  private animateBody(p: number, empty: boolean): void {
    const c = this.config;
    const racks = empty && c.rackPose !== undefined && c.charge >= 0;
    const springs = racks && SPRING_LOADED.has(c.style);
    const swapEnd = c.coverClose ?? c.magSeat;
    const letGo = c.charge + (c.chargeEnd - c.charge) * HANDLE_RELEASE_FRACTION;
    const home = this.actionHomeAt();
    // The rack pose takes over from the swap pose as a crossfade, swinging
    // slightly past it before it settles.
    const toRack = racks ? overshootRamp(p, swapEnd, c.charge) : 0;
    const swap = overshootRamp(p, 0, c.magOut) * (racks ? 1 - Math.min(1, toRack) : 1 - ramp(p, swapEnd, 1));
    const rack = toRack * (1 - ramp(p, c.chargeEnd, 1));
    const shake = impact(p, c.magOut + 0.015, c.magOut + 0.07);
    const lean = pulse(p, c.magDrop, c.magIn + 0.1);
    const seat = impact(p, c.magSeat - 0.006, c.magSeat + 0.06)
      + (c.coverClose !== undefined ? impact(p, c.coverClose - 0.006, c.coverClose + 0.06) : 0);
    const pull = springs || (racks && c.style === 'drum') ? pulse(p, c.charge, letGo) : 0;
    const slam = racks && c.style !== 'drum' ? impact(p, home - 0.002, home + 0.07) : 0;
    const settleFrom = racks ? c.chargeEnd : swapEnd + 0.04;
    const settle = p > settleFrom ? dampedWobble((p - settleFrom) / (1 - settleFrom)) : 0;
    const swapPose = c.swapPose;
    const rackPose: ReloadPoseConfig = c.rackPose ?? swapPose;
    this.bodyDip = -shake * 0.01 + seat * 0.017 + slam * 0.006;
    this.bodyTilt = swap * swapPose.tilt + rack * rackPose.tilt
      - shake * 0.06 - lean * 0.04 - seat * 0.08 + slam * 0.12 + settle * 0.04;
    this.bodyRoll = swap * swapPose.roll + rack * rackPose.roll
      - shake * 0.1 - lean * 0.05 + seat * 0.03 + settle * 0.08;
    this.bodyYaw = swap * swapPose.yaw + rack * rackPose.yaw + lean * 0.06;
    this.bodyShift.fromArray(swapPose.shift).multiplyScalar(swap);
    this.bodyShift.x += rack * rackPose.shift[0];
    this.bodyShift.y += rack * rackPose.shift[1];
    this.bodyShift.z += rack * rackPose.shift[2] + slam * 0.016 - pull * 0.012;

    const spinUp = c.charge >= 0 ? pulse(p, c.charge, c.chargeEnd) : 0;
    if (c.style === 'cell') this.chargeGlow = spinUp;
    else if (c.style === 'canister') {
      // The plasma dims while the canister is off and surges once it is locked on.
      const off = ramp(p, c.magOut, c.magDrop) * (1 - ramp(p, c.magIn, c.magSeat));
      this.chargeGlow = spinUp - off * 0.45;
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
