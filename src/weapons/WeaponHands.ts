import * as THREE from 'three';
import { fitHandPose, HAND_POSES, holdGripPoint } from './HandPoses';
import type { HandPose, HeldPart } from './HandPoses';
import { HANDLE_RELEASE_FRACTION, HANDLE_TRAVEL } from './ReloadAnimator';
import type { Weapon } from './Weapon';
import type { HandGripConfig, ReloadAnimConfig, WeaponHandsConfig } from './WeaponTypes';

type HandSide = 'left' | 'right';

interface Grip {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly pose: HandPose;
}

/** Hand rotation from a grip axis (thumb side, hand +Y) and palm normal. */
function gripRotation(config: HandGripConfig, side: HandSide): THREE.Quaternion {
  const y = new THREE.Vector3(...config.axis).normalize();
  const palm = new THREE.Vector3(...config.palm);
  palm.addScaledVector(y, -palm.dot(y)).normalize();
  // Right hands face their palm along -X, left hands along +X.
  const x = side === 'right' ? palm.negate() : palm;
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** How far under the sight line a resting grip keeps its fingers. */
const SIGHT_CLEARANCE = 0.01;

/** Fitted poses per static grip config; every config belongs to one hand. */
const fittedPoses = new WeakMap<HandGripConfig, HandPose>();

/**
 * Finger pose of a grip: the authored pose, with its wrapping fingers closed
 * on the held part and the index on the trigger when the config sizes them.
 */
function gripPose(config: HandGripConfig, quaternion: THREE.Quaternion, side: HandSide, sightLine: number | null): HandPose {
  let pose = HAND_POSES[config.pose];
  if (!config.hold && !config.trigger) return pose;
  const cached = fittedPoses.get(config);
  if (cached) return cached;
  // Part-space directions as the hand sees them, in the right-hand convention.
  const toHand = quaternion.clone().invert();
  const inHand = (vector: THREE.Vector3): THREE.Vector3 => {
    vector.applyQuaternion(toHand);
    if (side === 'left') vector.x = -vector.x;
    return vector;
  };
  let part: HeldPart | null = null;
  if (config.hold) {
    // Section axes: across the weapon, and normal to that and the part's length.
    const length = new THREE.Vector3(...config.hold.axis).normalize();
    const across = new THREE.Vector3(1, 0, 0).addScaledVector(length, -length.x).normalize();
    const through = new THREE.Vector3().crossVectors(length, across);
    const [width, depth] = config.hold.size;
    const section = { across: inHand(across), through: inHand(through), halfWidth: width / 2, halfDepth: depth / 2 };
    pose = { ...pose, grip: holdGripPoint(pose, section) };
    // The fingers stay under the sight line so they never cover the sights.
    const ceiling = sightLine === null ? undefined : {
      normal: inHand(new THREE.Vector3(0, 1, 0)),
      height: sightLine - SIGHT_CLEARANCE - config.position[1],
    };
    // `position` is the part's center, so it sits on the grip point.
    part = { center: new THREE.Vector3(...pose.grip), ...section, ceiling };
  }
  // The trigger as seen from the wrist: `position` sits on the grip point.
  const trigger = config.trigger ? {
    point: inHand(new THREE.Vector3(...config.trigger).sub(new THREE.Vector3(...config.position)))
      .add(new THREE.Vector3(...pose.grip)),
    across: inHand(new THREE.Vector3(1, 0, 0)),
    through: inHand(new THREE.Vector3(0, 0, 1)),
  } : null;
  pose = fitHandPose(pose, part, trigger);
  fittedPoses.set(config, pose);
  return pose;
}

function toGrip(config: HandGripConfig, side: HandSide, sightLine: number | null = null): Grip {
  const quaternion = gripRotation(config, side);
  return { position: new THREE.Vector3(...config.position), quaternion, pose: gripPose(config, quaternion, side, sightLine) };
}

/** 0→1 eased ramp over [start, end]. */
function ramp(p: number, start: number, end: number): number {
  return THREE.MathUtils.smoothstep(p, start, end);
}

/** Camera-space "pouch" the support hand fetches a fresh magazine from. */
const POUCH_POSITION = new THREE.Vector3(-0.2, -0.62, -0.3);
/** How early the support hand leaves to meet the magazine. */
const REACH_LEAD = 0.07;

/**
 * Hand targets of one weapon view: the configured grips, plus the reload
 * choreography (support hand rides the magazine to a pouch and back) and
 * the action hand on the charging handle or bolt. Targets are read in world
 * space from the animated parts, so hands follow sway, recoil, ADS, equip
 * and the knife dip without duplicating those layers.
 */
export class WeaponHands {
  private readonly anchors: Partial<Record<HandSide, Grip>> = {};
  private readonly magazineGrip: Grip | null = null;
  private readonly actionGrip: Grip | null = null;
  private readonly actionHand: HandSide;
  private state: Weapon['state'] = 'ready';
  private progress = 0;
  private emptyReload = false;

  /** Handle at the end of its stroke, in its parent's frame: where the hand lets go. */
  private readonly handleRear: THREE.Matrix4 | null = null;

  private readonly blendPosition = new THREE.Vector3();
  private readonly blendRotation = new THREE.Quaternion();
  private readonly rearFrame = new THREE.Matrix4();
  private readonly rearScale = new THREE.Vector3();

  constructor(
    config: WeaponHandsConfig,
    private readonly root: THREE.Object3D,
    private readonly parts: { readonly magazine: THREE.Object3D | null; readonly handle: THREE.Object3D | null },
    private readonly reload: ReloadAnimConfig | null,
    private readonly boltAction: boolean,
    /** Height of the sight line in the root frame; the resting grips keep their fingers under it. */
    sightLine: number,
  ) {
    for (const side of ['right', 'left'] as const) {
      const anchor = config[side];
      if (anchor) this.anchors[side] = toGrip(anchor, side, sightLine);
    }
    this.actionHand = config.actionHand ?? 'right';
    if (parts.handle && config.action) {
      this.actionGrip = toGrip(config.action, this.actionHand);
      if (reload && reload.style !== 'bolt') {
        parts.handle.updateMatrix();
        // Open-bolt models are authored cocked: their home is already the rear sear.
        this.handleRear = new THREE.Matrix4().makeTranslation(0, 0, reload.style === 'drum' ? 0 : HANDLE_TRAVEL)
          .multiply(parts.handle.matrix);
      }
    }
    // The support hand rides the magazine only where the weapon declares how it holds it.
    if (parts.magazine && reload && config.magazine) {
      this.magazineGrip = toGrip(config.magazine, 'left');
    }
  }

  /** Samples the weapon state that drives the reload and action hands. */
  update(weapon: Weapon): void {
    this.state = weapon.state;
    this.progress = weapon.stateProgress;
    this.emptyReload = weapon.reloadType === 'empty';
  }

  /** Clears transient state so the hands return to their grips at once. */
  reset(): void {
    this.state = 'ready';
    this.progress = 0;
  }

  /**
   * Writes the world-space grip target of `side` and its hand rotation.
   * Returns the finger pose, or null when the weapon has no grip for that
   * hand.
   */
  read(side: HandSide, position: THREE.Vector3, rotation: THREE.Quaternion): HandPose | null {
    const anchor = this.anchors[side];
    if (!anchor) return side === 'left' ? this.readReloadOnlyHand(position, rotation) : null;
    this.root.updateWorldMatrix(true, false);
    this.world(anchor, this.root, position, rotation);
    let pose = anchor.pose;

    if (side === 'left') pose = this.applyMagazine(position, rotation, pose);
    if (side === this.actionHand) pose = this.applyAction(position, rotation, pose);
    return pose;
  }

  /** Support hand: grab the magazine, fetch a fresh one, seat it, return. */
  private applyMagazine(position: THREE.Vector3, rotation: THREE.Quaternion, pose: HandPose): HandPose {
    const reload = this.reload;
    const magazine = this.parts.magazine;
    const grip = this.magazineGrip;
    if (this.state !== 'reloading' || !reload || !magazine || !grip) return pose;
    const p = this.progress;
    // A pistol magazine falls free: the hand goes straight for the pouch.
    const extract = reload.style !== 'pistol';
    // A canister is never let go: the hand carries it off screen and back.
    const fetch = reload.style !== 'canister';
    const away = extract ? reload.magDrop : reload.magOut;
    const grab = extract ? ramp(p, reload.magOut - REACH_LEAD, reload.magOut) : 0;
    const toPouch = fetch ? ramp(p, away, away + (reload.magIn - away) * 0.45) : 0;
    const back = fetch ? ramp(p, away + (reload.magIn - away) * 0.6, reload.magIn) : 0;
    const release = ramp(p, reload.magSeat, Math.min(1, reload.magSeat + 0.1));

    magazine.updateWorldMatrix(true, false);
    if (grab > 0) this.blend(position, rotation, grip, magazine, grab);
    if (toPouch > 0) this.blendPouch(position, toPouch);
    if (back > 0) this.blend(position, rotation, grip, magazine, back);
    if (release > 0) this.blend(position, rotation, this.anchors.left as Grip, this.root, release);
    const busy = (extract ? grab : toPouch) > 0.5 && release < 0.5;
    return busy ? grip.pose : pose;
  }

  /**
   * One-handed weapons: the support hand only shows during a reload, rising
   * from the pouch onto the magazine and dropping back there once it seats.
   */
  private readReloadOnlyHand(position: THREE.Vector3, rotation: THREE.Quaternion): HandPose | null {
    const reload = this.reload;
    const magazine = this.parts.magazine;
    const grip = this.magazineGrip;
    if (this.state !== 'reloading' || !reload || !magazine || !grip) return null;
    const p = this.progress;
    const weight = ramp(p, reload.magOut - REACH_LEAD, reload.magOut)
      * (1 - ramp(p, reload.magSeat, Math.min(1, reload.magSeat + 0.1)));
    if (weight <= 0) return null;
    magazine.updateWorldMatrix(true, false);
    this.world(grip, magazine, position, rotation);
    this.blendPosition.copy(position);
    position.copy(POUCH_POSITION);
    this.root.parent?.localToWorld(position);
    position.lerp(this.blendPosition, weight);
    return grip.pose;
  }

  /** Action hand on the charging handle / bolt / slide while it moves. */
  private applyAction(position: THREE.Vector3, rotation: THREE.Quaternion, pose: HandPose): HandPose {
    const grip = this.actionGrip;
    const handle = this.parts.handle;
    if (!grip || !handle) return pose;
    let weight = 0;
    let released = false;
    const p = this.progress;
    if (this.state === 'reloading' && this.emptyReload && this.reload && this.reload.charge >= 0) {
      const { charge, chargeEnd } = this.reload;
      weight = ramp(p, charge - REACH_LEAD, charge) * (1 - ramp(p, chargeEnd, 1));
      // Release at the rear of the stroke: an open bolt stays on its sear,
      // while a spring-loaded handle slams home as the hand eases back.
      const letGo = charge + (chargeEnd - charge) * HANDLE_RELEASE_FRACTION;
      if (this.handleRear && p >= letGo) {
        released = true;
        weight = 1 - ramp(p, letGo, chargeEnd);
      }
    } else if (this.state === 'cycling' && this.boltAction) {
      weight = ramp(p, 0, 0.12) * (1 - ramp(p, 0.85, 1));
    }
    if (weight <= 0) return pose;
    handle.updateWorldMatrix(true, false);
    if (released && this.handleRear && handle.parent) {
      this.rearFrame.multiplyMatrices(handle.parent.matrixWorld, this.handleRear).decompose(this.blendPosition, this.blendRotation, this.rearScale);
      this.blendPosition.copy(grip.position).applyMatrix4(this.rearFrame);
      this.blendRotation.multiply(grip.quaternion);
      position.lerp(this.blendPosition, weight);
      rotation.slerp(this.blendRotation, weight);
      return weight > 0.5 ? HAND_POSES.relaxed : pose;
    }
    this.blend(position, rotation, grip, handle, weight);
    return weight > 0.5 ? grip.pose : pose;
  }

  private world(grip: Grip, frame: THREE.Object3D, position: THREE.Vector3, rotation: THREE.Quaternion): void {
    frame.localToWorld(position.copy(grip.position));
    frame.getWorldQuaternion(rotation).multiply(grip.quaternion);
  }

  private blend(position: THREE.Vector3, rotation: THREE.Quaternion, grip: Grip, frame: THREE.Object3D, weight: number): void {
    this.world(grip, frame, this.blendPosition, this.blendRotation);
    position.lerp(this.blendPosition, weight);
    rotation.slerp(this.blendRotation, weight);
  }

  /** The pouch hangs off the camera (the weapon root's parent); it is off
   * screen, so the hand keeps its current rotation on the way. */
  private blendPouch(position: THREE.Vector3, weight: number): void {
    const camera = this.root.parent;
    this.blendPosition.copy(POUCH_POSITION);
    if (camera) camera.localToWorld(this.blendPosition);
    position.lerp(this.blendPosition, weight);
  }
}
