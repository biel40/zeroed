import * as THREE from 'three';
import { ZombieLimb } from './ZombieLimb';

/** Bake a small, coordinated pose set once per model. Runtime uses the normal
 * mixer; only aimed attacks need a live arm solve. No imported root motion. */
function buildRestClips(root: THREE.Object3D, height: number): THREE.AnimationClip[] {
  const find = (...names: string[]): THREE.Object3D | undefined => {
    for (const name of names) { const bone = root.getObjectByName(name); if (bone) return bone; }
    return undefined;
  };
  const hips = find('Hips');
  const torso = find('Spine1', 'Torso');
  const head = find('Head');
  const arms: ZombieLimb[] = [];
  const legs: ZombieLimb[] = [];
  root.updateMatrixWorld(true);
  for (const side of ['Left', 'Right']) {
    const s = side === 'Left' ? 'L' : 'R';
    const arm = [find(`${side}Arm`, `Shoulder${s}`), find(`${side}ForeArm`, `Elbow${s}`), find(`${side}Hand`, `BrutusHand${s}`)];
    const leg = [find(`${side}UpLeg`, `Leg${s}`), find(`${side}Leg`, `Knee${s}`), find(`${side}Foot`, `BrutusBoot${s}`)];
    if (arm.every(Boolean)) arms.push(new ZombieLimb(root, arm[0]!, arm[1]!, arm[2]!));
    if (leg.every(Boolean)) legs.push(new ZombieLimb(root, leg[0]!, leg[1]!, leg[2]!));
  }
  if (!hips || !torso || !head || arms.length !== 2 || legs.length !== 2) return [];
  const nodes = [...new Set([hips, torso, head, ...arms.flatMap(l => [l.upper, l.lower, l.tip]),
    ...legs.flatMap(l => [l.upper, l.lower, l.tip])])];
  const rotations = nodes.map(n => n.quaternion.clone());
  const hipPosition = hips.position.clone();
  const hipScale = hips.parent!.getWorldScale(new THREE.Vector3()).y;
  const rotation = new THREE.Quaternion();
  const basis = new THREE.Quaternion();
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
      nodes.forEach((n, i) => n.quaternion.copy(rotations[i]));
      hips.position.copy(hipPosition);
      const death = mode === 'Death' ? t * t * (3 - 2 * t) : 0;
      hips.position.y -= 0.015 / hipScale;
      offset(torso, Math.sin(phase) * 0.009 + death * 0.06, 0, 0);
      offset(head, -0.025 - death * 0.18, 0, 0.025);
      legs.forEach(leg => leg.solve(leg.rest.x, leg.rest.y, leg.rest.z, leg.rest.x, height * 0.27, 0.65, 1, true));
      arms.forEach((arm, i) => {
        const side = Math.sign(arm.rest.x);
        arm.solve(side * height * (0.19 + death * 0.035), height * 0.49 + (i ? 0.035 : 0),
          0.22, side * height * 0.27, height * 0.48, 0, 1, false, true);
      });
      if (death > 0) {
        // Settle the already articulated body; solving planted feet after
        // lowering the pelvis folds the knees into the chest.
        hips.position.y -= death * height * 0.43 / hipScale;
        offset(hips, -death * 1.72, 0, death * 0.08);
      }
      times.push(t * duration);
      nodes.forEach((n, i) => n.quaternion.toArray(values[i], values[i].length));
      hips.position.toArray(positions, positions.length);
    }
    const tracks: THREE.KeyframeTrack[] = nodes.map((n, i) => new THREE.QuaternionKeyframeTrack(`${n.name}.quaternion`, times, values[i]));
    tracks.push(new THREE.VectorKeyframeTrack(`${hips.name}.position`, times, positions));
    clips.push(new THREE.AnimationClip(`ZeroedZombie${mode}`, duration, tracks));
  }
  nodes.forEach((n, i) => n.quaternion.copy(rotations[i]));
  hips.position.copy(hipPosition);
  root.updateMatrixWorld(true);
  return clips;
}

/** Preserve authored hip/knee/ankle coordination, but reauthor the upper body
 * around the relaxed idle pose. No locomotion IK and no animated bone scales. */
export function buildZombieMotionClips(root: THREE.Object3D, height: number, source: readonly THREE.AnimationClip[]): THREE.AnimationClip[] {
  const find = (suffix: string): THREE.AnimationClip | undefined => source.find(clip => clip.name.toLowerCase().endsWith(suffix.toLowerCase()));
  const walk = find('ZombieWalk') ?? find('BruteWalk');
  if (!walk) return [];
  const fallback = buildRestClips(root, height);
  const idle = find('ZombieIdle');
  const run = find('ZombieRun') ?? walk;
  const reference = new Map<string, THREE.Quaternion>();
  const rest = new Map<string, THREE.Vector3>();
  root.traverse(bone => {
    if (!bone.name) return;
    reference.set(bone.name, bone.quaternion.clone().normalize());
    rest.set(bone.name, bone.position.clone());
  });
  for (const track of idle?.tracks ?? []) {
    if (track.name.endsWith('.quaternion')) {
      reference.set(track.name.slice(0, -11), new THREE.Quaternion().fromArray(track.values).normalize());
    }
  }
  const q = new THREE.Quaternion();
  const build = (clip: THREE.AnimationClip, mode: 'Idle' | 'Walk' | 'Run'): THREE.AnimationClip => {
    const tracks: THREE.KeyframeTrack[] = [];
    const upper = /Spine|Torso|Head|Shoulder|Arm|Hand|Elbow/;
    const arms = /Shoulder|Arm|Hand|Elbow/;
    const seen = new Set<string>();
    for (const original of clip.tracks) {
      // Scale tracks contain exporter noise; a rotation must remain a rotation.
      if (original.name.endsWith('.scale')) continue;
      const track = original.clone();
      const node = track.name.split('.')[0];
      if (track.name.endsWith('.quaternion')) {
        const anchor = reference.get(node);
        const walkerWalk = mode === 'Walk' && height <= 2;
        const weight = mode === 'Idle' ? 0.35
          : arms.test(node) ? (walkerWalk ? 0.52 : mode === 'Run' ? 0.24 : 0.12)
            : upper.test(node) ? (walkerWalk ? 0.6 : 0.3)
              : node === 'Hips' ? 0.45 : 1;
        for (let i = 0; i < track.values.length; i += 4) {
          q.fromArray(track.values, i).normalize();
          if (anchor) q.slerp(anchor, 1 - weight).normalize();
          q.toArray(track.values, i);
        }
        seen.add(node);
      } else if (track.name.endsWith('.position') && node === 'Hips') {
        const base = rest.get(node)!;
        let meanX = 0, meanZ = 0;
        for (let i = 0; i < track.values.length; i += 3) { meanX += track.values[i]; meanZ += track.values[i + 2]; }
        meanX /= track.values.length / 3;
        meanZ /= track.values.length / 3;
        for (let i = 0; i < track.values.length; i += 3) {
          track.values[i] = base.x + (track.values[i] - meanX) * 0.2;
          track.values[i + 2] = base.z + (track.values[i + 2] - meanZ) * 0.3;
        }
      }
      tracks.push(track);
    }
    // Every arm segment has a deliberate pose even if the source omitted it.
    for (const [name, pose] of reference) {
      if (upper.test(name) && !seen.has(name)) tracks.push(new THREE.QuaternionKeyframeTrack(name + '.quaternion', [0, clip.duration], [...pose.toArray(), ...pose.toArray()]));
    }
    const result = new THREE.AnimationClip('ZeroedZombie' + mode, clip.duration, tracks);
    if (mode !== 'Idle') calibrateStride(root, result, mode === 'Run' && run !== walk ? 3.1 : height > 2 ? 1.05 : 1.35);
    return result;
  };
  return [idle ? build(idle, 'Idle') : fallback[0], build(walk, 'Walk'), build(run, 'Run'), fallback[1]];
}

/** Measure the authored support-foot travel once, then retime the clip to its
 * declared ground speed. Retiming preserves the human joint coordination. */
function calibrateStride(root: THREE.Object3D, clip: THREE.AnimationClip, referenceSpeed: number): void {
  const left = root.getObjectByName('LeftFoot') ?? root.getObjectByName('BrutusBootL');
  const right = root.getObjectByName('RightFoot') ?? root.getObjectByName('BrutusBootR');
  if (!left || !right) return;
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const feet = [left, right];
  const samples: THREE.Vector3[][] = [[], []];
  const count = 120;
  for (let frame = 0; frame <= count; frame++) {
    mixer.setTime(clip.duration * frame / count);
    feet.forEach((foot, index) => samples[index].push(foot.getWorldPosition(new THREE.Vector3())));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  root.updateMatrixWorld(true);
  const speeds: number[] = [];
  for (let side = 0; side < 2; side++) {
    const floor = Math.min(...samples[side].map(point => point.y));
    for (let frame = 1; frame <= count; frame++) {
      const point = samples[side][frame];
      const before = samples[side][frame - 1];
      const speed = (before.z - point.z) * count / clip.duration;
      if (point.y < floor + 0.035 && speed > 0.05) speeds.push(speed);
    }
  }
  if (!speeds.length) return;
  speeds.sort((a, b) => a - b);
  const factor = speeds[Math.floor(speeds.length / 2)] / referenceSpeed;
  for (const track of clip.tracks) track.scale(factor);
  clip.duration *= factor;
}

