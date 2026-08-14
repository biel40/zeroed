import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { ZombieState } from './Zombie';

/** Loaded GLB payload for one zombie variant (scene template + clips). */
export interface ZombieModelSource {
  readonly scene: THREE.Group;
  readonly clips: THREE.AnimationClip[];
}

export type ZombieVariantId = 'walker';

interface VariantConfig {
  /** World height the model is normalized to, meters. */
  readonly height: number;
  /** Candidate clip names per state; first match wins. */
  readonly clips: Record<ZombieState, readonly string[]>;
  /** Walk clip ground speed at timeScale 1; syncs feet with movement. */
  readonly walkReferenceSpeed: number;
  /** Per-instance body tints picked at spawn (deteriorated skin/cloth). */
  readonly tints: readonly number[];
}

/**
 * Only the small walker category exists: the large hulk variant was removed
 * and must not be reintroduced (see the variant contract test). Per-instance
 * variety comes from tints, scale jitter and walk jitter instead.
 */
export const ZOMBIE_VARIANTS: Record<ZombieVariantId, VariantConfig> = {
  // Quaternius "Animated Zombie" (CC-BY 3.0): classic shambling corpse.
  walker: {
    height: 1.78,
    clips: {
      spawn: ['ZombieCrawl', 'Crawl'],
      walk: ['ZombieWalk', 'Walk'],
      attack: ['ZombieBite', 'Bite', 'Punch'],
      barrierAttack: ['ZombieBite', 'Bite', 'Punch'],
      hit: ['ZombieHit', 'HitReact', 'Hit'],
      death: ['ZombieDeath', 'Death'],
    },
    walkReferenceSpeed: 1.35,
    tints: [0xa8b89a, 0x9aa88e, 0xb0a890, 0x98a498],
  },
};

const CROSSFADE_SECONDS = 0.16;
/** Hit-flash emissive color shared by every zombie material. */
const FLASH_COLOR = 0xff2211;
/** Sickly undead glow kept very low so the bodies read in the dark. */
const UNDEAD_GLOW = 0x1a2a12;
/** How deep below ground the spawn rise starts, meters. */
const SPAWN_DEPTH = 1.25;

/**
 * Resolves an animation clip by candidate name. Matches either the full
 * name or a "|"-separated suffix ("CharacterArmature|Death" → "Death"),
 * case-insensitive. Pure and unit-testable.
 */
export function resolveClip(
  clips: readonly THREE.AnimationClip[],
  candidates: readonly string[],
): THREE.AnimationClip | null {
  const wanted = candidates.map((c) => c.toLowerCase());
  for (const clip of clips) {
    const name = clip.name.toLowerCase();
    const suffix = name.split('|').pop() ?? name;
    if (wanted.includes(name) || wanted.includes(suffix)) return clip;
  }
  return null;
}

interface ProceduralRig {
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
}

/**
 * Articulated humanoid fallback (missing asset or headless tests): clearly
 * human silhouette — head, hunched torso, arms with hands, legs — animated
 * in code. Replaces the old capsule placeholder look entirely.
 */
function buildProceduralHumanoid(
  tint: number,
  castShadow: boolean,
): {
  root: THREE.Group;
  rig: ProceduralRig;
  materials: THREE.MeshStandardMaterial[];
} {
  const skin = new THREE.MeshStandardMaterial({
    color: tint,
    roughness: 0.92,
    metalness: 0,
    transparent: true,
    emissive: FLASH_COLOR,
    emissiveIntensity: 0,
  });
  const cloth = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint).multiplyScalar(0.5).getHex(),
    roughness: 0.98,
    metalness: 0,
    transparent: true,
    emissive: FLASH_COLOR,
    emissiveIntensity: 0,
  });

  const root = new THREE.Group();
  const mesh = (
    geometry: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial,
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
  ): void => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = castShadow;
    parent.add(m);
  };

  const hips = new THREE.Group();
  hips.position.y = 0.98;
  root.add(hips);
  mesh(new THREE.BoxGeometry(0.34, 0.2, 0.22), cloth, hips, 0, 0, 0);

  const torso = new THREE.Group();
  torso.position.y = 0.08;
  torso.rotation.x = 0.28; // permanent hunch
  hips.add(torso);
  mesh(new THREE.BoxGeometry(0.4, 0.52, 0.24), cloth, torso, 0, 0.28, 0);

  const head = new THREE.Group();
  head.position.set(0, 0.6, 0.05);
  head.rotation.x = -0.15;
  torso.add(head);
  mesh(new THREE.BoxGeometry(0.22, 0.26, 0.24), skin, head, 0, 0.12, 0.01);
  // Slack jaw: the cheapest way to read "undead" on a box head.
  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.18), skin);
  jaw.position.set(0, -0.02, 0.06);
  jaw.rotation.x = 0.35;
  head.add(jaw);

  const buildArm = (side: -1 | 1): THREE.Group => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.26, 0.48, 0.02);
    torso.add(shoulder);
    mesh(new THREE.BoxGeometry(0.1, 0.36, 0.1), cloth, shoulder, 0, -0.16, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -0.34;
    shoulder.add(elbow);
    mesh(new THREE.BoxGeometry(0.09, 0.32, 0.09), skin, elbow, 0, -0.14, 0);
    mesh(new THREE.BoxGeometry(0.09, 0.1, 0.12), skin, elbow, 0, -0.33, 0.02);
    return shoulder;
  };
  const armL = buildArm(-1);
  const armR = buildArm(1);

  const buildLeg = (side: -1 | 1): THREE.Group => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.11, -0.06, 0);
    hips.add(hip);
    mesh(new THREE.BoxGeometry(0.13, 0.44, 0.14), cloth, hip, 0, -0.2, 0);
    const knee = new THREE.Group();
    knee.position.y = -0.44;
    hip.add(knee);
    mesh(new THREE.BoxGeometry(0.11, 0.44, 0.12), cloth, knee, 0, -0.2, 0);
    mesh(new THREE.BoxGeometry(0.11, 0.08, 0.24), skin, knee, 0, -0.44, 0.05);
    return hip;
  };
  const legL = buildLeg(-1);
  const legR = buildLeg(1);

  return { root, rig: { hips, torso, head, armL, armR, legL, legR }, materials: [skin, cloth] };
}

/** Skeleton lookups for the hitbox anchors; first match wins. */
const TORSO_BONE_NAMES = ['Hips', 'Pelvis'] as const;
const HEAD_BONE_NAMES = ['Head'] as const;
const HEAD_TOP_BONE_NAMES = ['HeadTop_End', 'HeadTop'] as const;

/**
 * Bind-pose world targets for the hitboxes. The torso envelope (centered at
 * hip height, slightly forward, reaching the ground) is the play-tested
 * shape tuned for the old static rig — it is preserved exactly, only
 * anchored to the skeleton now.
 */
const TORSO_HITBOX_CENTER = new THREE.Vector3(0, 0.75, 0.04);
/** Static fallback when no head bone exists (tests, degenerate rigs). */
const HEAD_HITBOX_FALLBACK = new THREE.Vector3(0, 1.58, 0.06);
/** Skull-center offset above the head anchor when no head-top bone exists. */
const HEAD_HITBOX_UP = 0.12;

const anchorTmpA = new THREE.Vector3();
const anchorTmpB = new THREE.Vector3();
const anchorTmpC = new THREE.Vector3();
const anchorTmpD = new THREE.Vector3();

function findByName(root: THREE.Object3D, names: readonly string[]): THREE.Object3D | null {
  for (const name of names) {
    const found = root.getObjectByName(name);
    if (found) return found;
  }
  return null;
}

/**
 * Places a hitbox on an animated anchor so that, in bind pose, it sits
 * exactly at `worldTarget` with its geometry measured in world meters.
 * Counter-scaling undoes any armature scale (the Quaternius rigs run at
 * x100+), which keeps the geometry shareable across every pooled zombie.
 */
function placeOnAnchor(
  hitbox: THREE.Object3D,
  anchor: THREE.Object3D,
  worldTarget: THREE.Vector3,
): void {
  anchor.add(hitbox);
  hitbox.position.copy(anchor.worldToLocal(anchorTmpD.copy(worldTarget)));
  const scale = anchor.getWorldScale(anchorTmpB).x;
  hitbox.scale.setScalar(1 / Math.max(scale, 1e-6));
}

/**
 * Visual body of one pooled zombie: GLB clone driven by an AnimationMixer
 * when the model is available, procedural humanoid otherwise. Owns crossfade
 * transitions, walk-cycle speed sync, hit flash, spawn rise and the death
 * collapse/fade. Purely visual — gameplay state lives in Zombie.
 */
export class ZombieVisual {
  readonly root = new THREE.Group();
  /**
   * Animated anchor the torso hitbox rides: the Hips bone on a GLB rig, the
   * hips group on the procedural fallback, or `root` as a last resort.
   */
  readonly torsoAnchor: THREE.Object3D;
  /** Animated anchor the head hitbox rides (Head bone / head group / root). */
  readonly headAnchor: THREE.Object3D;

  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<ZombieState, THREE.AnimationAction>();
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly rig: ProceduralRig | null = null;
  private readonly variant: VariantConfig;
  /** End of the head bone chain, when the rig has one (skull midpoint math). */
  private headTop: THREE.Object3D | null = null;
  private state: ZombieState = 'spawn';
  private currentAction: THREE.AnimationAction | null = null;
  private walkJitter = 1;
  private attackDuration = 0.9;
  private flash = 0;
  private bobPhase = Math.random() * Math.PI * 2;
  /** Brief cycle slowdown standing in for a missing hit-react clip. */
  private hitDip = 0;
  /** 0..1 spawn rise and death collapse progress, driven by the owner. */
  private rise = 1;
  private collapse = 0;

  constructor(
    variantId: ZombieVariantId,
    source: ZombieModelSource | null,
    tint: number,
    castShadow = true,
  ) {
    this.variant = ZOMBIE_VARIANTS[variantId];

    if (source) {
      const model = cloneSkeleton(source.scene) as THREE.Group;
      // Box3.setFromObject measures SkinnedMesh bounds through
      // bindMatrixInverse, which SkeletonUtils.clone leaves stale (the inverse
      // of the load-time bind matrix — identity on these GLBs). Refreshing the
      // matrices first re-syncs it to the current world matrix; otherwise the
      // armature scale (x100+ on these assets) is applied twice and the
      // normalization below shrinks zombies to a few centimeters tall.
      model.updateMatrixWorld(true);
      // Normalize to the variant height with feet on the ground.
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = this.variant.height / Math.max(size.y, 1e-4);
      model.scale.setScalar(scale);
      model.position.y = -box.min.y * scale;

      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = castShadow;
        object.receiveShadow = false;
        object.frustumCulled = false; // skinned bounds go stale when pooled
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        const cloned = mats.map((m) => {
          const c = m.clone() as THREE.MeshStandardMaterial;
          c.color.multiply(new THREE.Color(tint));
          c.emissive = new THREE.Color(UNDEAD_GLOW);
          c.emissiveIntensity = 0.35;
          c.transparent = true;
          this.materials.push(c);
          return c;
        });
        object.material = Array.isArray(object.material) ? cloned : cloned[0];
      });
      this.root.add(model);
      this.torsoAnchor = findByName(model, TORSO_BONE_NAMES) ?? this.root;
      this.headAnchor = findByName(model, HEAD_BONE_NAMES) ?? this.root;
      this.headTop = findByName(model, HEAD_TOP_BONE_NAMES);

      this.mixer = new THREE.AnimationMixer(model);
      for (const state of ['spawn', 'walk', 'attack', 'hit', 'death'] as const) {
        const clip = resolveClip(source.clips, this.variant.clips[state]);
        if (!clip) continue;
        const action = this.mixer.clipAction(clip);
        if (state === 'death') {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        }
        this.actions.set(state, action);
      }
    } else {
      const built = buildProceduralHumanoid(tint, castShadow);
      this.rig = built.rig;
      this.materials.push(...built.materials);
      this.root.add(built.root);
      this.torsoAnchor = built.rig.hips;
      this.headAnchor = built.rig.head;
    }
  }

  /**
   * Parents the invisible colliders to the animated rig. They used to be
   * static children of the visual root, but the animation clips displace
   * the visible body far from any fixed offset — measured on the shipped
   * walker GLB: up to ~0.5 m of head sway during the walk cycle and ~0.9 m
   * of forward lunge during the attack — so shots at the visible head or
   * chest regularly crossed where the colliders used to be. Riding the
   * bones makes the hitboxes track the rendered pose exactly, at zero
   * per-frame cost: the mixer already updates those matrices every frame.
   */
  attachHitboxes(torso: THREE.Object3D, head: THREE.Object3D): void {
    // Every animated node is still at its loaded (bind) TRS here.
    this.root.updateMatrixWorld(true);
    placeOnAnchor(torso, this.torsoAnchor, TORSO_HITBOX_CENTER);
    placeOnAnchor(head, this.headAnchor, this.resolveHeadTarget());
  }

  /** Skull center in bind pose: between the head bone and its end bone. */
  private resolveHeadTarget(): THREE.Vector3 {
    if (this.headAnchor === this.root) return anchorTmpA.copy(HEAD_HITBOX_FALLBACK);
    const head = this.headAnchor.getWorldPosition(anchorTmpA);
    if (this.headTop) {
      return head.add(this.headTop.getWorldPosition(anchorTmpC)).multiplyScalar(0.5);
    }
    return head.add(anchorTmpC.set(0, HEAD_HITBOX_UP, 0));
  }

  /** Walk-cycle randomization so the horde never marches in sync. */
  setWalkJitter(jitter: number): void {
    this.walkJitter = jitter;
  }

  /** The attack clip is stretched/squeezed to the gameplay attack duration. */
  setAttackDuration(seconds: number): void {
    this.attackDuration = seconds;
  }

  /**
   * Crossfades into a state; one-shot states restart from the beginning.
   * Two rules keep bullet impacts from breaking the base animation:
   * looping locomotion NEVER resets (walk resumes the cycle phase frozen
   * when the previous state interrupted it, so hit → walk does not snap
   * the pose back to frame 0), and re-entering the state already driving
   * the pose is a no-op (sustained automatic fire re-enters 'hit' every
   * bullet — restarting the clip each time would strobe its first frames).
   */
  setState(state: ZombieState): void {
    const previous = this.state;
    this.state = state;
    if (state !== 'death') this.collapse = 0;
    const next = this.actions.get(state) ?? null;
    if (!next) {
      // Variants without a hit clip flinch by dipping the current cycle;
      // without a death clip the body collapses (owner drives setDeathProgress).
      // The dip only triggers on a FRESH hit: re-pinning it on every bullet
      // of a burst would hold the walk cycle in slow motion while the zombie
      // keeps moving at full speed (visible foot sliding).
      if (state === 'hit' && previous !== 'hit') this.hitDip = 1;
      if (state === 'death' && this.currentAction) this.currentAction.fadeOut(0.35);
      return;
    }
    if (next === this.currentAction) {
      // Already driving the pose (walk after a clipless hit, or a repeated
      // one-shot under sustained fire): let the clip run, never reset.
      if (state === 'walk') next.timeScale = this.walkJitter;
      return;
    }
    if (state === 'walk') {
      next.enabled = true;
      next.timeScale = this.walkJitter;
      if (this.currentAction) next.crossFadeFrom(this.currentAction, CROSSFADE_SECONDS, false);
      next.play();
      this.currentAction = next;
      return;
    }
    next.reset();
    if (state === 'attack') {
      const clip = next.getClip();
      const raw = clip.duration / Math.max(this.attackDuration, 1e-3);
      if (raw > 2.5) {
        // Long mocap take: skip the idle wind-up, cap the playback rate.
        next.time = clip.duration * 0.3;
        next.timeScale = 2.5;
      } else {
        next.timeScale = raw;
      }
    }
    if (state === 'spawn') next.timeScale = 1.15;
    if (state === 'hit') next.timeScale = 1.4;
    next.enabled = true;
    // next !== currentAction here (the same-action case returned above).
    if (this.currentAction) next.crossFadeFrom(this.currentAction, CROSSFADE_SECONDS, false);
    next.play();
    this.currentAction = next;
  }

  /** Red emissive pulse on bullet impact. */
  hitFlash(): void {
    this.flash = 1;
  }

  /** 0 (fully buried) → 1 (standing on the ground) while spawning. */
  setSpawnRise(t: number): void {
    this.rise = t;
  }

  /** 0 → 1 during the death fall; only collapses when no death clip exists. */
  setDeathProgress(t: number): void {
    if (this.actions.has('death')) return; // the clip handles the fall
    this.collapse = t;
  }

  /** Death fade driven by the owning Zombie during its last moments. */
  setOpacity(opacity: number): void {
    for (const material of this.materials) {
      material.opacity = opacity;
      if (this.flash <= 0) material.emissiveIntensity = 0.35 * opacity;
    }
  }

  update(dt: number, speed: number): void {
    // Spawn rise and death collapse apply to the visual root in both paths.
    this.root.position.y = -(1 - this.rise) * SPAWN_DEPTH;
    if (this.collapse > 0) {
      const ease = 1 - (1 - this.collapse) * (1 - this.collapse);
      this.root.rotation.x = -ease * (Math.PI / 2 - 0.12);
      this.root.rotation.z = ease * 0.18;
    } else {
      this.root.rotation.x = 0;
      this.root.rotation.z = 0;
    }

    if (this.mixer) {
      const walk = this.actions.get('walk');
      if (walk && this.currentAction === walk) {
        // Keep the feet tracking the actual ground speed (round scaling).
        const variant = this.variant;
        walk.timeScale =
          this.walkJitter * Math.max(0.4, speed / variant.walkReferenceSpeed);
        if (this.hitDip > 0) walk.timeScale *= 1 - this.hitDip * 0.75;
      }
      if (this.hitDip > 0) this.hitDip = Math.max(0, this.hitDip - dt * 3.5);
      this.mixer.update(dt);
    } else if (this.rig) {
      this.updateProcedural(dt, speed);
    }

    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 5);
      for (const material of this.materials) {
        if (this.flash > 0) {
          material.emissive.setHex(FLASH_COLOR);
          material.emissiveIntensity = this.flash * 1.5;
        } else {
          material.emissive.setHex(UNDEAD_GLOW);
          material.emissiveIntensity = 0.35 * (this.materials[0]?.opacity ?? 1);
        }
      }
    }
  }

  /** Code-driven humanoid animation for the fallback rig. */
  private updateProcedural(dt: number, speed: number): void {
    const rig = this.rig;
    if (!rig) return;
    if (this.state === 'death') return; // collapse handles the pose
    this.bobPhase += dt * 4.8 * Math.max(0.4, speed / this.variant.walkReferenceSpeed);
    const p = this.bobPhase;

    if (this.state === 'attack') {
      // Both arms swing forward and down over the player.
      rig.armL.rotation.x = -1.9;
      rig.armR.rotation.x = -1.9;
      rig.torso.rotation.x = 0.55;
      return;
    }
    if (this.state === 'hit') {
      rig.torso.rotation.x = -0.2; // knocked backwards
      rig.head.rotation.x = -0.5;
      return;
    }
    rig.head.rotation.x = -0.15;
    rig.legL.rotation.x = Math.sin(p) * 0.55;
    rig.legR.rotation.x = Math.sin(p + Math.PI) * 0.55;
    // Zombie reach: both arms raised forward, flopping out of sync.
    rig.armL.rotation.x = -1.15 + Math.sin(p + Math.PI) * 0.16;
    rig.armR.rotation.x = -1.05 + Math.sin(p) * 0.2;
    rig.armL.rotation.z = 0.12 + Math.sin(p * 0.5) * 0.06;
    rig.armR.rotation.z = -0.14 - Math.cos(p * 0.45) * 0.06;
    rig.torso.rotation.x = 0.28 + Math.sin(p * 2) * 0.04;
    rig.torso.rotation.z = Math.sin(p) * 0.06;
    rig.head.rotation.z = Math.sin(p * 0.7) * 0.1;
  }
}
