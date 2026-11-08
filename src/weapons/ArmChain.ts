import * as THREE from 'three';
import { ARM_FOREARM_LENGTH, ARM_UPPER_LENGTH } from './ArmRig';
import { RIGHT_SHOULDER } from './ViewArms';

/**
 * Arm chain in camera space: shoulder (yaw, pitch, roll) -> elbow (flex,
 * forearm twist) -> hand, with the shared right arm's shoulder and lengths.
 * The hand never rotates relative to the forearm, so a one-handed action
 * comes from the whole arm instead of an isolated wrist flick. The chain
 * carries no arm geometry: the shared right hand follows it through
 * `readHandTarget()`.
 */
export interface ArmPose {
  readonly yaw: number;
  readonly pitch: number;
  readonly roll: number;
  readonly flex: number;
  readonly twist: number;
}

/** Hidden below the right edge of the screen: where one-handed actions start and end. */
export const ARM_REST_BELOW_SCREEN: ArmPose = { yaw: -0.879, pitch: -2.067, roll: 0.394, flex: 2.009, twist: -0.851 };

/** Hammer grip: a held object crosses the fist at ~70 degrees to the forearm. */
export const FIST_GRIP_ROTATION = new THREE.Euler(-0.987, 0.221, -0.962);

/**
 * Hand rotation in the forearm frame: the grip runs along the hand's thumb
 * axis and the knuckles follow the forearm, so the wrist stays straight.
 */
const HAND_IN_FOREARM = (() => {
  const y = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromEuler(FIST_GRIP_ROTATION));
  const z = new THREE.Vector3(0, 0, -1).addScaledVector(y, y.z).normalize().negate();
  const x = new THREE.Vector3().crossVectors(y, z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
})();

const JOINTS = ['yaw', 'pitch', 'roll', 'flex', 'twist'] as const;
type Joint = (typeof JOINTS)[number];

export interface ArmKey {
  readonly at: number;
  readonly pose: ArmPose;
  /** Joint velocity per unit of progress; zero where the arm settles. */
  readonly velocity: ArmPose;
}

/** A key as authored: `drive` scales the tangent through its neighbours (1 = Catmull-Rom); absent, the arm settles there. */
export interface ArmKeySpec {
  readonly at: number;
  readonly pose: ArmPose;
  readonly drive?: number | ArmPose;
}

/** Hermite keys from authored poses; the first and last keys must not drive. */
export function buildArmKeys(keys: readonly ArmKeySpec[]): ArmKey[] {
  const still: ArmPose = { yaw: 0, pitch: 0, roll: 0, flex: 0, twist: 0 };
  return keys.map(({ at, pose, drive }, index) => {
    if (!drive) return { at, pose, velocity: still };
    const before = keys[index - 1];
    const after = keys[index + 1];
    const velocity: Record<Joint, number> = { ...still };
    for (const joint of JOINTS) {
      const scale = typeof drive === 'number' ? drive : drive[joint];
      velocity[joint] = (scale * (after.pose[joint] - before.pose[joint])) / (after.at - before.at);
    }
    return { at, pose, velocity };
  });
}

function hermite(from: ArmKey, to: ArmKey, joint: Joint, s: number): number {
  const span = to.at - from.at;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * from.pose[joint]
    + (s3 - 2 * s2 + s) * span * from.velocity[joint]
    + (3 * s2 - 2 * s3) * to.pose[joint]
    + (s3 - s2) * span * to.velocity[joint];
}

/**
 * The right arm's shoulder -> elbow -> hand groups, posed from keys. The
 * owner parents `root` to the camera and adds what the hand holds to `hand`.
 */
export class ArmChain {
  public readonly root = new THREE.Group();
  /** Where a held object's grip centre sits; its axes are the forearm's. */
  public readonly hand = new THREE.Group();
  private readonly shoulder = new THREE.Group();
  private readonly elbow = new THREE.Group();

  public constructor(name: string) {
    this.shoulder.name = `${name}-upper-arm`;
    this.shoulder.position.copy(RIGHT_SHOULDER);
    this.root.add(this.shoulder);
    this.elbow.name = `${name}-forearm`;
    this.elbow.position.z = -ARM_UPPER_LENGTH;
    this.shoulder.add(this.elbow);
    this.hand.name = `${name}-hand`;
    this.hand.position.z = -ARM_FOREARM_LENGTH;
    this.elbow.add(this.hand);
  }

  /** Poses the chain at `progress` (0..1) through `keys`. */
  public apply(keys: readonly ArmKey[], progress: number): void {
    let index = 1;
    while (index < keys.length - 1 && progress >= keys[index].at) index++;
    const from = keys[index - 1];
    const to = keys[index];
    const s = THREE.MathUtils.clamp((progress - from.at) / (to.at - from.at), 0, 1);
    this.shoulder.rotation.set(
      hermite(from, to, 'pitch', s),
      hermite(from, to, 'yaw', s),
      hermite(from, to, 'roll', s),
      'YXZ',
    );
    this.elbow.rotation.set(hermite(from, to, 'flex', s), 0, hermite(from, to, 'twist', s), 'XYZ');
  }

  /** World-space grip point, straight-wrist hand rotation and elbow of the chain. */
  public readHandTarget(grip: THREE.Vector3, rotation: THREE.Quaternion, elbow: THREE.Vector3): void {
    this.root.updateWorldMatrix(true, true);
    this.hand.getWorldPosition(grip);
    this.elbow.getWorldQuaternion(rotation).multiply(HAND_IN_FOREARM);
    this.elbow.getWorldPosition(elbow);
  }
}
