import * as THREE from 'three';
import type { HitTarget } from '../../shooting/HitTarget';
import type { CaptainUssrBrain, CaptainUssrHitPart, CaptainUssrState } from './CaptainUssrBrain';
import { buildCaptainUssr, CAPTAIN_USSR_BODY, SHIELD_RADIUS, type CaptainUssrRig } from './CaptainUssrModel';
import { anticipation, Flinch, ROAR_SECONDS, roarWeight } from './CaptainUssrMotion';

/** What the view reads from the brain each frame. */
export type CaptainUssrSnapshot = Pick<CaptainUssrBrain,
  'state' | 'stateProgress' | 'position' | 'heading' | 'speed' | 'shieldHeld' | 'shield' | 'phase'>;

/** How fast joints chase their pose (per second): snappy, never instant. */
const POSE_RATE = 12;
/** Height of the flying shield over the ground. */
const SHIELD_FLIGHT_Y = 1.3;
/** Radians per second the thrown shield spins. */
const SHIELD_SPIN = 22;
/** Seconds of the red tint a landed hit leaves on the suit. */
const FLASH_SECONDS = 0.14;
/** How high the leap arcs over the straight line between its ends. */
const LEAP_ARC = 3;
/** Seconds the death takes: the knees buckle first (`KNEEL_SHARE` of it), then it topples back. */
const FALL_SECONDS = 1.7;
const KNEEL_SHARE = 0.4;
/** How far a full flinch throws the body and the head back, and a blocked shot the shield (rad, m). */
const FLINCH = { body: 0.2, head: 0.4, shieldPitch: 0.3, shieldBack: 0.12 } as const;
/** Breathing while it stands still: rad/s and how deep. */
const BREATH = { rate: 1.8, depth: 0.035 } as const;

/** A pose: every joint angle and where the shield rides while held, in the body's frame. */
interface Pose {
  bodyDrop: number;
  bodyPitch: number;
  bodyRoll: number;
  torsoYaw: number;
  headPitch: number;
  shoulderX: [number, number];
  shoulderZ: [number, number];
  elbowX: [number, number];
  hipX: [number, number];
  kneeX: [number, number];
  shield: THREE.Vector3;
  shieldYaw: number;
  shieldPitch: number;
}

function emptyPose(): Pose {
  return {
    bodyDrop: 0, bodyPitch: 0, bodyRoll: 0, torsoYaw: 0, headPitch: 0,
    shoulderX: [0, 0], shoulderZ: [0, 0], elbowX: [0, 0], hipX: [0, 0], kneeX: [0, 0],
    shield: new THREE.Vector3(), shieldYaw: 0, shieldPitch: 0,
  };
}

function surface(kind: HitTarget['surface']): HitTarget {
  return { acceptsDecals: false, surface: kind, onHit: () => undefined };
}

/**
 * Three.js presentation of CAPITÁN URSS: it poses the procedural body from
 * the brain's state (guard and march, bash, backhand throw, charge, stun,
 * leap and fall), flies the shield while it is out, flashes on hits and
 * owns the invisible hitboxes (`userData.guardianPart`) that the mode puts
 * in the ballistics while the fight lasts. It decides nothing.
 */
export class CaptainUssrView {
  public readonly group = new THREE.Group();
  public readonly hitboxes: readonly THREE.Mesh[];
  private readonly rig: CaptainUssrRig;
  private readonly hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
  private readonly pose = emptyPose();
  private readonly target = emptyPose();
  private readonly worldPosition = new THREE.Vector3();
  private readonly worldQuaternion = new THREE.Quaternion();
  private readonly leapStart = new THREE.Vector3();
  private previous: CaptainUssrState = 'dormant';
  /** The current recovery follows a bash: the shield is driven forward first. */
  private bashFollowThrough = false;
  private stateTime = 0;
  private time = 0;
  private stride = 0;
  private spin = 0;
  private flashLeft = 0;
  private readonly flinch = new Flinch();
  private readonly shieldRecoil = new Flinch();
  /** Seconds into the current roar; `ROAR_SECONDS` or more when none plays. */
  private roarTime = ROAR_SECONDS;
  private lastPhase = 1;
  /** Shown on its perch before a filmed entrance's leap, facing `perchHeading`. */
  private perched = false;
  private readonly perchAt = new THREE.Vector3();
  private perchHeading = 0;
  /** The next frame snaps every joint to its pose instead of easing (it just appeared). */
  private snapPose = false;

  public constructor(castShadow: boolean) {
    this.rig = buildCaptainUssr(castShadow);
    this.group.name = 'captain-ussr-view';
    this.group.add(this.rig.root, this.rig.shield);
    const flesh = surface('flesh');
    const B = CAPTAIN_USSR_BODY;
    this.hitboxes = [
      this.hitbox(this.rig.body, new THREE.CapsuleGeometry(0.3, 0.72, 4, 10), 'torso', flesh, 0, 0.42, 0),
      this.hitbox(this.rig.body, new THREE.BoxGeometry(0.5, B.hips, 0.32), 'torso', flesh, 0, -B.hips / 2, 0),
      this.hitbox(this.rig.head, new THREE.SphereGeometry(0.19, 12, 10), 'head', flesh, 0, 0.12, 0),
      this.hitbox(this.rig.shield, new THREE.CylinderGeometry(SHIELD_RADIUS + 0.03, SHIELD_RADIUS + 0.03, 0.16, 20).rotateX(Math.PI / 2), 'shield', surface('metal'), 0, 0, 0.05),
    ];
    this.group.visible = false;
  }

  /** A landed hit: the suit flushes red for a moment and the body jolts back by `strength` (0..1). */
  public flash(strength = 1): void {
    this.flashLeft = FLASH_SECONDS;
    this.flinch.kick(strength);
  }

  /** A shot rang off the shield: it is knocked back against the arm. */
  public block(): void {
    this.shieldRecoil.kick(1);
  }

  /** Before a filmed entrance's leap: crouched at `at` facing `heading`, until the brain wakes. */
  public perch(at: THREE.Vector3Like, heading: number): void {
    this.perched = true;
    this.perchAt.set(at.x, at.y, at.z);
    this.perchHeading = heading;
    this.roarTime = ROAR_SECONDS;
    this.snapPose = true;
  }

  /** Rears up and roars now, over whatever it is doing. */
  public roar(): void {
    this.roarTime = 0;
  }

  /**
   * Follows the brain: `groundY` is the fight's ground, `leapFrom` where the
   * leap in starts. Hidden while dormant, unless shown on its perch.
   */
  public update(dt: number, boss: CaptainUssrSnapshot, groundY: number, leapFrom: THREE.Vector3Like): void {
    const step = Math.max(0, dt);
    this.group.visible = boss.state !== 'dormant' || this.perched;
    if (!this.group.visible) return;
    if (boss.state !== this.previous) {
      if (boss.state !== 'dormant') this.perched = false;
      this.bashFollowThrough = this.previous === 'bashWindup' && boss.state === 'recovering';
      if (boss.state === 'arriving') {
        this.leapStart.set(leapFrom.x, leapFrom.y, leapFrom.z);
        this.lastPhase = boss.phase;
      }
      // Landed: it rears up and roars.
      if (this.previous === 'arriving' && boss.state !== 'defeated') this.roarTime = 0;
      this.stateTime = 0;
    }
    if (boss.phase > this.lastPhase && boss.state !== 'defeated') this.roarTime = 0;
    this.lastPhase = boss.phase;
    this.roarTime += step;
    this.flinch.update(step);
    this.shieldRecoil.update(step);
    this.stateTime += step;
    this.time += step;
    this.stride += step * (1.4 + boss.speed * 1.5);
    this.placeRoot(boss, groundY);
    this.choosePose(boss);
    const rate = boss.state === 'arriving' || boss.state === 'charging' ? POSE_RATE * 2 : POSE_RATE;
    this.applyPose(step, this.snapPose ? 0 : rate);
    this.snapPose = false;
    this.animateDetails(step, boss);
    this.placeShield(step, boss, groundY);
    this.previous = boss.state;
  }

  public reset(): void {
    this.previous = 'dormant';
    this.bashFollowThrough = false;
    this.stateTime = 0;
    this.flashLeft = 0;
    this.spin = 0;
    this.flinch.reset();
    this.shieldRecoil.reset();
    this.roarTime = ROAR_SECONDS;
    this.lastPhase = 1;
    this.perched = false;
    this.snapPose = false;
    Object.assign(this.pose, emptyPose());
    Object.assign(this.target, emptyPose());
    this.applyPose(0, 0);
    this.group.visible = false;
  }

  public dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
    for (const material of this.rig.materials) material.dispose();
    this.hitboxMaterial.dispose();
  }

  private hitbox(parent: THREE.Object3D, geometry: THREE.BufferGeometry, part: CaptainUssrHitPart, target: HitTarget, x: number, y: number, z: number): THREE.Mesh {
    const box = new THREE.Mesh(geometry, this.hitboxMaterial);
    box.position.set(x, y, z);
    box.userData.guardianPart = part;
    box.userData.target = target;
    parent.add(box);
    return box;
  }

  private placeRoot(boss: CaptainUssrSnapshot, groundY: number): void {
    const root = this.rig.root;
    if (boss.state === 'dormant') {
      root.rotation.y = this.perchHeading;
      root.position.copy(this.perchAt);
      return;
    }
    root.rotation.y = boss.heading;
    if (boss.state !== 'arriving') {
      root.position.set(boss.position.x, groundY, boss.position.z);
      return;
    }
    // The leap: a parabola from over the fence down onto the landing.
    const p = boss.stateProgress;
    const flight = Math.min(1, p / 0.8);
    root.position.set(
      THREE.MathUtils.lerp(this.leapStart.x, boss.position.x, flight),
      THREE.MathUtils.lerp(this.leapStart.y, groundY, flight) + LEAP_ARC * flight * (1 - flight),
      THREE.MathUtils.lerp(this.leapStart.z, boss.position.z, flight),
    );
  }

  /** The pose the state asks for, written into `target`. */
  private choosePose(boss: CaptainUssrSnapshot): void {
    const pose = this.target;
    const p = boss.stateProgress;
    this.guard(pose, boss.speed);
    switch (boss.state) {
      case 'dormant':
        // On its perch: crouched over the drop, the free hand braced, the shield on its arm, eyes on the yard below.
        pose.bodyDrop = -0.45;
        pose.bodyPitch = 0.45;
        pose.headPitch = -0.3;
        pose.hipX[0] = -1.0;
        pose.hipX[1] = -0.8;
        pose.kneeX[0] = 1.75;
        pose.kneeX[1] = 1.5;
        pose.shoulderX[1] = 0.25;
        pose.shoulderZ[1] = -0.3;
        pose.elbowX[1] = -0.35;
        pose.shield.set(0.3, 1.1, 0.42);
        break;
      case 'arriving': {
        const landed = p >= 0.8;
        // In the air: tucked, the free fist raised for the blow. Landed: a deep three-point squash that rises.
        const rise = landed ? (p - 0.8) / 0.2 : 0;
        pose.hipX[0] = pose.hipX[1] = landed ? -1.0 : -1.1;
        pose.kneeX[0] = pose.kneeX[1] = landed ? 1.8 - 0.4 * rise : 1.9;
        pose.bodyDrop = landed ? -0.55 * (1 - rise) : 0;
        pose.bodyPitch = landed ? 0.5 - 0.2 * rise : -0.1;
        pose.headPitch = landed ? -0.2 : 0.1;
        pose.shoulderX[1] = landed ? 0.35 : -2.4;
        pose.shoulderZ[1] = landed ? -0.35 : -0.2;
        pose.elbowX[1] = landed ? -0.1 : -0.5;
        pose.shield.set(0.3, landed ? 0.9 : 1.4, 0.45);
        break;
      }
      case 'bashWindup': {
        // Coils back behind the shield, weight on the rear leg, then drives it.
        const coil = anticipation(p);
        pose.torsoYaw = 0.75 * coil;
        pose.bodyDrop = -0.12 * coil;
        pose.bodyPitch = -0.08 * coil;
        pose.hipX[0] = -0.25 * coil;
        pose.hipX[1] = 0.35 * coil;
        pose.kneeX[0] = 0.25 + 0.3 * coil;
        pose.kneeX[1] = 0.45 * coil;
        pose.shield.set(0.42 + 0.1 * coil, 1.32, 0.15 - 0.15 * coil);
        pose.shieldYaw = 0.6 + 0.25 * coil;
        pose.shoulderX[0] = -0.4;
        pose.shoulderZ[0] = 0.5 + 0.2 * coil;
        break;
      }
      case 'recovering':
        if (this.bashFollowThrough && this.stateTime < 0.35) {
          // The bash's follow-through: a lunge, the shield driven forward off the front foot.
          pose.torsoYaw = -0.45;
          pose.bodyPitch = 0.3;
          pose.bodyDrop = -0.1;
          pose.hipX[0] = -0.65;
          pose.hipX[1] = 0.3;
          pose.kneeX[0] = 0.6;
          pose.kneeX[1] = 0.2;
          pose.shield.set(0.05, 1.38, 0.95);
          pose.shoulderX[0] = -1.55;
          pose.elbowX[0] = -0.2;
        }
        break;
      case 'throwWindup': {
        // Backhand: the shield cocked across the chest to the right shoulder, body wound up and low.
        const coil = anticipation(p);
        pose.torsoYaw = -0.95 * coil;
        pose.bodyDrop = -0.1 * coil;
        pose.bodyRoll = -0.06 * coil;
        pose.kneeX[0] = pose.kneeX[1] = 0.1 + 0.35 * coil;
        pose.shield.set(-0.32, 1.5, 0.22);
        pose.shieldYaw = -1.1 - 0.3 * coil;
        pose.shoulderX[0] = -1.4;
        pose.shoulderZ[0] = -0.9 - 0.2 * coil;
        pose.elbowX[0] = -1.4;
        break;
      }
      case 'shieldFlight':
        // Follow-through, arm flung out to the left off a step forward; the right fist clenched by the chest.
        pose.torsoYaw = 0.35;
        pose.bodyPitch = 0.12;
        pose.hipX[0] = -0.45;
        pose.kneeX[0] = 0.4;
        pose.shoulderX[0] = -1.2;
        pose.shoulderZ[0] = 1.1;
        pose.elbowX[0] = -0.1;
        pose.shoulderX[1] = -0.6;
        pose.elbowX[1] = -1.5;
        break;
      case 'chargeWindup':
        pose.bodyDrop = -0.2;
        pose.bodyPitch = 0.4;
        pose.headPitch = -0.3;
        pose.hipX[0] = -0.7 + Math.sin(this.time * 18) * 0.15;
        pose.hipX[1] = 0.2;
        pose.kneeX[0] = 0.9;
        pose.kneeX[1] = 0.5;
        pose.shield.set(0.08, 1.2, 0.62);
        break;
      case 'charging':
        pose.bodyPitch = 0.5;
        pose.headPitch = -0.35;
        pose.shield.set(0.05, 1.22, 0.7);
        break;
      case 'stunned':
        // Dazed: swaying on its feet, the head lolling in slow circles.
        pose.bodyPitch = -0.12 + Math.cos(this.time * 2.4) * 0.04;
        pose.bodyRoll = Math.sin(this.time * 2.4) * 0.12;
        pose.torsoYaw = Math.sin(this.time * 1.7) * 0.15;
        pose.headPitch = 0.45 + Math.sin(this.time * 3.1) * 0.12;
        pose.shoulderX[0] = pose.shoulderX[1] = 0.1;
        pose.shoulderZ[0] = 0.15;
        pose.shoulderZ[1] = -0.15;
        pose.elbowX[0] = pose.elbowX[1] = -0.2;
        pose.hipX[0] = pose.hipX[1] = -0.25;
        pose.kneeX[0] = pose.kneeX[1] = 0.45;
        pose.bodyDrop = -0.08;
        pose.shield.set(0.46, 0.75, 0.05);
        pose.shieldYaw = Math.PI / 2;
        break;
      case 'defeated': {
        const fall = Math.min(1, this.stateTime / FALL_SECONDS);
        // First the knees buckle and the shield slips from its arm; then it topples onto its back.
        const kneel = Math.min(1, fall / KNEEL_SHARE);
        const topple = Math.max(0, (fall - KNEEL_SHARE) / (1 - KNEEL_SHARE));
        const toppled = topple * topple;
        pose.bodyDrop = -0.5 * kneel - 0.28 * toppled;
        pose.bodyPitch = 0.15 * kneel * (1 - topple) - 1.5 * toppled;
        pose.bodyRoll = 0.08 * kneel * (1 - topple);
        pose.headPitch = 0.5 * (1 - topple) - 0.3 * topple;
        pose.shoulderX[0] = pose.shoulderX[1] = 0.15 * kneel * (1 - topple) - 2.2 * toppled;
        pose.shoulderZ[0] = 0.6;
        pose.shoulderZ[1] = -0.6;
        pose.elbowX[0] = pose.elbowX[1] = -0.2 * (1 - topple);
        pose.hipX[0] = pose.hipX[1] = -0.3 * topple;
        pose.kneeX[0] = pose.kneeX[1] = 1.6 * kneel * (1 - topple) + 0.2 * topple;
        pose.shield.set(0.85, 0.05, 0.35);
        pose.shieldPitch = -Math.PI / 2;
        break;
      }
    }
    this.overlayRoar(pose, boss.state);
  }

  /** The roar over whatever it is doing: head thrown back, chest out, the free arm flung wide, the shield up. */
  private overlayRoar(pose: Pose, state: CaptainUssrState): void {
    const weight = state === 'defeated' || state === 'arriving' ? 0 : roarWeight(this.roarTime);
    if (weight <= 0) return;
    const blend = (from: number, to: number): number => THREE.MathUtils.lerp(from, to, weight);
    pose.headPitch = blend(pose.headPitch, -0.6);
    pose.bodyPitch = blend(pose.bodyPitch, -0.2);
    pose.torsoYaw = blend(pose.torsoYaw, 0);
    pose.shoulderX[1] = blend(pose.shoulderX[1], -0.5);
    pose.shoulderZ[1] = blend(pose.shoulderZ[1], -1.25);
    pose.elbowX[1] = blend(pose.elbowX[1], -0.7);
    pose.shield.y = blend(pose.shield.y, pose.shield.y + 0.25);
  }

  /** The guard and march: shield up in front, legs and free arm swinging with the walking speed. */
  private guard(pose: Pose, speed: number): void {
    const amplitude = Math.min(1, speed / 2.2);
    const swing = Math.sin(this.stride * 2.4) * amplitude;
    pose.bodyDrop = -Math.abs(Math.cos(this.stride * 2.4)) * 0.05 * amplitude;
    pose.bodyPitch = 0.08 * amplitude;
    pose.bodyRoll = 0;
    pose.torsoYaw = -swing * 0.12;
    pose.headPitch = 0.05;
    pose.hipX[0] = -swing * 0.55;
    pose.hipX[1] = swing * 0.55;
    pose.kneeX[0] = Math.max(0, Math.sin(this.stride * 2.4 + Math.PI / 2)) * 0.9 * amplitude + 0.08;
    pose.kneeX[1] = Math.max(0, Math.sin(this.stride * 2.4 - Math.PI / 2)) * 0.9 * amplitude + 0.08;
    pose.shoulderX[0] = -1.25;
    pose.shoulderZ[0] = -0.3;
    pose.elbowX[0] = -1.0;
    pose.shoulderX[1] = -swing * 0.6;
    pose.shoulderZ[1] = -0.12;
    pose.elbowX[1] = -0.35;
    pose.shield.set(0.16, 1.32, 0.52);
    pose.shieldYaw = -0.12;
    pose.shieldPitch = 0;
    // Standing still it breathes: the chest heaves, the free arm and the shield ride it.
    const breath = Math.sin(this.time * BREATH.rate) * BREATH.depth * (1 - amplitude);
    pose.bodyPitch += breath;
    pose.headPitch -= breath;
    pose.shoulderZ[1] -= breath * 1.5;
    pose.shield.y += breath * 0.4;
  }

  /** Eases every joint towards `target` (`rate` 0 snaps). */
  private applyPose(dt: number, rate: number): void {
    const from = this.pose;
    const to = this.target;
    const ease = (a: number, b: number): number => (rate <= 0 ? b : THREE.MathUtils.damp(a, b, rate, dt));
    from.bodyDrop = ease(from.bodyDrop, to.bodyDrop);
    from.bodyPitch = ease(from.bodyPitch, to.bodyPitch);
    from.bodyRoll = ease(from.bodyRoll, to.bodyRoll);
    from.torsoYaw = ease(from.torsoYaw, to.torsoYaw);
    from.headPitch = ease(from.headPitch, to.headPitch);
    from.shieldYaw = ease(from.shieldYaw, to.shieldYaw);
    from.shieldPitch = ease(from.shieldPitch, to.shieldPitch);
    from.shield.set(ease(from.shield.x, to.shield.x), ease(from.shield.y, to.shield.y), ease(from.shield.z, to.shield.z));
    for (let side = 0; side < 2; side++) {
      from.shoulderX[side] = ease(from.shoulderX[side], to.shoulderX[side]);
      from.shoulderZ[side] = ease(from.shoulderZ[side], to.shoulderZ[side]);
      from.elbowX[side] = ease(from.elbowX[side], to.elbowX[side]);
      from.hipX[side] = ease(from.hipX[side], to.hipX[side]);
      from.kneeX[side] = ease(from.kneeX[side], to.kneeX[side]);
    }
    const rig = this.rig;
    // Jolts ride on top of the eased pose, so they stay crisp.
    const flinch = this.flinch.value;
    const recoil = this.shieldRecoil.value;
    rig.body.position.y = CAPTAIN_USSR_BODY.hips + from.bodyDrop;
    rig.body.rotation.set(from.bodyPitch - flinch * FLINCH.body, 0, from.bodyRoll);
    rig.torso.rotation.y = from.torsoYaw;
    rig.head.rotation.x = from.headPitch - flinch * FLINCH.head;
    for (let side = 0; side < 2; side++) {
      // Positive sideways angles swing an arm towards +x: the left one out, the right one in.
      rig.shoulders[side].rotation.set(from.shoulderX[side], 0, from.shoulderZ[side]);
      rig.elbows[side].rotation.x = from.elbowX[side];
      rig.hips[side].rotation.x = from.hipX[side];
      rig.knees[side].rotation.x = from.kneeX[side];
    }
    rig.shieldMount.position.copy(from.shield);
    rig.shieldMount.position.z -= recoil * FLINCH.shieldBack;
    rig.shieldMount.rotation.set(from.shieldPitch - recoil * FLINCH.shieldPitch, from.shieldYaw, 0);
  }

  /** Rags in the wind of its march, eyes burning hotter with each phase, the hit flash fading. */
  private animateDetails(dt: number, boss: CaptainUssrSnapshot): void {
    const rig = this.rig;
    rig.tatters.forEach((rag, index) => {
      rag.rotation.x = Math.sin(this.time * 3.1 + index * 1.7) * 0.18 + Math.min(0.7, boss.speed * 0.08);
      rag.rotation.z = Math.sin(this.time * 2.3 + index) * 0.1;
    });
    const rage = boss.state === 'defeated' ? 0.05 : 0.55 + boss.phase * 0.2 + Math.sin(this.time * 9) * 0.08;
    rig.eyes.color.setRGB(rage, rage * 0.14, rage * 0.08);
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    const flash = this.flashLeft / FLASH_SECONDS;
    for (const material of rig.fabric) material.emissive.setRGB(flash * 0.55, flash * 0.06, flash * 0.03);
  }

  /** In the hand it rides the mount; thrown, it spins flat along the brain's flight. */
  private placeShield(dt: number, boss: CaptainUssrSnapshot, groundY: number): void {
    const shield = this.rig.shield;
    if (boss.shieldHeld) {
      this.rig.root.updateMatrixWorld(true);
      this.rig.shieldMount.getWorldPosition(this.worldPosition);
      this.rig.shieldMount.getWorldQuaternion(this.worldQuaternion);
      shield.position.copy(this.worldPosition);
      shield.quaternion.copy(this.worldQuaternion);
      return;
    }
    this.spin += SHIELD_SPIN * dt;
    shield.position.set(boss.shield.x, groundY + SHIELD_FLIGHT_Y, boss.shield.z);
    // Nearly flat, tilted into its flight, spinning about its own axis.
    shield.rotation.set(-Math.PI / 2 + 0.25, 0, this.spin);
  }
}
