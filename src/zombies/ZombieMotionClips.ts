import * as THREE from 'three';
import { ZombieLimb } from './ZombieLimb';
import {
  createZombieDeathPose,
  sampleZombieDeath,
  ZOMBIE_DEATH_PROFILES,
  ZOMBIE_DEATH_STYLES,
  type ZombieDeathStyle,
} from './ZombieDeath';

export interface ZombieRestClips {
  readonly idle: THREE.AnimationClip;
  readonly deaths: ReadonlyMap<ZombieDeathStyle, THREE.AnimationClip>;
}

const IDLE_DURATION = 3.2;
const IDLE_FRAMES = 64;
const DEATH_FPS = 60;
/** Toe tips stay this high above the floor, visual-root meters (sole thickness). */
const TOE_FLOOR = 0.03;
/** A knee lower than this (fraction of height) releases its planted foot. */
const KNEE_FLOOR = 0.034;
/** Skinned vertices sampled per mesh for the floor check, and the tolerated sink, meters. */
const FLOOR_SAMPLES = 320;
const FLESH_FLOOR = -0.01;

/**
 * Builds the quiet idle used around gameplay actions and one death clip per
 * style (ZombieDeath). Locomotion deliberately stays on the untouched GLB
 * clips in ZombieVisual. Returns null for rigs without the expected bones.
 */
export function buildZombieRestClips(root: THREE.Object3D, height: number): ZombieRestClips | null {
  const find = (name: string): THREE.Object3D | undefined => root.getObjectByName(name);
  const hips = find('Hips');
  const spine = find('Spine');
  const torso = find('Spine1');
  const chest = find('Spine2');
  const head = find('Head');
  const arms: ZombieLimb[] = [];
  const legs: ZombieLimb[] = [];
  /** Toe tips per leg: untracked, they follow the foot and can dig into the floor. */
  const toes: (THREE.Object3D | undefined)[] = [];
  root.updateMatrixWorld(true);
  for (const side of ['Left', 'Right']) {
    const arm = [find(`${side}Arm`), find(`${side}ForeArm`), find(`${side}Hand`)];
    const leg = [find(`${side}UpLeg`), find(`${side}Leg`), find(`${side}Foot`)];
    if (arm.every(Boolean)) arms.push(new ZombieLimb(root, arm[0]!, arm[1]!, arm[2]!));
    if (!leg.every(Boolean)) continue;
    legs.push(new ZombieLimb(root, leg[0]!, leg[1]!, leg[2]!));
    toes.push(find(`${side}Toe_End`) ?? find(`${side}ToeBase`));
  }
  if (!hips || !torso || !head || arms.length !== 2 || legs.length !== 2) return null;

  const nodes = [...new Set([
    hips, spine ?? torso, torso, chest ?? torso, head,
    ...arms.flatMap((limb) => [limb.upper, limb.lower, limb.tip]),
    ...legs.flatMap((limb) => [limb.upper, limb.lower, limb.tip]),
  ])];
  const rotations = nodes.map((node) => node.quaternion.clone());
  const hipPosition = hips.position.clone();
  const rootPoint = (bone: THREE.Object3D): THREE.Vector3 => root.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
  const hipRest = rootPoint(hips);
  // The bind pose is already hunched; lying flat straightens that lean out of the spine.
  const neck = rootPoint(find('Neck') ?? head);
  const restLean = Math.atan2(neck.z - hipRest.z, neck.y - hipRest.y);
  // Legs ride the falling hips nearly straight rather than in the crouched bind pose.
  const legReach = legs.map((leg) => {
    const hip = rootPoint(leg.upper);
    const knee = rootPoint(leg.lower);
    return { hip, length: (hip.distanceTo(knee) + knee.distanceTo(rootPoint(leg.tip))) * 0.98 };
  });
  const rotation = new THREE.Quaternion();
  const basis = new THREE.Quaternion();
  const rootRotation = new THREE.Quaternion();
  const headRotation = new THREE.Quaternion();
  const forward = new THREE.Vector3();
  const point = new THREE.Vector3();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  /** Rotates a bone about visual-root axes; YXZ applies yaw last, as a turn of the tipped body. */
  const offset = (bone: THREE.Object3D, x: number, y: number, z: number): void => {
    bone.getWorldQuaternion(basis).invert();
    rotation.setFromEuler(euler.set(x, y, z));
    rotation.premultiply(basis).multiply(basis.invert());
    bone.quaternion.multiply(rotation);
  };
  /**
   * The walk clip animates the head forward, but this asset's raw bind pose
   * points it roughly 57 degrees sideways. Generated clips start from that
   * bind pose, so centre the gaze in visual-root space before layering.
   */
  const centreGaze = (extraYaw: number): void => {
    root.updateMatrixWorld(true);
    root.getWorldQuaternion(rootRotation).invert();
    head.getWorldQuaternion(headRotation).premultiply(rootRotation);
    forward.set(0, 0, 1).applyQuaternion(headRotation);
    offset(head, 0, extraYaw - Math.atan2(forward.x, forward.z), 0);
  };
  const bake = (name: string, duration: number, frames: number, pose: (t: number) => void): THREE.AnimationClip => {
    const values = nodes.map(() => [] as number[]);
    const positions: number[] = [];
    const times: number[] = [];
    for (let frame = 0; frame <= frames; frame++) {
      const t = frame / frames;
      nodes.forEach((node, index) => node.quaternion.copy(rotations[index]));
      hips.position.copy(hipPosition);
      pose(t);
      times.push(t * duration);
      nodes.forEach((node, index) => node.quaternion.toArray(values[index], values[index].length));
      hips.position.toArray(positions, positions.length);
    }
    const tracks: THREE.KeyframeTrack[] = nodes.map((node, index) =>
      new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values[index]));
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, positions));
    return new THREE.AnimationClip(name, duration, tracks);
  };
  /** Moves the hips to a visual-root-space point, whatever the armature axes. */
  const placeHips = (x: number, y: number, z: number): void => {
    root.localToWorld(point.set(x, y, z));
    hips.parent!.updateWorldMatrix(true, false);
    hips.position.copy(hips.parent!.worldToLocal(point));
  };
  const ankle = new THREE.Vector3();
  const toeDirection = new THREE.Vector3();
  const liftedDirection = new THREE.Vector3();
  const footRotation = new THREE.Quaternion();
  /** Pivots a foot about its ankle until the toe tip rests on the floor instead of under it. */
  const liftToes = (foot: THREE.Object3D, toe: THREE.Object3D): void => {
    root.worldToLocal(foot.getWorldPosition(ankle));
    root.worldToLocal(toe.getWorldPosition(toeDirection)).sub(ankle);
    const length = toeDirection.length();
    if (ankle.y + toeDirection.y >= TOE_FLOOR || length < 1e-4) return;
    const rise = THREE.MathUtils.clamp(TOE_FLOOR - ankle.y, -length, length);
    liftedDirection.set(toeDirection.x, 0, toeDirection.z);
    if (liftedDirection.lengthSq() < 1e-8) liftedDirection.set(0, 0, 1);
    liftedDirection.setLength(Math.sqrt(length * length - rise * rise)).setY(rise);
    rotation.setFromUnitVectors(toeDirection.normalize(), liftedDirection.normalize());
    // Root-space rotation → world → the foot's parent space.
    root.getWorldQuaternion(rootRotation);
    rotation.premultiply(rootRotation).multiply(rootRotation.invert());
    foot.getWorldQuaternion(footRotation).premultiply(rotation);
    foot.parent!.getWorldQuaternion(basis).invert();
    foot.quaternion.copy(basis.multiply(footRotation)).normalize();
  };
  const solveArm = (arm: ZombieLimb, x: number, y: number, z: number): void => {
    const side = Math.sign(arm.rest.x);
    arm.solve(side * height * x, height * y, height * z, side * height * 0.27, height * 0.48, 0, 1, 0, true);
  };

  const idle = bake('ZeroedZombieIdle', IDLE_DURATION, IDLE_FRAMES, (t) => {
    const phase = t * Math.PI * 2;
    placeHips(hipRest.x, hipRest.y - 0.015, hipRest.z);
    offset(torso, Math.sin(phase) * 0.009, 0, 0);
    offset(head, -0.025, 0, 0.025);
    legs.forEach((leg) => leg.solve(
      leg.rest.x, leg.rest.y, leg.rest.z,
      leg.rest.x, height * 0.27, 0.65, 1, 1,
    ));
    arms.forEach((arm, index) => solveArm(arm, 0.19, 0.49 + (index ? 0.035 : 0), 0.22 / height));
    // Barrier attacks freeze this idle underneath their choreography, so the
    // gaze must be centred; keep only a tiny, cyclic living drift.
    centreGaze(Math.sin(phase) * 0.035);
  });

  const probe = new THREE.Vector3();
  const rootY = (bone: THREE.Object3D): number => root.worldToLocal(bone.getWorldPosition(probe)).y;
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse((object) => { if (object instanceof THREE.SkinnedMesh) meshes.push(object); });
  /** Lowest skinned point over an even vertex sample: bulky rigs need more clearance than their joints suggest. */
  const lowestFlesh = (): number => {
    root.updateMatrixWorld(true);
    let lowest = Infinity;
    for (const mesh of meshes) {
      mesh.skeleton.update();
      const count = mesh.geometry.getAttribute('position').count;
      const stride = Math.max(1, Math.floor(count / FLOOR_SAMPLES));
      for (let i = 0; i < count; i += stride) {
        lowest = Math.min(lowest, root.worldToLocal(mesh.getVertexPosition(i, probe).applyMatrix4(mesh.matrixWorld)).y);
      }
    }
    return lowest;
  };
  const footTarget = new THREE.Vector3();
  const pose = createZombieDeathPose();
  const carriedFeet = legs.map(() => new THREE.Vector3());
  const carriedPoles = legs.map(() => new THREE.Vector3());
  const deaths = new Map<ZombieDeathStyle, THREE.AnimationClip>();
  for (const style of ZOMBIE_DEATH_STYLES) {
    const profile = ZOMBIE_DEATH_PROFILES[style];
    deaths.set(style, bake(`ZeroedZombieDeath_${style}`, profile.duration, Math.ceil(profile.duration * DEATH_FPS), (t) => {
      sampleZombieDeath(profile, t, pose);
      // 1. Upper body, authored upright so the fall below carries it along.
      centreGaze(0);
      const flat = Math.min(1, Math.abs(pose.pitch) / (Math.PI / 2));
      offset(spine ?? torso, -restLean * flat * flat * (3 - 2 * flat), 0, 0);
      offset(torso, pose.spine * 0.5, pose.twist * 0.5, 0);
      offset(chest ?? torso, pose.spine * 0.5, pose.twist * 0.5, 0);
      offset(head, pose.nod, pose.turn, pose.tilt);
      arms.forEach((arm) => {
        const hand = arm.rest.x > 0 ? pose.left : pose.right;
        solveArm(arm, hand[0], hand[1], hand[2]);
      });
      // 2. Where relaxed feet and knees would end if the legs rode the hips.
      hips.updateWorldMatrix(true, false);
      legReach.forEach(({ hip, length }, i) => {
        root.localToWorld(carriedFeet[i].set(hip.x, hip.y - length + pose.knees * height * 0.5, hip.z));
        root.localToWorld(carriedPoles[i].set(hip.x, height * 0.27, 0.65));
        hips.worldToLocal(carriedFeet[i]);
        hips.worldToLocal(carriedPoles[i]);
      });
      // 3. The fall itself: the whole body pivots and travels at the hips.
      placeHips(
        hipRest.x + pose.sway * height,
        hipRest.y * (1 - pose.drop),
        hipRest.z + pose.travel * height,
      );
      offset(hips, pose.pitch, pose.yaw, pose.roll);
      // 4. Planted feet buckle the knees; released ones follow the body. A
      //    knee that would sink through the floor lets its foot go early.
      hips.updateWorldMatrix(true, false);
      legs.forEach((leg, i) => {
        root.worldToLocal(hips.localToWorld(carriedFeet[i]));
        root.worldToLocal(hips.localToWorld(carriedPoles[i]));
        for (const release of [1, 0.5, 0]) {
          const plant = pose.plant * release;
          footTarget.copy(carriedFeet[i]).lerp(leg.rest, plant);
          leg.solve(footTarget.x, footTarget.y, footTarget.z,
            carriedPoles[i].x, carriedPoles[i].y, carriedPoles[i].z, 1, plant);
          if (plant === 0 || rootY(leg.lower) >= KNEE_FLOOR * height) break;
        }
        const toe = toes[i];
        if (toe) liftToes(leg.tip, toe);
      });
      // 5. Whatever still reaches below the floor lifts the whole body onto it.
      const sink = FLESH_FLOOR - lowestFlesh();
      if (sink > 0) {
        const lifted = rootPoint(hips);
        placeHips(lifted.x, lifted.y + sink, lifted.z);
      }
    }));
  }

  nodes.forEach((node, index) => node.quaternion.copy(rotations[index]));
  hips.position.copy(hipPosition);
  root.updateMatrixWorld(true);
  return { idle, deaths };
}
