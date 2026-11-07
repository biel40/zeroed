import * as THREE from 'three';
import type { HitTarget } from '../../shooting/HitTarget';
import type { CaptainUssrBrain, CaptainUssrHitPart, CaptainUssrState } from './CaptainUssrBrain';
import { choreograph, DEATH, LEAP_FLIGHT, PAW_LIFT, PAW_RATE, type ChoreographyInput } from './CaptainUssrChoreography';
import { Gait, solveLeg, type LegAngles } from './CaptainUssrGait';
import { buildCaptainUssr, type CaptainUssrRig } from './CaptainUssrModel';
import { ROAR_SECONDS, roarWeight, smooth } from './CaptainUssrMotion';
import { CAPTAIN_USSR_BODY as B, CAPTAIN_USSR_SPRINGS, createPose, POSE, PoseSpring } from './CaptainUssrPose';
import { CaptainUssrPuffs, PUFF_STYLES, type PuffStyle } from './CaptainUssrPuffs';
import { SHIELD_BACK, SHIELD_GRIP, SHIELD_RADIUS } from './CaptainUssrShield';
import { DroppedShield } from './DroppedShield';

/** What the view reads from the brain each frame. */
export type CaptainUssrSnapshot = Pick<CaptainUssrBrain,
  'state' | 'stateProgress' | 'position' | 'heading' | 'speed' | 'shieldHeld' | 'shield' | 'phase'>;

/** What the body did this frame that the mode makes heard and felt; rewritten by every `update`. */
export interface CaptainUssrCues {
  /** A foot came down: how hard (0..1), 0 when none did, and where. */
  footfall: number;
  readonly foot: THREE.Vector3;
  /** Its body struck the ground (the leap's slam, its knees, its fall): how hard (0..1), 0 when not, and where. */
  impact: number;
  readonly impactAt: THREE.Vector3;
  /** The dropped shield struck the ground: how hard (m/s), 0 when it did not. */
  clang: number;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** The thrown shield: cruise height, the hand's height it leaves and returns at, how fast it settles between them (m), spin (rad/s) and bank. */
const SHIELD_FLIGHT = { cruise: 1.3, hand: 1.45, settle: 1.4, spin: 22, bank: 0.28 } as const;
/** Afterimages trailing the thrown shield, `spacing` frames apart. */
const GHOSTS = { count: 4, spacing: 2, opacity: 0.26 } as const;
const TRAIL_LENGTH = GHOSTS.count * GHOSTS.spacing + 1;
/** Seconds the caught shield takes to settle from its flight into the hand. */
const CATCH_SECONDS = 0.12;
/** Seconds of the red tint a landed hit leaves on the suit. */
const FLASH_SECONDS = 0.14;
/** How high the leap arcs over the straight line between its ends. */
const LEAP_ARC = 3;
/** Jolts (velocity kicks on the pose's springs): a hit, a blocked shot, a crash into a solid, a catch. */
const HURT = { spineYaw: 2.4, spinePitch: -2.2, head: -5, headGraze: -1.6 } as const;
const BLOCK = { shieldPitch: -3.5, shieldZ: -1, spinePitch: -0.8 } as const;
const CRASH = { pitch: -3, lunge: -2.2, headPitch: -6, shieldZ: -1.8 } as const;
const CATCH = { shieldZ: -1.4, spineYaw: 1.2, shieldPitch: -2 } as const;
/** How fast the shield arm takes to and lets go of the grip (1/s), and the way its elbow points (spine frame). */
const ARM_REACH_RATE = 14;
const SHIELD_ARM_POLE = new THREE.Vector3(0.7, -0.4, -0.6);
/** Within this distance, the arm reaches out for the returning shield (m). */
const CATCH_REACH = 3.5;
/** Steps in place while it turns where it stands: march speed per rad/s turned, capped. */
const TURN_SHUFFLE = { perRadian: 0.35, maxTurn: 4 } as const;
/** Its eyes: base glow, more per phase, and the flare as an attack is loaded. */
const EYES = { base: 0.55, perPhase: 0.2, flare: 0.6 } as const;
/** Seconds between breaths, by how hard it works. */
const BREATH_EVERY = { rest: 1.9, march: 1.1, winded: 0.5, fury: 0.8 } as const;
/** Seconds between wisps of steam off its shoulders in red fury. */
const STEAM_EVERY = 0.25;
/** The shield slips from its arm this long into its death. */
const SHIELD_DROP_AT = DEATH.stagger + 0.1;
/** Slipping off, the shield is thrown out to its side, up and ahead (m/s). */
const SHIELD_DROP = { out: 1.1, up: 0.6, ahead: 0.3 } as const;
const FACE = new THREE.Vector3(0, 0, 1);

function surface(kind: HitTarget['surface']): HitTarget {
  return { acceptsDecals: false, surface: kind, onHit: () => undefined };
}

function loadsAttack(state: CaptainUssrState): boolean {
  return state === 'bashWindup' || state === 'throwWindup' || state === 'chargeWindup';
}

/**
 * Three.js presentation of CAPITÁN URSS. The choreography poses him from
 * the brain's state; damped springs give the body weight and take hits as
 * jolts; the legs are solved onto the march's planted feet and the shield
 * arm onto the shield's grip. It flies and trails the thrown shield, lets
 * it fall and ring out when he dies, breathes and kicks up snow, glows
 * with fury and glints before a strike. It owns the invisible hitboxes
 * (`userData.guardianPart`) the mode puts in the ballistics, and reports
 * footfalls and impacts in `cues`. It decides nothing.
 */
export class CaptainUssrView {
  public readonly group = new THREE.Group();
  public readonly hitboxes: readonly THREE.Mesh[];
  public readonly cues: CaptainUssrCues = { footfall: 0, foot: new THREE.Vector3(), impact: 0, impactAt: new THREE.Vector3(), clang: 0 };
  private readonly rig: CaptainUssrRig;
  private readonly hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
  private readonly target = createPose();
  private readonly spring = new PoseSpring(CAPTAIN_USSR_SPRINGS);
  private readonly gait = new Gait();
  private readonly puffs: CaptainUssrPuffs;
  private readonly dropped = new DroppedShield(SHIELD_RADIUS, SHIELD_BACK * 2);
  private readonly ghosts: readonly THREE.Mesh[];
  private readonly ghostMaterials: readonly THREE.MeshBasicMaterial[];
  private readonly trail: readonly { readonly position: THREE.Vector3; readonly quaternion: THREE.Quaternion }[];
  private readonly input: Mutable<ChoreographyInput> = {
    state: 'dormant', progress: 0, stateTime: 0, time: 0, phase: 1, walk: 0, swing: 0,
    perched: false, followThrough: false, crashed: false, roar: 0,
  };
  // Scratch, reused every frame.
  private readonly leg: LegAngles = { hip: 0, knee: 0 };
  private readonly inverse = new THREE.Matrix4();
  private readonly basis = new THREE.Matrix4();
  private readonly euler = new THREE.Euler();
  private readonly fkQuaternion = new THREE.Quaternion();
  private readonly ikQuaternion = new THREE.Quaternion();
  private readonly point = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly bend = new THREE.Vector3();
  private readonly elbowAt = new THREE.Vector3();
  private readonly upper = new THREE.Vector3();
  private readonly fore = new THREE.Vector3();
  private readonly axisX = new THREE.Vector3();
  private readonly axisY = new THREE.Vector3();
  private readonly axisZ = new THREE.Vector3();
  private readonly worldPosition = new THREE.Vector3();
  private readonly worldQuaternion = new THREE.Quaternion();
  // Where things started: the leap, the perch, a catch, the dropped shield's roll about its face.
  private readonly leapStart = new THREE.Vector3();
  private readonly perchAt = new THREE.Vector3();
  private readonly catchFrom = new THREE.Vector3();
  private readonly catchFromQuaternion = new THREE.Quaternion();
  private readonly dropRoll = new THREE.Quaternion();
  private perchHeading = 0;
  private previous: CaptainUssrState = 'dormant';
  /** Shown on its perch before a filmed entrance's leap. */
  private perched = false;
  /** Visible last frame: the first frame shown snaps every joint to its pose. */
  private shown = false;
  private snapPose = false;
  /** The current recovery follows a bash; the current stun follows a crash. */
  private followThrough = false;
  private crashed = false;
  private stateTime = 0;
  private time = 0;
  private lastProgress = 0;
  private lastHeading = 0;
  private flashLeft = 0;
  /** Seconds into the current roar; `ROAR_SECONDS` or more when none plays. */
  private roarTime = ROAR_SECONDS;
  private lastPhase = 1;
  /** 0..1: how firmly the shield arm holds the grip (or reaches for the returning shield). */
  private armReach = 1;
  private wasHeld = true;
  private catchLeft = 0;
  private shieldDown = false;
  private shieldDistance = Infinity;
  private returning = false;
  private flightHeading = 0;
  private spin = 0;
  private trailHead = 0;
  private trailCount = 0;
  private breathClock = 0;
  private steamClock = 0;
  private steamSide: 0 | 1 = 0;

  /** `fullEffects`: cast shadows and keep a fuller pool of breath, steam and snow. */
  public constructor(fullEffects: boolean) {
    this.rig = buildCaptainUssr(fullEffects);
    this.puffs = new CaptainUssrPuffs(fullEffects ? 36 : 14);
    this.group.name = 'captain-ussr-view';
    const ghost = new THREE.CircleGeometry(SHIELD_RADIUS, 32);
    this.ghostMaterials = Array.from({ length: GHOSTS.count }, (_, index) => new THREE.MeshBasicMaterial({
      color: 0xff3a22, transparent: true, opacity: GHOSTS.opacity * (1 - index / GHOSTS.count), depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    }));
    this.ghosts = this.ghostMaterials.map((material) => {
      const mesh = new THREE.Mesh(ghost, material);
      mesh.visible = false;
      return mesh;
    });
    this.trail = Array.from({ length: TRAIL_LENGTH }, () => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion() }));
    this.group.add(this.rig.root, this.rig.shield, this.puffs.group, ...this.ghosts);
    const flesh = surface('flesh');
    this.hitboxes = [
      this.hitbox(this.rig.body, new THREE.CapsuleGeometry(0.32, 0.5, 4, 10), 'torso', flesh, 0, 0.42, 0),
      this.hitbox(this.rig.body, new THREE.BoxGeometry(0.52, B.hips, 0.34), 'torso', flesh, 0, -B.hips / 2, 0),
      this.hitbox(this.rig.head, new THREE.SphereGeometry(0.19, 12, 10), 'head', flesh, 0, 0.12, 0.02),
      this.hitbox(this.rig.shield, new THREE.CylinderGeometry(SHIELD_RADIUS + 0.03, SHIELD_RADIUS + 0.03, 0.16, 20).rotateX(Math.PI / 2), 'shield', surface('metal'), 0, 0, 0.03),
    ];
    this.group.visible = false;
  }

  /**
   * A landed hit, `strength` 0..1: the suit flushes red and the body is
   * jolted away from `point` (straight back without one), the head
   * snapping back hard on a headshot.
   */
  public hurt(strength = 1, part: CaptainUssrHitPart = 'torso', point: THREE.Vector3Like | null = null): void {
    this.flashLeft = FLASH_SECONDS;
    let side = 0;
    let front = 1;
    if (point) {
      this.point.set(point.x, point.y, point.z);
      this.rig.root.worldToLocal(this.point);
      side = Math.sign(this.point.x);
      front = this.point.z >= 0 ? 1 : -1;
    }
    this.spring.kick(POSE.spinePitch, HURT.spinePitch * front * strength);
    if (side !== 0) this.spring.kick(POSE.spineYaw, HURT.spineYaw * side * front * strength);
    this.spring.kick(POSE.headPitch, (part === 'head' ? HURT.head : HURT.headGraze) * front * strength);
  }

  /** A shot rang off the shield: it is knocked back against the arm. */
  public block(): void {
    this.spring.kick(POSE.shieldPitch, BLOCK.shieldPitch);
    this.spring.kick(POSE.shieldZ, BLOCK.shieldZ);
    this.spring.kick(POSE.spinePitch, BLOCK.spinePitch);
  }

  /** Its charge ended against a solid: it rebounds off it, its head snapping back. */
  public crash(): void {
    this.crashed = true;
    this.spring.kick(POSE.pitch, CRASH.pitch);
    this.spring.kick(POSE.lunge, CRASH.lunge);
    this.spring.kick(POSE.headPitch, CRASH.headPitch);
    this.spring.kick(POSE.shieldZ, CRASH.shieldZ);
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
    this.cues.footfall = 0;
    this.cues.impact = 0;
    this.cues.clang = 0;
    this.group.visible = boss.state !== 'dormant' || this.perched;
    if (!this.group.visible) {
      this.shown = false;
      return;
    }
    if (!this.shown) {
      this.shown = true;
      this.snapPose = true;
    }
    if (boss.state !== this.previous) this.enter(boss, leapFrom);
    if (boss.phase > this.lastPhase && boss.state !== 'defeated') this.roarTime = 0;
    this.lastPhase = boss.phase;
    this.roarTime += step;
    this.stateTime += step;
    this.time += step;
    if (boss.shieldHeld !== this.wasHeld) this.shieldChangedHands(boss.shieldHeld);
    this.wasHeld = boss.shieldHeld;
    this.march(step, boss);
    this.placeRoot(boss, groundY);
    this.pose(step, boss);
    this.placeShield(step, boss, groundY);
    this.animateDetails(step, boss);
    this.emitPuffs(step, boss, groundY);
    this.puffs.update(step);
    this.previous = boss.state;
    this.lastProgress = boss.stateProgress;
  }

  public reset(): void {
    this.previous = 'dormant';
    this.perched = false;
    this.shown = false;
    this.snapPose = false;
    this.followThrough = false;
    this.crashed = false;
    this.stateTime = 0;
    this.lastProgress = 0;
    this.flashLeft = 0;
    this.roarTime = ROAR_SECONDS;
    this.lastPhase = 1;
    this.armReach = 1;
    this.wasHeld = true;
    this.catchLeft = 0;
    this.shieldDown = false;
    this.shieldDistance = Infinity;
    this.returning = false;
    this.spin = 0;
    this.trailCount = 0;
    this.breathClock = 0;
    this.steamClock = 0;
    this.spring.reset();
    this.gait.reset();
    this.puffs.reset();
    this.hideGhosts();
    this.cues.footfall = 0;
    this.cues.impact = 0;
    this.cues.clang = 0;
    this.group.visible = false;
  }

  public dispose(): void {
    this.group.removeFromParent();
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
    for (const material of this.rig.materials) material.dispose();
    for (const texture of this.rig.textures) texture.dispose();
    for (const material of this.ghostMaterials) material.dispose();
    this.hitboxMaterial.dispose();
    this.puffs.dispose();
  }

  private hitbox(parent: THREE.Object3D, geometry: THREE.BufferGeometry, part: CaptainUssrHitPart, target: HitTarget, x: number, y: number, z: number): THREE.Mesh {
    const box = new THREE.Mesh(geometry, this.hitboxMaterial);
    box.position.set(x, y, z);
    box.userData.guardianPart = part;
    box.userData.target = target;
    parent.add(box);
    return box;
  }

  private enter(boss: CaptainUssrSnapshot, leapFrom: THREE.Vector3Like): void {
    const from = this.previous;
    const to = boss.state;
    if (to !== 'dormant') this.perched = false;
    this.followThrough = from === 'bashWindup' && to === 'recovering';
    if (from === 'stunned') this.crashed = false;
    if (to === 'arriving') {
      this.leapStart.set(leapFrom.x, leapFrom.y, leapFrom.z);
      this.lastPhase = boss.phase;
      this.lastHeading = boss.heading;
    }
    // Landed: it rears up and roars.
    if (from === 'arriving' && to !== 'defeated') this.roarTime = 0;
    this.stateTime = 0;
  }

  /** The march follows its ground speed; turning where it stands, it shuffles round. */
  private march(step: number, boss: CaptainUssrSnapshot): void {
    let speed = 0;
    if (boss.state === 'charging') speed = boss.speed;
    if (boss.state === 'stalking' && step > 0) {
      const turned = Math.abs(Math.atan2(Math.sin(boss.heading - this.lastHeading), Math.cos(boss.heading - this.lastHeading))) / step;
      speed = Math.max(boss.speed, Math.min(TURN_SHUFFLE.maxTurn, turned) * TURN_SHUFFLE.perRadian);
    }
    this.lastHeading = boss.heading;
    this.gait.update(step, speed);
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
    // The leap: a parabola from its perch down onto the landing, then the slam.
    const flight = Math.min(1, boss.stateProgress / LEAP_FLIGHT);
    root.position.set(
      THREE.MathUtils.lerp(this.leapStart.x, boss.position.x, flight),
      THREE.MathUtils.lerp(this.leapStart.y, groundY, flight) + LEAP_ARC * flight * (1 - flight),
      THREE.MathUtils.lerp(this.leapStart.z, boss.position.z, flight),
    );
    if (this.lastProgress >= LEAP_FLIGHT || boss.stateProgress < LEAP_FLIGHT) return;
    this.cues.impact = 1;
    this.cues.impactAt.copy(root.position);
    this.burst(this.cues.impactAt, 10, PUFF_STYLES.dust, 2.2, 1.3);
  }

  /** The choreographed pose, sprung, applied to the joints; the legs and the shield arm solved onto their marks. */
  private pose(step: number, boss: CaptainUssrSnapshot): void {
    const input = this.input;
    input.state = boss.state;
    input.progress = boss.stateProgress;
    input.stateTime = this.stateTime;
    input.time = this.time;
    input.phase = boss.phase;
    input.walk = this.gait.weight;
    input.swing = this.gait.swing;
    input.perched = this.perched;
    input.followThrough = this.followThrough;
    input.crashed = this.crashed;
    input.roar = boss.state === 'arriving' || boss.state === 'defeated' ? 0 : roarWeight(this.roarTime);
    const agility = choreograph(input, this.target);
    if (this.snapPose) this.spring.snap(this.target);
    else this.spring.update(this.target, step, agility);
    this.snapPose = false;

    const pose = this.spring.value;
    const rig = this.rig;
    rig.body.position.set(pose[POSE.sway], B.hips + pose[POSE.drop] + this.gait.bob, pose[POSE.lunge]);
    rig.body.rotation.set(pose[POSE.pitch], pose[POSE.twist], pose[POSE.roll]);
    rig.torso.rotation.set(pose[POSE.spinePitch], pose[POSE.spineYaw], pose[POSE.spineRoll]);
    rig.head.rotation.set(pose[POSE.headPitch], pose[POSE.headYaw], 0);
    rig.jaw.rotation.x = Math.max(0, pose[POSE.jaw]);
    rig.shoulders[1].rotation.set(pose[POSE.shoulderPitch[1]], 0, pose[POSE.shoulderRoll[1]]);
    rig.elbows[1].rotation.x = Math.min(0, pose[POSE.elbow[1]]);
    rig.shieldMount.position.set(pose[POSE.shieldX], pose[POSE.shieldY], pose[POSE.shieldZ]);
    rig.shieldMount.rotation.set(pose[POSE.shieldPitch], pose[POSE.shieldYaw], pose[POSE.shieldRoll]);
    this.plantFeet();
    rig.root.updateMatrixWorld(true);
    this.reachForShield(step, boss);
  }

  /** Each ankle onto the pose's foot plus the march, through two-bone IK in the pelvis's frame; the sole kept to its pitch. */
  private plantFeet(): void {
    const pose = this.spring.value;
    const rig = this.rig;
    const gait = this.gait;
    rig.body.updateMatrix();
    this.inverse.copy(rig.body.matrix).invert();
    for (let side = 0; side < 2; side++) {
      const hip = rig.hips[side];
      this.point.set(
        pose[POSE.footX[side]],
        B.ankle + Math.max(0, pose[POSE.footY[side]] + gait.lift[side]),
        pose[POSE.footZ[side]] + gait.forward[side],
      ).applyMatrix4(this.inverse);
      const dx = this.point.x - hip.position.x;
      const dy = this.point.y - hip.position.y;
      const dz = this.point.z - hip.position.z;
      solveLeg(dz, -Math.hypot(dx, dy), B.thigh, B.shin, this.leg);
      hip.rotation.set(this.leg.hip, 0, Math.atan2(dx, -dy));
      rig.knees[side].rotation.x = this.leg.knee;
      rig.ankles[side].rotation.x = pose[POSE.footPitch[side]] + gait.toe[side] - (pose[POSE.pitch] + this.leg.hip + this.leg.knee);
    }
  }

  /**
   * The shield arm: by its angles when the hand is empty, onto the grip
   * while the shield is on it, reaching out for the shield as it flies back.
   */
  private reachForShield(step: number, boss: CaptainUssrSnapshot): void {
    const rig = this.rig;
    const pose = this.spring.value;
    const onArm = boss.shieldHeld && !this.shieldDown;
    const catching = !boss.shieldHeld && this.returning ? smooth(1 - this.shieldDistance / CATCH_REACH) : 0;
    this.armReach += ((onArm ? 1 : catching) - this.armReach) * (1 - Math.exp(-ARM_REACH_RATE * step));
    const shoulder = rig.shoulders[0];
    const elbow = rig.elbows[0];
    this.euler.set(pose[POSE.shoulderPitch[0]], 0, pose[POSE.shoulderRoll[0]], 'XYZ');
    this.fkQuaternion.setFromEuler(this.euler);
    const bent = Math.min(0, pose[POSE.elbow[0]]);
    if (this.armReach < 1e-3) {
      shoulder.quaternion.copy(this.fkQuaternion);
      elbow.rotation.x = bent;
      return;
    }
    if (onArm) this.point.set(SHIELD_GRIP.x, SHIELD_GRIP.y, SHIELD_GRIP.z).applyMatrix4(rig.shieldMount.matrixWorld);
    else this.point.copy(rig.shield.position);
    this.point.applyMatrix4(this.inverse.copy(rig.torso.matrixWorld).invert());
    const reached = this.solveArm(shoulder.position, this.point, SHIELD_ARM_POLE, this.ikQuaternion);
    shoulder.quaternion.slerpQuaternions(this.fkQuaternion, this.ikQuaternion, this.armReach);
    elbow.rotation.x = THREE.MathUtils.lerp(bent, reached, this.armReach);
  }

  /**
   * Two-bone IK for an arm, in its shoulder's parent frame: writes the
   * shoulder's rotation into `out` and returns the elbow's bend, putting the
   * fist on `target` (or as near as it reaches), the elbow towards `pole`.
   */
  private solveArm(shoulderAt: THREE.Vector3, target: THREE.Vector3, pole: THREE.Vector3, out: THREE.Quaternion): number {
    const upperLength = B.upperArm;
    const foreLength = B.forearm + B.hand;
    this.direction.subVectors(target, shoulderAt);
    const distance = THREE.MathUtils.clamp(this.direction.length(), 0.05, upperLength + foreLength - 1e-3);
    this.direction.normalize();
    const cosine = THREE.MathUtils.clamp((upperLength ** 2 + distance ** 2 - foreLength ** 2) / (2 * upperLength * distance), -1, 1);
    this.bend.copy(pole).addScaledVector(this.direction, -pole.dot(this.direction));
    if (this.bend.lengthSq() < 1e-8) this.bend.set(1, 0, 0);
    this.bend.normalize();
    this.elbowAt.copy(this.direction).multiplyScalar(upperLength * cosine).addScaledVector(this.bend, upperLength * Math.sqrt(1 - cosine * cosine));
    this.upper.copy(this.elbowAt).divideScalar(upperLength);
    this.fore.copy(this.direction).multiplyScalar(distance).sub(this.elbowAt).normalize();
    // The upper arm hangs along its -y; the forearm folds towards its +z.
    this.axisY.copy(this.upper).negate();
    this.axisZ.copy(this.fore).addScaledVector(this.upper, -this.fore.dot(this.upper));
    if (this.axisZ.lengthSq() < 1e-8) this.axisZ.copy(this.bend).negate();
    this.axisZ.normalize();
    this.axisX.crossVectors(this.axisY, this.axisZ);
    out.setFromRotationMatrix(this.basis.makeBasis(this.axisX, this.axisY, this.axisZ));
    return -Math.acos(THREE.MathUtils.clamp(this.upper.dot(this.fore), -1, 1));
  }

  /** Caught: it settles from its flight into the hand with a jolt up the arm. Thrown: its trail starts afresh. */
  private shieldChangedHands(held: boolean): void {
    this.trailCount = 0;
    this.hideGhosts();
    if (!held) {
      this.shieldDistance = Infinity;
      this.returning = false;
      return;
    }
    this.catchFrom.copy(this.rig.shield.position);
    this.catchFromQuaternion.copy(this.rig.shield.quaternion);
    this.catchLeft = CATCH_SECONDS;
    this.spring.kick(POSE.shieldZ, CATCH.shieldZ);
    this.spring.kick(POSE.shieldPitch, CATCH.shieldPitch);
    this.spring.kick(POSE.spineYaw, CATCH.spineYaw);
  }

  /** On the arm it rides the mount; thrown, it spins along the brain's flight; let go in death, it falls and rings out. */
  private placeShield(step: number, boss: CaptainUssrSnapshot, groundY: number): void {
    const shield = this.rig.shield;
    if (boss.state === 'defeated' && !this.shieldDown && this.stateTime >= SHIELD_DROP_AT) this.dropShield(boss.heading);
    if (this.shieldDown) {
      this.dropped.update(step, groundY);
      const { position, tilt, heading } = this.dropped;
      shield.position.set(position.x, position.y, position.z);
      this.direction.set(Math.sin(tilt) * Math.sin(heading), Math.cos(tilt), Math.sin(tilt) * Math.cos(heading));
      shield.quaternion.setFromUnitVectors(FACE, this.direction).multiply(this.dropRoll);
      this.cues.clang = this.dropped.impact;
      return;
    }
    if (boss.shieldHeld) {
      this.rig.shieldMount.getWorldPosition(this.worldPosition);
      this.rig.shieldMount.getWorldQuaternion(this.worldQuaternion);
      if (this.catchLeft <= 0) {
        shield.position.copy(this.worldPosition);
        shield.quaternion.copy(this.worldQuaternion);
        return;
      }
      this.catchLeft = Math.max(0, this.catchLeft - step);
      const settled = smooth(1 - this.catchLeft / CATCH_SECONDS);
      shield.position.lerpVectors(this.catchFrom, this.worldPosition, settled);
      shield.quaternion.slerpQuaternions(this.catchFromQuaternion, this.worldQuaternion, settled);
      return;
    }
    const distance = Math.hypot(boss.shield.x - boss.position.x, boss.shield.z - boss.position.z);
    this.returning = distance < this.shieldDistance;
    this.shieldDistance = distance;
    const travelX = boss.shield.x - shield.position.x;
    const travelZ = boss.shield.z - shield.position.z;
    if (travelX * travelX + travelZ * travelZ > 1e-8) this.flightHeading = Math.atan2(travelX, travelZ);
    this.spin += SHIELD_FLIGHT.spin * step;
    // Leaving the hand it sinks to its cruise; coming back it rises to the hand again.
    const height = SHIELD_FLIGHT.cruise + (SHIELD_FLIGHT.hand - SHIELD_FLIGHT.cruise) * Math.exp(-distance / SHIELD_FLIGHT.settle);
    shield.position.set(boss.shield.x, groundY + height, boss.shield.z);
    // Nearly flat, banked into its flight, spinning on its face.
    this.euler.set(-Math.PI / 2 + SHIELD_FLIGHT.bank, this.flightHeading, this.spin, 'YXZ');
    shield.quaternion.setFromEuler(this.euler);
    this.recordTrail();
  }

  /** Slips from the dying arm: thrown out to its side, up and a little ahead, keeping its roll. */
  private dropShield(heading: number): void {
    const shield = this.rig.shield;
    this.shieldDown = true;
    this.direction.copy(FACE).applyQuaternion(shield.quaternion);
    this.velocity.set(
      Math.cos(heading) * SHIELD_DROP.out + Math.sin(heading) * SHIELD_DROP.ahead,
      SHIELD_DROP.up,
      -Math.sin(heading) * SHIELD_DROP.out + Math.cos(heading) * SHIELD_DROP.ahead,
    );
    this.dropped.drop(shield.position, this.velocity, Math.acos(THREE.MathUtils.clamp(this.direction.y, -1, 1)), Math.atan2(this.direction.x, this.direction.z));
    const { tilt, heading: leaning } = this.dropped;
    this.direction.set(Math.sin(tilt) * Math.sin(leaning), Math.cos(tilt), Math.sin(tilt) * Math.cos(leaning));
    this.dropRoll.setFromUnitVectors(FACE, this.direction).invert().multiply(shield.quaternion);
  }

  private recordTrail(): void {
    const shield = this.rig.shield;
    const entry = this.trail[this.trailHead];
    entry.position.copy(shield.position);
    entry.quaternion.copy(shield.quaternion);
    this.trailHead = (this.trailHead + 1) % TRAIL_LENGTH;
    this.trailCount = Math.min(TRAIL_LENGTH, this.trailCount + 1);
    for (let index = 0; index < GHOSTS.count; index++) {
      const back = (index + 1) * GHOSTS.spacing;
      const ghost = this.ghosts[index];
      ghost.visible = back < this.trailCount;
      if (!ghost.visible) continue;
      const past = this.trail[(this.trailHead - 1 - back + TRAIL_LENGTH * 2) % TRAIL_LENGTH];
      ghost.position.copy(past.position);
      ghost.quaternion.copy(past.quaternion);
    }
  }

  private hideGhosts(): void {
    for (const ghost of this.ghosts) ghost.visible = false;
  }

  /** Rags in the wind of its march, eyes and veins burning with fury, the rim's glint, the hit's flush fading. */
  private animateDetails(step: number, boss: CaptainUssrSnapshot): void {
    const rig = this.rig;
    for (let index = 0; index < rig.tatters.length; index++) {
      const rag = rig.tatters[index];
      rag.rotation.x = Math.sin(this.time * 3.1 + index * 1.7) * 0.18 + Math.min(0.7, boss.speed * 0.08);
      rag.rotation.z = Math.sin(this.time * 2.3 + index) * 0.1;
    }
    const glow = this.eyeGlow(boss);
    rig.eyes.color.setRGB(glow, glow * 0.14, glow * 0.08);
    rig.halo.opacity = 0.3 * Math.min(1.6, glow);
    const fury = boss.state === 'defeated' ? 0 : boss.phase === 3 ? 0.6 + Math.sin(this.time * 5) * 0.3 : boss.phase === 2 ? 0.2 : 0;
    rig.skin.emissiveIntensity = fury;
    // A glint runs round the rim as an attack is about to be let loose: the player's cue to move.
    const progress = boss.stateProgress;
    const glint = loadsAttack(boss.state) ? smooth((progress - 0.55) / 0.15) * (1 - smooth((progress - 0.8) / 0.15)) : 0;
    rig.rim.emissive.setRGB(glint * 1.4, glint * 1.1, glint * 0.7);
    this.flashLeft = Math.max(0, this.flashLeft - step);
    const flash = this.flashLeft / FLASH_SECONDS;
    for (const material of rig.fabric) material.emissive.setRGB(flash * 0.55, flash * 0.06, flash * 0.03);
  }

  /** Brighter with each phase and as an attack loads, flickering while stunned, dying out as it falls. */
  private eyeGlow(boss: CaptainUssrSnapshot): number {
    if (boss.state === 'defeated') return 0.9 * (1 - smooth((this.stateTime - DEATH.kneel) / (DEATH.down + 0.5 - DEATH.kneel)));
    let glow = EYES.base + boss.phase * EYES.perPhase + Math.sin(this.time * 9) * 0.08;
    if (loadsAttack(boss.state)) glow *= 1 + EYES.flare * smooth(boss.stateProgress / 0.8);
    if (boss.state === 'charging') glow *= 1 + EYES.flare;
    if (boss.state === 'stunned') glow *= 0.3 + 0.25 * Math.max(0, Math.sin(this.time * 23));
    return glow;
  }

  /** Breath, roars, snorts, snow kicked up by its feet and the steam of its fury; footfalls and death's impacts as cues. */
  private emitPuffs(step: number, boss: CaptainUssrSnapshot, groundY: number): void {
    if (this.gait.footfall > 0) {
      this.cues.footfall = this.gait.footfall;
      this.lowerAnkle(this.cues.foot);
      if (boss.state === 'charging') this.burst(this.point.copy(this.cues.foot).setY(groundY + 0.05), 3, PUFF_STYLES.dust, 1.4, 0.8);
    }
    const dead = boss.state === 'defeated' && this.stateTime > DEATH.down;
    if (boss.state !== 'arriving' && !dead) {
      this.breathClock += step;
      if (this.breathClock >= this.breathEvery(boss)) {
        this.breathClock = 0;
        this.exhale(PUFF_STYLES.breath, 0.5, 1, 0);
      }
    }
    if (boss.state !== 'defeated' && this.roarTime - step < 0.15 && this.roarTime >= 0.15) {
      for (let puff = 0; puff < 5; puff++) this.exhale(PUFF_STYLES.roar, 1.6, 1 + puff * 0.2, puff - 2);
    }
    if (boss.state === 'chargeWindup') {
      const before = ((this.stateTime - step) * PAW_RATE) % 1;
      const now = (this.stateTime * PAW_RATE) % 1;
      if (before < PAW_LIFT && now >= PAW_LIFT) {
        this.exhale(PUFF_STYLES.breath, 1.2, 1.2, -1);
        this.exhale(PUFF_STYLES.breath, 1.2, 1.2, 1);
        this.rig.ankles[1].getWorldPosition(this.point).setY(groundY + 0.05);
        this.burst(this.point, 2, PUFF_STYLES.dust, 0.9, 0.7);
      }
    }
    if (boss.phase === 3 && boss.state !== 'defeated') {
      this.steamClock += step;
      if (this.steamClock >= STEAM_EVERY) {
        this.steamClock = 0;
        this.steamSide = this.steamSide === 0 ? 1 : 0;
        this.rig.shoulders[this.steamSide].getWorldPosition(this.point);
        this.point.y += 0.12;
        this.puffs.emit(this.point, this.velocity.set(0, 0.3, 0), PUFF_STYLES.steam);
      }
    }
    if (boss.state !== 'defeated') return;
    if (this.passed(DEATH.kneel + 0.05, step)) {
      this.cues.impact = 0.6;
      this.rig.body.getWorldPosition(this.cues.impactAt).setY(groundY + 0.05);
      this.burst(this.cues.impactAt, 6, PUFF_STYLES.dust, 1.2, 1);
    }
    if (this.passed(DEATH.down + 0.05, step)) {
      this.cues.impact = 1;
      this.rig.torso.getWorldPosition(this.cues.impactAt).setY(groundY + 0.05);
      this.burst(this.cues.impactAt, 10, PUFF_STYLES.dust, 2, 1.4);
    }
  }

  private breathEvery(boss: CaptainUssrSnapshot): number {
    if (boss.state === 'stunned' || boss.state === 'chargeWindup') return BREATH_EVERY.winded;
    if (boss.phase === 3) return BREATH_EVERY.fury;
    return this.gait.weight > 0.5 ? BREATH_EVERY.march : BREATH_EVERY.rest;
  }

  /** A puff out of its mouth along its gaze at `speed`, fanned sideways by `spread`. */
  private exhale(style: PuffStyle, speed: number, scale: number, spread: number): void {
    this.rig.mouth.getWorldPosition(this.point);
    this.direction.copy(FACE).applyQuaternion(this.rig.head.getWorldQuaternion(this.worldQuaternion));
    this.axisX.set(1, 0, 0).applyQuaternion(this.worldQuaternion);
    this.velocity.copy(this.direction).multiplyScalar(speed).addScaledVector(this.axisX, spread * 0.12);
    this.velocity.y -= 0.08;
    this.puffs.emit(this.point, this.velocity, style, scale);
  }

  /** `count` puffs thrown out in a ring from `at`. */
  private burst(at: THREE.Vector3, count: number, style: PuffStyle, speed: number, scale: number): void {
    for (let puff = 0; puff < count; puff++) {
      const angle = (puff / count) * Math.PI * 2 + this.time;
      this.velocity.set(Math.cos(angle) * speed, 0.3, Math.sin(angle) * speed);
      this.puffs.emit(at, this.velocity, style, scale);
    }
  }

  /** The lower ankle's world position into `out`: the foot that just landed. */
  private lowerAnkle(out: THREE.Vector3): void {
    this.rig.ankles[0].getWorldPosition(out);
    this.rig.ankles[1].getWorldPosition(this.worldPosition);
    if (this.worldPosition.y < out.y) out.copy(this.worldPosition);
  }

  /** The current state's clock crossed `at` this frame. */
  private passed(at: number, step: number): boolean {
    return this.stateTime >= at && this.stateTime - step < at;
  }
}
