import * as THREE from 'three';
import type { Weapon } from './Weapon';
import type { HandGripConfig, HandPoseId, ReloadAnimConfig, WeaponHandsConfig } from './WeaponTypes';

type HandSide = 'left' | 'right';

interface Grip {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly pose: HandPoseId;
}

/** Hand rotation from a grip axis (thumb side, hand +Y) and palm normal. */
function gripRotation(config: HandGripConfig, side: HandSide): THREE.Quaternion {
  const y = new THREE.Vector3(...config.axis).normalize();
  const palm = new THREE.Vector3(...config.palm);
  palm.addScaledVector(y, -palm.dot(y)).normalize();
  // Right gloves face their palm along -X, left gloves along +X.
  const x = side === 'right' ? palm.negate() : palm;
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

function toGrip(config: HandGripConfig, side: HandSide): Grip {
  return {
    position: new THREE.Vector3(...config.position),
    quaternion: gripRotation(config, side),
    pose: config.pose,
  };
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
 * Glove targets of one weapon view: the configured grips, plus the reload
 * choreography (support hand rides the magazine to a pouch and back) and
 * the action hand on the charging handle or bolt. Targets are read in world
 * space from the animated parts, so hands follow sway, recoil, ADS, equip
 * and the knife dip without duplicating those layers.
 */
export class WeaponHands {
  private readonly anchors: Partial<Record<HandSide, Grip & { readonly pole: THREE.Vector3 }>> = {};
  private readonly magazineGrip: Grip | null = null;
  private readonly actionGrip: Grip | null = null;
  private readonly actionHand: HandSide;
  private state: Weapon['state'] = 'ready';
  private progress = 0;
  private emptyReload = false;

  private readonly blendPosition = new THREE.Vector3();
  private readonly blendRotation = new THREE.Quaternion();
  private readonly worldRotation = new THREE.Quaternion();

  constructor(
    config: WeaponHandsConfig,
    private readonly root: THREE.Object3D,
    private readonly parts: { readonly magazine: THREE.Object3D | null; readonly handle: THREE.Object3D | null },
    private readonly reload: ReloadAnimConfig | null,
    private readonly boltAction: boolean,
  ) {
    for (const side of ['right', 'left'] as const) {
      const anchor = config[side];
      if (anchor) this.anchors[side] = { ...toGrip(anchor, side), pole: new THREE.Vector3(...anchor.pole).normalize() };
    }
    this.actionHand = config.actionHand ?? 'right';
    if (parts.handle && config.action) this.actionGrip = toGrip(config.action, this.actionHand);
    if (parts.magazine && reload && this.anchors.left) {
      const [width, height] = reload.magSize;
      // Default: the support hand closes on the magazine's left flank.
      this.magazineGrip = toGrip(config.magazine ?? {
        position: [-width * 0.15, -height * 0.18, 0],
        axis: [0, 1, 0],
        palm: [1, 0, 0],
        pose: 'magazineGrab',
      }, 'left');
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
   * Writes the world-space grip target of `side`, its hand rotation and the
   * elbow pole direction. Returns the finger pose, or null when the weapon
   * has no grip for that hand.
   */
  read(side: HandSide, position: THREE.Vector3, rotation: THREE.Quaternion, pole: THREE.Vector3): HandPoseId | null {
    const anchor = this.anchors[side];
    if (!anchor) return null;
    this.root.updateWorldMatrix(true, false);
    this.root.getWorldQuaternion(this.worldRotation);
    pole.copy(anchor.pole).applyQuaternion(this.worldRotation);
    this.world(anchor, this.root, position, rotation);
    let pose = anchor.pose;

    if (side === 'left') pose = this.applyMagazine(position, rotation, pose);
    if (side === this.actionHand) pose = this.applyAction(position, rotation, pose);
    return pose;
  }

  /** Support hand: grab the magazine, fetch a fresh one, seat it, return. */
  private applyMagazine(position: THREE.Vector3, rotation: THREE.Quaternion, pose: HandPoseId): HandPoseId {
    const reload = this.reload;
    const magazine = this.parts.magazine;
    const grip = this.magazineGrip;
    if (this.state !== 'reloading' || !reload || !magazine || !grip) return pose;
    const p = this.progress;
    // A pistol magazine falls free: the hand goes straight for the pouch.
    const extract = reload.style !== 'pistol';
    const away = extract ? reload.magDrop : reload.magOut;
    const grab = extract ? ramp(p, reload.magOut - REACH_LEAD, reload.magOut) : 0;
    const toPouch = ramp(p, away, away + (reload.magIn - away) * 0.45);
    const back = ramp(p, away + (reload.magIn - away) * 0.6, reload.magIn);
    const release = ramp(p, reload.magSeat, Math.min(1, reload.magSeat + 0.1));

    magazine.updateWorldMatrix(true, false);
    if (grab > 0) this.blend(position, rotation, grip, magazine, grab);
    if (toPouch > 0) this.blendPouch(position, toPouch);
    if (back > 0) this.blend(position, rotation, grip, magazine, back);
    if (release > 0) this.blend(position, rotation, this.anchors.left as Grip, this.root, release);
    const busy = (extract ? grab : toPouch) > 0.5 && release < 0.5;
    return busy ? grip.pose : pose;
  }

  /** Action hand on the charging handle / bolt / slide while it moves. */
  private applyAction(position: THREE.Vector3, rotation: THREE.Quaternion, pose: HandPoseId): HandPoseId {
    const grip = this.actionGrip;
    const handle = this.parts.handle;
    if (!grip || !handle) return pose;
    let weight = 0;
    const p = this.progress;
    if (this.state === 'reloading' && this.emptyReload && this.reload && this.reload.charge >= 0) {
      weight = ramp(p, this.reload.charge - REACH_LEAD, this.reload.charge) * (1 - ramp(p, this.reload.chargeEnd, 1));
    } else if (this.state === 'cycling' && this.boltAction) {
      weight = ramp(p, 0, 0.12) * (1 - ramp(p, 0.85, 1));
    }
    if (weight <= 0) return pose;
    handle.updateWorldMatrix(true, false);
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
