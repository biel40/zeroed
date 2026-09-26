import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { EYE_HEIGHT } from '../player/PlayerController';
import type { PlayerLifeState } from '../network/Protocol';

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
  life: PlayerLifeState;
  reviving: boolean;
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
    } catch {
      // Use the procedural avatar when the optional model is unusable.
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
const DOWN_AXIS = new THREE.Vector3(0, -1, 0);

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
  private readonly modelBaseY: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly idle: THREE.AnimationAction;
  private readonly walk: THREE.AnimationAction;
  private readonly run: THREE.AnimationAction | null;
  private readonly aim: THREE.AnimationAction | null;
  private readonly fire: THREE.AnimationAction | null;
  private readonly reload: THREE.AnimationAction | null;
  private readonly death: THREE.AnimationAction | null;
  private readonly pitchBone: THREE.Bone | null;
  private readonly reachBone: THREE.Bone | null;
  private readonly reachBoneRest = new THREE.Quaternion();
  private readonly reachBoneAnimated: boolean;
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
    this.modelBaseY = this.model.position.y;
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
    this.reachBone = bones.find((bone) => /right.*(upperarm|arm)|arm.*right/i.test(bone.name)) ?? null;
    if (this.reachBone) this.reachBoneRest.copy(this.reachBone.quaternion);
    this.reachBoneAnimated = !!this.reachBone && source.clips.some((clip) => clip.tracks.some((track) => {
      const parsed = THREE.PropertyBinding.parseTrackName(track.name);
      return parsed.nodeName === this.reachBone?.name && parsed.propertyName === 'quaternion';
    }));
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
    const downed = motion.life === 'downed';
    this.model.position.y = approach(this.model.position.y, this.modelBaseY + (downed ? -0.65 : 0), dt);
    this.model.rotation.x = approach(this.model.rotation.x, downed ? -0.95 : 0, dt);
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
    if (this.reachBone && !this.dead && (downed || motion.reviving)) {
      if (!this.reachBoneAnimated) this.reachBone.quaternion.copy(this.reachBoneRest);
      this.reachBone.rotateX(downed ? -0.8 : -0.55);
      this.reachBone.rotateZ(-0.2);
    } else if (this.reachBone && !this.reachBoneAnimated) {
      this.reachBone.quaternion.copy(this.reachBoneRest);
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
    const moving = motion.life === 'alive' && !motion.reviving && motion.speed > IDLE_THRESHOLD;
    const running = !!this.run && motion.speed > RUN_THRESHOLD;
    this.idleWeight = approach(this.idleWeight, moving ? 0 : 1, dt);
    this.walkWeight = approach(this.walkWeight, moving && !running ? 1 : 0, dt);
    this.runWeight = approach(this.runWeight, running ? 1 : 0, dt);
    this.aimWeight = approach(this.aimWeight, moving && motion.aiming && !motion.reloading ? 1 : 0, dt);
    this.reloadWeight = approach(this.reloadWeight, moving && motion.reloading ? 1 : 0, dt);
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
  private readonly forearms: [THREE.Group, THREE.Group];
  private readonly pistol = new THREE.Group();
  private readonly armDirection = new THREE.Vector3();
  private readonly elbowPosition = new THREE.Vector3();
  private readonly wristPosition = new THREE.Vector3();
  private readonly inverseShoulder = new THREE.Quaternion();
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
    const skin = material(0xa58770, 1);
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
      const part = add(parent, new THREE.SphereGeometry(1, 16, 12), surface, x, y, z);
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
      oval(root, leather, side * 0.048, -0.263, -0.114, 0.004, 0.004, 0.003);
      const brow = add(root, new THREE.BoxGeometry(0.065, 0.012, 0.018), skin,
        side * 0.048, -0.247, -0.107);
      brow.rotation.z = side * 0.09;
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
    add(root, new THREE.BoxGeometry(0.19, 0.018, 0.018), leather, 0, -0.344, -0.057);

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
    oval(root, clothDark, 0, -0.735, 0.18, 0.165, 0.21, 0.085);
    add(root, new THREE.CylinderGeometry(0.095, 0.095, 0.3, 12), webbing, 0, -0.53, 0.185).rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) {
      const packStrap = add(root, new THREE.BoxGeometry(0.027, 0.31, 0.018), webbing,
        side * 0.122, -0.7, 0.237);
      packStrap.rotation.z = side * 0.15;
    }

    const forearms: THREE.Group[] = [];
    this.arms = [-1, 1].map((side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.25, -0.55, 0);
      root.add(shoulder);
      oval(shoulder, cloth, 0, -0.045, 0, 0.08, 0.1, 0.085);
      add(shoulder, new THREE.CylinderGeometry(0.078, 0.063, 0.29, 14), cloth, 0, -0.2, 0);
      add(shoulder, new THREE.CylinderGeometry(0.082, 0.081, 0.05, 14), webbing, 0, -0.125, 0);
      const forearm = new THREE.Group();
      forearm.position.y = -0.35;
      shoulder.add(forearm);
      oval(forearm, clothDark, 0, -0.018, 0, 0.064, 0.065, 0.065);
      add(forearm, new THREE.CylinderGeometry(0.067, 0.047, 0.25, 14), cloth, 0, -0.17, 0);
      add(forearm, new THREE.CylinderGeometry(0.058, 0.055, 0.055, 14), webbing, 0, -0.27, 0);
      oval(forearm, skin, 0, -0.32, 0, 0.042, 0.055, 0.043).name = side === 1 ? 'right-hand' : 'left-hand';
      forearms.push(forearm);
      return shoulder;
    }) as [THREE.Group, THREE.Group];
    this.forearms = forearms as [THREE.Group, THREE.Group];

    // The grip sits in the right hand. The slide points forward, along the avatar's -Z axis.
    this.pistol.name = 'remote-pistol';
    root.add(this.pistol);
    const slide = add(this.pistol, new THREE.BoxGeometry(0.068, 0.052, 0.215), steel, 0, 0.045, -0.105);
    slide.name = 'pistol-slide';
    add(this.pistol, new THREE.BoxGeometry(0.06, 0.029, 0.15), leather, 0, 0.002, -0.083);
    const grip = add(this.pistol, new THREE.BoxGeometry(0.055, 0.12, 0.064), leather, 0, -0.063, 0.015);
    grip.rotation.x = -0.16;
    add(this.pistol, new THREE.BoxGeometry(0.062, 0.013, 0.04), steel, 0, -0.129, 0.024);
    add(this.pistol, new THREE.BoxGeometry(0.014, 0.032, 0.01), steel, 0, 0.015, -0.193);
    add(this.pistol, new THREE.BoxGeometry(0.017, 0.022, 0.01), steel, 0, 0.076, 0.001);
    const triggerGuard = add(this.pistol, new THREE.TorusGeometry(0.029, 0.005, 6, 12), steel, 0, -0.036, -0.044);
    triggerGuard.rotation.y = Math.PI / 2;

    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.105, -1.025, 0);
      root.add(hip);
      add(hip, new THREE.CylinderGeometry(0.11, 0.078, 0.56, 12), trousers, 0, -0.28, 0);
      add(hip, new THREE.BoxGeometry(0.09, 0.15, 0.025), clothDark, side * 0.065, -0.23, -0.053);
      oval(hip, clothDark, 0, -0.495, -0.074, 0.082, 0.09, 0.035);
      add(hip, new THREE.CylinderGeometry(0.082, 0.077, 0.15, 10), leather, 0, -0.59, 0);
      oval(hip, leather, 0, -0.675, -0.045, 0.086, 0.045, 0.137);
      add(hip, new THREE.BoxGeometry(0.11, 0.014, 0.18), clothDark, 0, -0.714, -0.055);
      return hip;
    }) as [THREE.Group, THREE.Group];
  }

  public update(dt: number, motion: Readonly<RemoteAvatarMotion>): void {
    const moving = motion.life === 'alive' && !motion.reviving ? Math.min(1, motion.speed / 4.4) : 0;
    this.walkBlend = approach(this.walkBlend, moving, dt);
    const direction = motion.forwardSpeed < -0.3 ? -1 : 1;
    this.walkPhase += dt * direction * (4.5 + this.walkBlend * 5.5);
    const stride = Math.sin(this.walkPhase) * 0.47 * this.walkBlend;
    this.legs[0].rotation.x = stride;
    this.legs[1].rotation.x = -stride;
    this.fireKick = Math.max(0, this.fireKick - dt * 9);
    this.reloadBlend = approach(this.reloadBlend, motion.reloading ? 1 : 0, dt);
    const aim = THREE.MathUtils.clamp(motion.pitch, -0.45, 0.45);
    const lowered = motion.life !== 'alive' || motion.reviving;
    const handY = lowered ? -1.06 : -0.83 + aim * 0.19 - this.reloadBlend * 0.1;
    const handZ = lowered ? -0.18 : -0.46 + this.reloadBlend * 0.22 + this.fireKick * 0.065;
    this.poseArm(0,
      -0.26, -0.76, lowered ? -0.06 : -0.2,
      lowered ? -0.31 : -0.035, lowered ? -1.04 : handY - 0.015,
      lowered ? -0.12 : handZ - 0.035);
    this.poseArm(1,
      0.33, -0.73, lowered ? -0.06 : -0.21,
      lowered ? 0.3 : 0.085, handY, handZ);
    this.pistol.position.set(lowered ? 0.3 : 0.085, handY, handZ);
    this.pistol.rotation.x = lowered ? -0.5 : aim;
    this.deathBlend = approach(this.deathBlend, motion.life === 'alive' ? 0 : motion.life === 'downed' ? 0.72 : 1, dt * 0.5);
    this.body.rotation.x = -this.deathBlend * Math.PI * 0.5;
    this.body.position.y = EYE_HEIGHT - this.deathBlend * (EYE_HEIGHT - 0.25);
  }

  private poseArm(index: 0 | 1, elbowX: number, elbowY: number, elbowZ: number,
    wristX: number, wristY: number, wristZ: number): void {
    const shoulder = this.arms[index];
    const forearm = this.forearms[index];
    this.elbowPosition.set(elbowX, elbowY, elbowZ);
    this.armDirection.copy(this.elbowPosition).sub(shoulder.position).normalize();
    shoulder.quaternion.setFromUnitVectors(DOWN_AXIS, this.armDirection);
    this.elbowPosition.copy(DOWN_AXIS).multiplyScalar(0.35).applyQuaternion(shoulder.quaternion).add(shoulder.position);
    this.wristPosition.set(wristX, wristY, wristZ);
    this.armDirection.copy(this.wristPosition).sub(this.elbowPosition).normalize();
    this.inverseShoulder.copy(shoulder.quaternion).invert();
    this.armDirection.applyQuaternion(this.inverseShoulder);
    forearm.quaternion.setFromUnitVectors(DOWN_AXIS, this.armDirection);
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
