import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EYE_HEIGHT } from '../player/PlayerController';

/**
 * Remote teammate body. The final look is a skinned, animated WWII infantry
 * GLB loaded from REMOTE_SOLDIER_MODEL_URL; see ASSETS.md for the contract.
 * When that asset is absent the procedural stand-in keeps co-op playable.
 */
export const REMOTE_SOLDIER_MODEL_URL = 'assets/players/soldier.glb';

export interface RemotePlayerModelSource {
  readonly scene: THREE.Object3D;
  readonly clips: readonly THREE.AnimationClip[];
}

/** Gameplay-derived motion; bones are never networked. */
export interface RemoteAvatarMotion {
  /** Planar speed in m/s. */
  speed: number;
  /** Signed speed along the facing direction; negative means backpedaling. */
  forwardSpeed: number;
  /** Look pitch in radians, positive up. */
  pitch: number;
  aiming: boolean;
  reloading: boolean;
  alive: boolean;
}

/** World-space body only: no camera, input, HUD or first-person weapon. Origin at the feet, facing -Z. */
export interface RemoteAvatar {
  readonly group: THREE.Group;
  readonly isSkinned: boolean;
  update(dt: number, motion: Readonly<RemoteAvatarMotion>): void;
  playFire(): void;
  dispose(): void;
}

export function createRemoteAvatar(source: RemotePlayerModelSource | null, castShadow: boolean): RemoteAvatar {
  if (source) {
    try {
      return new SkinnedSoldierAvatar(source, castShadow);
    } catch (error) {
      console.warn('[RemotePlayerAvatar] Soldier GLB is unusable; using the procedural stand-in.', error);
    }
  }
  return new ProceduralSoldierAvatar(castShadow);
}

export type ClipRole = 'idle' | 'walk' | 'run' | 'aim' | 'fire' | 'reload' | 'death';

const CLIP_PATTERNS: Readonly<Record<ClipRole, RegExp>> = {
  idle: /idle/i,
  walk: /walk/i,
  run: /run|jog|sprint/i,
  aim: /aim/i,
  fire: /fire|shoot/i,
  reload: /reload/i,
  death: /death|die|dying/i,
};
/** Bones driven by aim/fire/reload layers; legs and hips stay on locomotion. Covers Mixamo and Quaternius rigs. */
const UPPER_BODY_BONE = /spine|chest|torso|abdomen|neck|head|clavicle|shoulder|arm|elbow|wrist|hand|fist|palm|finger|thumb|index|middle|ring|pinky/i;
const PITCH_BONE_PREFERENCE = [/spine2/i, /chest/i, /torso/i, /spine1/i, /spine/i, /abdomen/i];
const TARGET_HEIGHT = 1.8;
const WALK_CLIP_SPEED = 1.5;
const RUN_CLIP_SPEED = 4.2;
const RUN_THRESHOLD = 2.8;
const IDLE_THRESHOLD = 0.25;
const BLEND_RATE = 8;
const PITCH_SHARE = 0.6;
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Shortest clip name for a role, so `Idle` wins over `Idle_Shoot`. */
export function findClip<T extends { readonly name: string }>(clips: readonly T[], role: ClipRole): T | null {
  let best: T | null = null;
  for (const clip of clips) {
    if (!CLIP_PATTERNS[role].test(clip.name)) continue;
    if (!best || clip.name.length < best.name.length) best = clip;
  }
  return best;
}

function upperBodyClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  const tracks = clip.tracks.filter((track) =>
    UPPER_BODY_BONE.test(THREE.PropertyBinding.parseTrackName(track.name).nodeName));
  return new THREE.AnimationClip(`${clip.name}_upper`, clip.duration, tracks);
}

function approach(current: number, target: number, dt: number): number {
  return current + (target - current) * Math.min(1, dt * BLEND_RATE);
}

/**
 * Skinned GLB soldier driven by an AnimationMixer: idle/walk/run locomotion
 * blended by real ground speed (time-scaled, reversed when backpedaling so
 * feet never slide), upper-body aim/fire/reload layers filtered to torso and
 * arm bones, and the look pitch added to a spine bone after sampling.
 */
class SkinnedSoldierAvatar implements RemoteAvatar {
  public readonly group = new THREE.Group();
  public readonly isSkinned = true;

  private readonly model: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private readonly run: THREE.AnimationAction | null;
  private readonly aim: THREE.AnimationAction | null;
  private readonly fire: THREE.AnimationAction | null;
  private readonly reload: THREE.AnimationAction | null;
  private readonly death: THREE.AnimationAction | null;
  private readonly pitchBone: THREE.Bone | null;
  private readonly pitchBoneRest = new THREE.Quaternion();
  private readonly pitchBoneAnimated: boolean;
  private readonly tmpQuaternion = new THREE.Quaternion();
  private idleWeight = 1;
  private walkWeight = 0;
  private runWeight = 0;
  private aimWeight = 0;
  private reloadWeight = 0;
  private dead = false;

  public constructor(source: RemotePlayerModelSource, castShadow: boolean) {
    const idleClip = findClip(source.clips, 'idle');
    const walkClip = findClip(source.clips, 'walk');
    if (!idleClip || !walkClip) throw new Error('Soldier GLB needs at least Idle and Walk clips');

    this.model = cloneSkeleton(source.scene);
    this.model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(this.model);
    const height = bounds.max.y - bounds.min.y;
    const scale = height > 0.1 ? TARGET_HEIGHT / height : 1;
    this.model.scale.multiplyScalar(scale);
    this.model.position.y -= bounds.min.y * scale;
    // glTF characters face +Z; gameplay bodies face -Z.
    this.model.rotation.y = Math.PI;
    let pitchBone: THREE.Bone | null = null;
    const bones: THREE.Bone[] = [];
    this.model.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = castShadow;
        // Animated limbs leave the bind-pose bounds; culling them popped bodies.
        if ((object as THREE.SkinnedMesh).isSkinnedMesh) object.frustumCulled = false;
      }
      if ((object as THREE.Bone).isBone) bones.push(object as THREE.Bone);
    });
    for (const pattern of PITCH_BONE_PREFERENCE) {
      pitchBone = bones.find((bone) => pattern.test(bone.name)) ?? null;
      if (pitchBone) break;
    }
    this.pitchBone = pitchBone;
    if (pitchBone) this.pitchBoneRest.copy(pitchBone.quaternion);
    this.pitchBoneAnimated = !!pitchBone && source.clips.some((clip) => clip.tracks.some((track) => {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      return parsed.nodeName === pitchBone?.name && parsed.propertyName === 'quaternion';
    }));
    this.group.add(this.model);

    this.mixer = new THREE.AnimationMixer(this.model);
    this.idle = this.loop(idleClip, 1);
    this.walk = this.loop(walkClip, 0);
    const runClip = findClip(source.clips, 'run');
    this.run = runClip ? this.loop(runClip, 0) : null;
    const aimClip = findClip(source.clips, 'aim');
    this.aim = aimClip ? this.loop(upperBodyClip(aimClip), 0) : null;
    const reloadClip = findClip(source.clips, 'reload');
    this.reload = reloadClip ? this.loop(upperBodyClip(reloadClip), 0) : null;
    const fireClip = findClip(source.clips, 'fire');
    this.fire = fireClip ? this.once(upperBodyClip(fireClip), false) : null;
    const deathClip = findClip(source.clips, 'death');
    this.death = deathClip ? this.once(deathClip, true) : null;
  }

  public update(dt: number, motion: Readonly<RemoteAvatarMotion>): void {
    if (!motion.alive) {
      this.enterDeath();
    } else if (this.dead) {
      this.dead = false;
      this.death?.stop();
      // A completed fade-out disables the action; reset() re-enables it.
      for (const action of [this.idle, this.walk, this.run, this.aim, this.reload]) action?.reset().play();
    }
    if (!this.dead) this.blendLocomotion(dt, motion);
    this.mixer.update(dt);
    if (this.pitchBone && !this.dead) {
      if (!this.pitchBoneAnimated) this.pitchBone.quaternion.copy(this.pitchBoneRest);
      this.pitchBone.quaternion.multiply(this.tmpQuaternion.setFromAxisAngle(X_AXIS, -motion.pitch * PITCH_SHARE));
    }
  }

  public playFire(): void {
    if (!this.fire || this.dead) return;
    this.fire.reset().setEffectiveWeight(1).play();
  }

  public dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.group.removeFromParent();
  }

  private blendLocomotion(dt: number, motion: Readonly<RemoteAvatarMotion>): void {
    const moving = motion.speed > IDLE_THRESHOLD;
    const running = !!this.run && motion.speed > RUN_THRESHOLD;
    this.idleWeight = approach(this.idleWeight, moving ? 0 : 1, dt);
    this.walkWeight = approach(this.walkWeight, moving && !running ? 1 : 0, dt);
    this.runWeight = approach(this.runWeight, running ? 1 : 0, dt);
    this.aimWeight = approach(this.aimWeight, motion.aiming && !motion.reloading ? 1 : 0, dt);
    this.reloadWeight = approach(this.reloadWeight, motion.reloading ? 1 : 0, dt);
    const direction = motion.forwardSpeed < -0.3 ? -1 : 1;
    this.idle.setEffectiveWeight(this.idleWeight);
    this.walk.setEffectiveWeight(this.walkWeight);
    this.walk.timeScale = direction * THREE.MathUtils.clamp(motion.speed / WALK_CLIP_SPEED, 0.6, 2.4);
    if (this.run) {
      this.run.setEffectiveWeight(this.runWeight);
      this.run.timeScale = direction * THREE.MathUtils.clamp(motion.speed / RUN_CLIP_SPEED, 0.7, 1.6);
    }
    this.aim?.setEffectiveWeight(this.aimWeight);
    this.reload?.setEffectiveWeight(this.reloadWeight);
  }

  private enterDeath(): void {
    if (this.dead) return;
    this.dead = true;
    for (const action of [this.idle, this.walk, this.run, this.aim, this.reload, this.fire]) action?.fadeOut(0.2);
    this.death?.reset().setEffectiveWeight(1).fadeIn(0.15).play();
  }

  private loop(clip: THREE.AnimationClip, weight: number): THREE.AnimationAction {
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.setEffectiveWeight(weight);
    action.play();
    return action;
  }

  private once(clip: THREE.AnimationClip, clampAtEnd: boolean): THREE.AnimationAction {
    const action = this.mixer.clipAction(clip);
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = clampAtEnd;
    return action;
  }
}

/**
 * Stand-in used only when the soldier GLB is missing. It is intentionally a
 * fallback, not the target art: it keeps teammates readable and animated
 * (stride from real speed, backpedal, aim pitch, recoil, reload, collapse).
 */
class ProceduralSoldierAvatar implements RemoteAvatar {
  public readonly group = new THREE.Group();
  public readonly isSkinned = false;

  private readonly body = new THREE.Group();
  private readonly legs: [THREE.Group, THREE.Group];
  private readonly arms: [THREE.Group, THREE.Group];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private walkPhase = 0;
  private walkBlend = 0;
  private fireKick = 0;
  private reloadBlend = 0;
  private deathBlend = 0;

  public constructor(castShadow: boolean) {
    // Parts were authored around the eye point; the body group lifts them onto the feet origin.
    this.body.position.y = EYE_HEIGHT;
    this.group.add(this.body);
    const material = (color: number, roughness: number, metalness = 0): THREE.MeshStandardMaterial => {
      const created = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      this.materials.push(created);
      return created;
    };
    const cloth = material(0x555744, 1);
    const clothDark = material(0x3b4033, 1);
    const trousers = material(0x514e3e, 1);
    const webbing = material(0x68664f, 1);
    const leather = material(0x292820, 0.96);
    const skin = material(0x9b8068, 1);
    const helmet = material(0x41493d, 0.94, 0.08);
    const steel = material(0x30322e, 0.83, 0.26);
    const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, surface: THREE.Material,
      x: number, y: number, z: number): THREE.Mesh => {
      this.geometries.push(geometry);
      const part = new THREE.Mesh(geometry, surface);
      part.position.set(x, y, z);
      part.castShadow = castShadow;
      parent.add(part);
      return part;
    };
    const oval = (parent: THREE.Object3D, surface: THREE.Material,
      x: number, y: number, z: number, sx: number, sy: number, sz: number): THREE.Mesh => {
      const part = add(parent, new THREE.SphereGeometry(1, 10, 8), surface, x, y, z);
      part.scale.set(sx, sy, sz);
      return part;
    };
    const root = this.body;

    oval(root, skin, 0, -0.27, 0, 0.115, 0.155, 0.11);
    oval(root, skin, 0, -0.36, -0.027, 0.086, 0.062, 0.085);
    oval(root, skin, 0, -0.28, -0.115, 0.027, 0.035, 0.027);
    for (const side of [-1, 1]) {
      oval(root, skin, side * 0.112, -0.28, 0.002, 0.02, 0.037, 0.022);
      oval(root, clothDark, side * 0.048, -0.265, -0.108, 0.011, 0.005, 0.004);
    }
    add(root, new THREE.CylinderGeometry(0.073, 0.083, 0.09, 10), skin, 0, -0.43, 0);
    const shell = add(root, new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), helmet, 0, -0.14, 0);
    shell.scale.set(0.165, 0.16, 0.155);
    add(root, new THREE.CylinderGeometry(0.169, 0.174, 0.035, 16), helmet, 0, -0.145, -0.005);
    const brim = oval(root, helmet, 0, -0.155, -0.026, 0.177, 0.018, 0.17);
    brim.rotation.x = -0.06;
    for (const side of [-1, 1]) {
      const strap = add(root, new THREE.BoxGeometry(0.015, 0.17, 0.012), leather, side * 0.114, -0.265, 0.006);
      strap.rotation.z = side * 0.22;
    }

    add(root, new THREE.CylinderGeometry(0.222, 0.185, 0.52, 12), cloth, 0, -0.73, 0);
    oval(root, cloth, 0, -0.56, 0, 0.245, 0.12, 0.148);
    add(root, new THREE.CylinderGeometry(0.105, 0.12, 0.11, 10), clothDark, 0, -0.49, 0);
    add(root, new THREE.BoxGeometry(0.37, 0.065, 0.28), webbing, 0, -0.98, 0);
    for (const side of [-1, 1]) {
      const lapel = add(root, new THREE.BoxGeometry(0.083, 0.22, 0.019), clothDark, side * 0.066, -0.622, -0.162);
      lapel.rotation.z = side * 0.28;
      add(root, new THREE.BoxGeometry(0.105, 0.063, 0.015), clothDark, side * 0.09, -0.765, -0.186);
    }
    add(root, new THREE.BoxGeometry(0.018, 0.39, 0.012), clothDark, 0, -0.755, -0.181);
    add(root, new THREE.BoxGeometry(0.05, 0.042, 0.018), steel, 0, -0.98, -0.155);
    for (const side of [-1, 1]) {
      const strap = add(root, new THREE.BoxGeometry(0.044, 0.46, 0.025), webbing, side * 0.135, -0.735, -0.145);
      strap.rotation.z = side * 0.16;
      add(root, new THREE.BoxGeometry(0.105, 0.095, 0.061), webbing, side * 0.125, -0.91, -0.17);
      add(root, new THREE.BoxGeometry(0.09, 0.13, 0.07), clothDark, side * 0.19, -0.86, 0.105);
    }
    add(root, new THREE.BoxGeometry(0.275, 0.32, 0.105), clothDark, 0, -0.74, 0.18);

    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.265, -0.53, 0);
      shoulder.rotation.z = side * 0.09;
      root.add(shoulder);
      oval(shoulder, cloth, 0, -0.06, 0, 0.097, 0.12, 0.097);
      add(shoulder, new THREE.CylinderGeometry(0.085, 0.073, 0.31, 10), cloth, 0, -0.2, 0);
      const forearm = new THREE.Group();
      forearm.position.y = -0.36;
      forearm.rotation.x = side === 1 ? -0.6 : -0.08;
      forearm.rotation.z = side === 1 ? -0.34 : 0.17;
      shoulder.add(forearm);
      oval(forearm, clothDark, 0, -0.025, 0, 0.073, 0.08, 0.073);
      add(forearm, new THREE.CylinderGeometry(0.073, 0.056, 0.25, 10), cloth, 0, -0.17, 0);
      oval(forearm, skin, 0, -0.315, -0.008, 0.049, 0.068, 0.045);
      if (side === 1) {
        add(forearm, new THREE.BoxGeometry(0.074, 0.058, 0.24), steel, 0, -0.32, -0.16);
        const grip = add(forearm, new THREE.BoxGeometry(0.06, 0.105, 0.072), leather, 0, -0.37, -0.045);
        grip.rotation.x = -0.23;
      }
      return shoulder;
    }) as [THREE.Group, THREE.Group];

    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.105, -1.025, 0);
      root.add(hip);
      add(hip, new THREE.CylinderGeometry(0.11, 0.078, 0.56, 12), trousers, 0, -0.28, 0);
      add(hip, new THREE.CylinderGeometry(0.082, 0.077, 0.15, 10), leather, 0, -0.59, 0);
      oval(hip, leather, 0, -0.675, -0.045, 0.086, 0.045, 0.137);
      return hip;
    }) as [THREE.Group, THREE.Group];
  }

  public update(dt: number, motion: Readonly<RemoteAvatarMotion>): void {
    const moving = motion.alive ? Math.min(1, motion.speed / 4.4) : 0;
    this.walkBlend = approach(this.walkBlend, moving, dt);
    const direction = motion.forwardSpeed < -0.3 ? -1 : 1;
    this.walkPhase += dt * direction * (4.5 + this.walkBlend * 5.5);
    const stride = Math.sin(this.walkPhase) * 0.47 * this.walkBlend;
    this.legs[0].rotation.x = stride;
    this.legs[1].rotation.x = -stride;
    this.fireKick = Math.max(0, this.fireKick - dt * 9);
    this.reloadBlend = approach(this.reloadBlend, motion.reloading ? 1 : 0, dt);
    const aim = THREE.MathUtils.clamp(motion.pitch, -0.45, 0.45);
    this.arms[0].rotation.x = 0.12 - stride * 0.55 + this.reloadBlend * 0.75;
    this.arms[1].rotation.x = 0.92 + aim * 0.35 + stride * 0.12 + this.fireKick * 0.3 - this.reloadBlend * 0.35;
    this.deathBlend = approach(this.deathBlend, motion.alive ? 0 : 1, dt * 0.5);
    this.body.rotation.x = -this.deathBlend * Math.PI * 0.5;
    this.body.position.y = EYE_HEIGHT - this.deathBlend * (EYE_HEIGHT - 0.25);
  }

  public playFire(): void {
    this.fireKick = 1;
  }

  public dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.group.removeFromParent();
  }
}
