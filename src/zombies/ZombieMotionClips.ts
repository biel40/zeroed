import * as THREE from 'three';
import { ZombieLimb } from './ZombieLimb';

/**
 * Builds only the quiet idle and reliable fall used around gameplay actions.
 * Locomotion deliberately stays on the untouched GLB clips in ZombieVisual.
 */
export function buildZombieRestClips(root: THREE.Object3D, height: number): readonly [THREE.AnimationClip, THREE.AnimationClip] | null {
  const find = (...names: string[]): THREE.Object3D | undefined => {
    for (const name of names) {
      const bone = root.getObjectByName(name);
      if (bone) return bone;
    }
    return undefined;
  };
  const hips = find('Hips');
  const torso = find('Spine1', 'Torso');
  const head = find('Head');
  const arms: ZombieLimb[] = [];
  const legs: ZombieLimb[] = [];
  root.updateMatrixWorld(true);
  for (const side of ['Left', 'Right']) {
    const suffix = side === 'Left' ? 'L' : 'R';
    const arm = [
      find(`${side}Arm`, `Shoulder${suffix}`),
      find(`${side}ForeArm`, `Elbow${suffix}`),
      find(`${side}Hand`, `BrutusHand${suffix}`),
    ];
    const leg = [
      find(`${side}UpLeg`, `Leg${suffix}`),
      find(`${side}Leg`, `Knee${suffix}`),
      find(`${side}Foot`, `BrutusBoot${suffix}`),
    ];
    if (arm.every(Boolean)) arms.push(new ZombieLimb(root, arm[0]!, arm[1]!, arm[2]!));
    if (leg.every(Boolean)) legs.push(new ZombieLimb(root, leg[0]!, leg[1]!, leg[2]!));
  }
  if (!hips || !torso || !head || arms.length !== 2 || legs.length !== 2) return null;

  const nodes = [...new Set([
    hips, torso, head,
    ...arms.flatMap((limb) => [limb.upper, limb.lower, limb.tip]),
    ...legs.flatMap((limb) => [limb.upper, limb.lower, limb.tip]),
  ])];
  const rotations = nodes.map((node) => node.quaternion.clone());
  const hipPosition = hips.position.clone();
  const hipScale = hips.parent!.getWorldScale(new THREE.Vector3()).y;
  const rotation = new THREE.Quaternion();
  const basis = new THREE.Quaternion();
  const rootRotation = new THREE.Quaternion();
  const headRotation = new THREE.Quaternion();
  const forward = new THREE.Vector3();
  const euler = new THREE.Euler();
  const offset = (bone: THREE.Object3D, x: number, y: number, z: number): void => {
    bone.getWorldQuaternion(basis).invert();
    rotation.setFromEuler(euler.set(x, y, z));
    rotation.premultiply(basis).multiply(basis.invert());
    bone.quaternion.multiply(rotation);
  };

  const clips: THREE.AnimationClip[] = [];
  for (const mode of ['Idle', 'Death'] as const) {
    const duration = mode === 'Idle' ? 3.2 : 1;
    const values = nodes.map(() => [] as number[]);
    const positions: number[] = [];
    const times: number[] = [];
    for (let frame = 0; frame <= 64; frame++) {
      const t = frame / 64;
      const phase = t * Math.PI * 2;
      nodes.forEach((node, index) => node.quaternion.copy(rotations[index]));
      hips.position.copy(hipPosition);
      const death = mode === 'Death' ? t * t * (3 - 2 * t) : 0;
      hips.position.y -= 0.015 / hipScale;
      offset(torso, Math.sin(phase) * 0.009 + death * 0.06, 0, 0);
      offset(head, -0.025 - death * 0.18, 0, 0.025);
      legs.forEach((leg) => leg.solve(
        leg.rest.x, leg.rest.y, leg.rest.z,
        leg.rest.x, height * 0.27, 0.65, 1, true,
      ));
      arms.forEach((arm, index) => {
        const side = Math.sign(arm.rest.x);
        arm.solve(
          side * height * (0.19 + death * 0.035),
          height * 0.49 + (index ? 0.035 : 0),
          0.22,
          side * height * 0.27,
          height * 0.48,
          0,
          1,
          false,
          true,
        );
      });
      if (death > 0) {
        hips.position.y -= death * height * 0.43 / hipScale;
        offset(hips, -death * 1.72, 0, death * 0.08);
      }
      if (mode === 'Idle') {
        // The walk clip animates the head forward, but this asset's raw bind
        // pose points it roughly 57 degrees sideways. Barrier attacks freeze
        // this technical idle underneath their choreography, so that bind yaw
        // made an otherwise aligned zombie visibly look away from the window.
        // Centre the gaze in visual-root space and retain only a tiny, cyclic
        // living drift rather than a rigidly fixed head.
        root.updateMatrixWorld(true);
        root.getWorldQuaternion(rootRotation).invert();
        head.getWorldQuaternion(headRotation).premultiply(rootRotation);
        forward.set(0, 0, 1).applyQuaternion(headRotation);
        const yaw = Math.atan2(forward.x, forward.z);
        offset(head, 0, Math.sin(phase) * 0.035 - yaw, 0);
      }
      times.push(t * duration);
      nodes.forEach((node, index) => node.quaternion.toArray(values[index], values[index].length));
      hips.position.toArray(positions, positions.length);
    }
    const tracks: THREE.KeyframeTrack[] = nodes.map((node, index) =>
      new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values[index]));
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, positions));
    clips.push(new THREE.AnimationClip(`ZeroedZombie${mode}`, duration, tracks));
  }

  nodes.forEach((node, index) => node.quaternion.copy(rotations[index]));
  hips.position.copy(hipPosition);
  root.updateMatrixWorld(true);
  return clips as [THREE.AnimationClip, THREE.AnimationClip];
}
