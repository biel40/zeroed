import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { registerFadeMaterial, setFadeOpacity } from '../rendering/FadeMaterials';
import {
  installRayGunDissolve,
  RayGunAshParticles,
  RAYGUN_NEON_GREEN,
  setRayGunDissolveState,
} from '../rendering/RayGunDissolveShader';
import type { ZombieState } from './Zombie';
import { windowVaultPose, type WindowVaultPose } from './barriers/WindowVault';
import { ShinyStars } from './ShinyStars';
import { ZombieElectricArcs } from './ZombieElectricArcs';
import { ZombieLimb } from './ZombieLimb';
import { buildZombieRestClips, type ZombieRestClips } from './ZombieMotionClips';
import { ZOMBIE_DEATH_PROFILES, type ZombieDeathStyle } from './ZombieDeath';
import { sampleMeleeMotion, sampleWindowMotion, boardPullProgress,
  BOARD_PULL_DISTANCE, BOARD_PULL_DROP, BOARD_PULL_DURATION } from './ZombieAttackMotion';
import {
  ZOMBIE_ATTACK_LUNGE,
  ZOMBIE_ATTACK_HIT_MOMENT,
  ZOMBIE_DEATH_FALL,
  ZOMBIE_TYPE_CONFIGS,
  type ZombieModelId,
  type ZombieTypeId,
} from './ZombieConfig';

/** Loaded GLB payload for one model source (scene template + clips). */
export interface ZombieModelSource {
  readonly scene: THREE.Group;
  readonly clips: THREE.AnimationClip[];
}


export interface ZombieModelConfig {
  readonly url: string;
  /** World height the model is normalized to, meters. */
  readonly height: number;
  /** Candidate clip names per state; first match wins. Deaths are always generated per style. */
  readonly clips: Record<Exclude<ZombieState, 'death'>, readonly string[]>;
  /** Walk clip ground speed at timeScale 1; syncs feet with movement. */
  readonly walkReferenceSpeed: number;
  /** Standing-still clip candidates; drives real joint motion while stalled at a barrier (optional: not every asset has one). */
  readonly idleClip?: readonly string[];
  /** Per-instance body tints picked at spawn (deteriorated skin/cloth). */
  readonly tints: readonly number[];
  /** Glow and core colors of the shared eye overlay. */
  readonly eyes: { readonly glow: number; readonly core: number };
  readonly anchors: {
    readonly torso: readonly string[];
    readonly head: readonly string[];
    readonly headTop: readonly string[];
  };
}

/** Asset/animation contracts are independent from gameplay type profiles. */
export const ZOMBIE_MODELS: Record<ZombieModelId, ZombieModelConfig> = {
  // Quaternius "Animated Zombie" (CC-BY 3.0), restored visual reference.
  walker: {
    url: 'assets/zombies/zombie_walker.glb',
    height: 1.78,
    clips: {
      spawn: ['ZombieCrawl', 'Crawl'],
      walk: ['ZombieWalk', 'Walk'],
      attack: ['ZombieBite', 'Bite', 'Punch'],
      barrierAttack: ['ZombieBarrierAttack'],
      barrierBreak: ['ZombieBarrierBreak'],
      hit: ['ZombieHit', 'HitReact', 'Hit'],
    },
    walkReferenceSpeed: 1.35,
    idleClip: ['ZombieIdle', 'Idle'],
    tints: [0xb0aca8],
    eyes: { glow: 0xffb31a, core: 0xffe27a },
    anchors: {
      torso: ['Hips', 'Pelvis'],
      head: ['Head'],
      headTop: ['HeadTop_End', 'HeadTop'],
    },
  },
  // Brutus is generated from the walker (scripts/generate-brute-asset.mjs):
  // same palette, face and rig, rebuilt as a hulking, shackled brute.
  brute: {
    url: 'assets/zombies/zombie_brute.glb',
    height: 2.3,
    clips: {
      spawn: ['BruteRise'],
      walk: ['BruteWalk'],
      attack: [],
      barrierAttack: [],
      barrierBreak: [],
      hit: [],
    },
    walkReferenceSpeed: 1.71,
    tints: [0xb0aca8],
    // Red instead of amber: the one-hit killer reads at a glance in the dark.
    eyes: { glow: 0xff2a14, core: 0xff9a7a },
    anchors: {
      torso: ['Hips'],
      head: ['Head'],
      headTop: ['HeadTop_End'],
    },
  },
};

const CROSSFADE_SECONDS = 0.2;
/**
 * The living pose (raised arms, mid-stride legs) melts into the fall over this
 * window instead of snapping to the clip's hanging start pose in CROSSFADE_SECONDS.
 */
const DEATH_CROSSFADE_SECONDS = 0.42;
/** Decay time of the walking momentum the falling body keeps, seconds. */
const DEATH_MOMENTUM_SECONDS = 0.1;
/** Generated clips are pure functions of the rig: bake once per loaded scene, share across the pool. */
const restClipCache = new WeakMap<THREE.Object3D, ZombieRestClips | null>();
/** Largest body-yaw the fall turns towards the impact side, radians. */
const DEATH_MAX_TWIST = 0.8;
/** Below this ground speed the zombie is treated as stationary (stalled at a barrier). */
const STATIONARY_SPEED = 0.05;
/** Hit-flash emissive color shared by every zombie material. */
const FLASH_COLOR = 0xff2211;
/** ZEUS-77 residual charge: cold blue skin flicker that fades over its last second. */
const ELECTRIC_COLOR = 0x5fc8ff;
const ELECTRIC_FADE = 0.8;
/** Joints the residual arcs jump between, spread head to toe. */
const ARC_ANCHORS = ['Hips', 'Spine2', 'Head', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'];
/** Faint ashen glow kept very low so the pale bodies read in the dark. */
const UNDEAD_GLOW = 0x221d1a;
const UNDEAD_GLOW_INTENSITY = 0.12;
const EYE_SOCKET_COLOR = 0x080604;
/** How deep below ground the spawn rise starts, meters. */
const SPAWN_DEPTH = 1.25;

const eyeSocketGeometry = new THREE.CircleGeometry(0.018, 12);
const eyeGlowGeometry = new THREE.CircleGeometry(0.011, 12);
const eyeCoreGeometry = new THREE.CircleGeometry(0.006, 10);

/**
 * Flat dark sockets with a warm inner glow. Keeping both layers planar makes
 * the light read from inside the face rather than as spheres glued on top.
 */
function buildEyes(colors: ZombieModelConfig['eyes']): { group: THREE.Group; materials: THREE.Material[] } {
  const group = new THREE.Group();
  group.name = 'zombie-eyes';
  const socketMaterial = new THREE.MeshStandardMaterial({
    color: EYE_SOCKET_COLOR,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  // Additive layers are order independent: one pass instead of back+front.
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: colors.glow,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  const coreMaterial = new THREE.MeshBasicMaterial({
    color: colors.core,
    transparent: true,
    opacity: 0.94,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  for (const x of [-0.045, 0.045]) {
    const socket = new THREE.Mesh(eyeSocketGeometry, socketMaterial);
    socket.name = 'zombie-eye-socket';
    socket.position.set(x, 0.014, 0.09);
    socket.scale.set(1.18, 0.68, 1);

    const glow = new THREE.Mesh(eyeGlowGeometry, glowMaterial);
    glow.name = 'zombie-eye-glow';
    glow.position.set(x, 0.014, 0.092);
    glow.scale.set(1.08, 0.58, 1);

    const core = new THREE.Mesh(eyeCoreGeometry, coreMaterial);
    core.name = 'zombie-eye-core';
    core.position.set(x, 0.014, 0.093);
    core.scale.set(1.05, 0.54, 1);
    group.add(socket, glow, core);
  }
  return { group, materials: [socketMaterial, glowMaterial, coreMaterial] };
}

interface MaterialBase {
  readonly color: THREE.Color;
  readonly roughness: number;
  readonly metalness: number;
  readonly envMapIntensity: number;
}

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

interface BarrierRig {
  readonly torso: THREE.Object3D | null;
  readonly head: THREE.Object3D | null;
  readonly shoulderL: THREE.Object3D | null;
  readonly shoulderR: THREE.Object3D | null;
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
    emissive: FLASH_COLOR,
    emissiveIntensity: 0,
  });
  const cloth = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint).multiplyScalar(0.5).getHex(),
    roughness: 0.98,
    metalness: 0,
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

/** Tall humanoid emergency fallback for Brutus when its authored asset is unavailable. */
function buildProceduralBrute(
  tint: number,
  castShadow: boolean,
): {
  root: THREE.Group;
  rig: ProceduralRig;
  materials: THREE.MeshStandardMaterial[];
} {
  const skin = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x7a726a).multiply(new THREE.Color(tint)),
    roughness: 0.96,
    metalness: 0,
    emissive: FLASH_COLOR,
    emissiveIntensity: 0,
    flatShading: true,
  });
  const cloth = new THREE.MeshStandardMaterial({
    color: 0x26221f,
    roughness: 1,
    metalness: 0,
    emissive: FLASH_COLOR,
    emissiveIntensity: 0,
    flatShading: true,
  });
  const root = new THREE.Group();
  root.scale.setScalar(0.92);
  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.MeshStandardMaterial,
    parent: THREE.Object3D,
    position: readonly [number, number, number],
    scale: readonly [number, number, number] = [1, 1, 1],
    rotation: readonly [number, number, number] = [0, 0, 0],
  ): void => {
    const part = new THREE.Mesh(geometry, material);
    part.position.set(...position);
    part.scale.set(...scale);
    part.rotation.set(...rotation);
    part.castShadow = castShadow;
    parent.add(part);
  };

  const hips = new THREE.Group();
  hips.position.y = 1.2;
  root.add(hips);
  add(new THREE.BoxGeometry(0.48, 0.24, 0.28), cloth, hips, [0, 0, 0]);
  const torso = new THREE.Group();
  torso.position.set(0, 0.12, 0.03);
  torso.rotation.x = 0.24;
  hips.add(torso);
  add(new THREE.DodecahedronGeometry(0.48, 0), cloth, torso, [0, 0.5, 0], [1.18, 1.15, 0.62]);
  add(new THREE.BoxGeometry(0.24, 0.4, 0.04), skin, torso, [0.08, 0.48, 0.3], [0.7, 1, 1]);

  const head = new THREE.Group();
  head.position.set(0.04, 1.08, 0.08);
  head.rotation.z = -0.1;
  torso.add(head);
  add(new THREE.IcosahedronGeometry(0.22, 1), skin, head, [0, 0, 0], [0.86, 1.12, 0.92]);
  add(new THREE.BoxGeometry(0.18, 0.08, 0.18), skin, head, [0.02, -0.2, 0.06], [1, 1, 1], [0.3, 0, 0.08]);

  const buildArm = (side: -1 | 1, size: number): THREE.Group => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.51, 0.82, 0);
    shoulder.rotation.z = side * (side < 0 ? 0.08 : 0.14);
    torso.add(shoulder);
    add(new THREE.CapsuleGeometry(size * 0.13, size * 0.62, 4, 8), cloth, shoulder, [0, -size * 0.42, 0.03]);
    add(new THREE.CapsuleGeometry(size * 0.11, size * 0.58, 4, 8), skin, shoulder, [0, -size * 1.02, 0.1]);
    add(new THREE.BoxGeometry(size * 0.2, size * 0.16, size * 0.24), skin, shoulder, [0, -size * 1.4, 0.16]);
    return shoulder;
  };
  const armL = buildArm(-1, 1.02);
  const armR = buildArm(1, 0.96);

  const buildLeg = (side: -1 | 1): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(side * 0.17, -0.08, 0);
    hips.add(leg);
    add(new THREE.CapsuleGeometry(0.15, 0.62, 4, 8), cloth, leg, [0, -0.39, 0]);
    add(new THREE.CapsuleGeometry(0.12, 0.54, 4, 8), skin, leg, [0, -0.94, 0.02]);
    add(new THREE.BoxGeometry(0.28, 0.16, 0.44), cloth, leg, [0, -1.29, 0.12]);
    return leg;
  };
  const legL = buildLeg(-1);
  const legR = buildLeg(1);
  return { root, rig: { hips, torso, head, armL, armR, legL, legR }, materials: [skin, cloth] };
}

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

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
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
  const scale = anchor.getWorldScale(anchorTmpB);
  hitbox.scale.set(
    1 / Math.max(scale.x, 1e-6),
    1 / Math.max(scale.y, 1e-6),
    1 / Math.max(scale.z, 1e-6),
  );
}

/**
 * Visual body of one pooled zombie: GLB clone driven by an AnimationMixer
 * when the model is available, procedural humanoid otherwise. Owns crossfade
 * transitions, walk-cycle speed sync, hit flash, spawn rise and the death
 * collapse/fade. Purely visual — gameplay state lives in Zombie.
 */
export class ZombieVisual {
  readonly root = new THREE.Group();
  readonly modelId: ZombieModelId;
  /**
   * Animated anchor the torso hitbox rides: the Hips bone on a GLB rig, the
   * hips group on the procedural fallback, or `root` as a last resort.
   */
  readonly torsoAnchor: THREE.Object3D;
  /** Animated anchor the head hitbox rides (Head bone / head group / root). */
  readonly headAnchor: THREE.Object3D;

  private readonly mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<ZombieState, THREE.AnimationAction>();
  /** One generated fall per death style; empty on the procedural fallback. */
  private readonly deathActions = new Map<ZombieDeathStyle, THREE.AnimationAction>();
  private readonly materials: THREE.MeshStandardMaterial[] = [];
  private readonly materialBases: MaterialBase[] = [];
  private readonly rig: ProceduralRig | null = null;
  private barrierRig: BarrierRig | null = null;

  private readonly barrierEuler = new THREE.Euler();
  private readonly barrierQuaternion = new THREE.Quaternion();
  private readonly boneWorldRotation = new THREE.Quaternion();
  private readonly rootWorldRotation = new THREE.Quaternion();
  private readonly boneBasis = new THREE.Quaternion();
  private readonly shinyStars: ShinyStars | null;
  private readonly rayGunAsh: RayGunAshParticles;
  private readonly eyeMaterials: readonly THREE.Material[];
  /** Opaque while alive; blended only during the death fade. */
  private readonly fadeMaterials: readonly THREE.Material[];
  private readonly tmpShinyAnchor = new THREE.Vector3();
  private readonly dissolveOrigin = new THREE.Vector3();
  private dissolveProgress = 0;
  private readonly modelConfig: ZombieModelConfig;
  /** End of the head bone chain, when the rig has one (skull midpoint math). */
  private headTop: THREE.Object3D | null = null;
  private state: ZombieState = 'spawn';
  private currentAction: THREE.AnimationAction | null = null;
  /** Authored standing-still clip (e.g. "ZombieIdle"); null when the asset has none. */
  private readonly idleAction: THREE.AnimationAction | null = null;
  private locomotionAction: THREE.AnimationAction | null = null;
  /** True while the idle clip (not the frozen walk clip) is driving the pose. */
  private idleActive = false;
  private attackDuration = 0.9;
  private flash = 0;
  /** Seconds of ZEUS-77 charge left on the body; arcs persist through death. */
  private electrified = 0;
  private readonly electricArcs: ZombieElectricArcs;
  /** True while flash or charge own the emissive; the glow is restored once both end. */
  private emissiveOverridden = false;
  private opacity = 1;
  private bobPhase = Math.random() * Math.PI * 2;
  /** Advances every frame regardless of speed; drives the stationary idle sway. */
  private idlePhase = Math.random() * Math.PI * 2;
  /** 0..1 spawn rise and death collapse progress, driven by the owner. */
  private rise = 1;
  private collapse = 0;
  private zombieType: ZombieTypeId = 'normal';
  private glowColor = UNDEAD_GLOW;
  private glowIntensity = 0.35;
  private walkAnimationMultiplier = 1;
  private heavyBobPhase = 0;
  private barrierMotionTime = 0;
  private barrierBreakDuration = 0.34;
  private barrierBreakStart = 0.63;
  private barrierStrikeSide = 1;
  private motionSpeed = 0;
  private lean = 0;
  private turnLean = 0;
  private reactionX = 0;
  private reactionZ = 0;
  private reactionAge = 1;
  private deathLean = 0;
  private deathSide = 0;
  private deathTime = 0;
  private deathStyle: ZombieDeathStyle = 'knockback';
  /** Body yaw the fall turns towards so it travels away from the impact. */
  private deathTwist = 0;
  private readonly poseBones: THREE.Object3D[] = [];
  private readonly poseFrom: THREE.Quaternion[] = [];
  private readonly positionFrom: THREE.Vector3[] = [];
  // The mixer may skip unchanged tracks. Restore its exact output before
  // sampling again, so visual polish can never feed back into the next frame.
  private readonly baseRotations: THREE.Quaternion[] = [];
  private readonly basePositions: THREE.Vector3[] = [];
  private readonly baseScales: THREE.Vector3[] = [];
  private transitionTime = CROSSFADE_SECONDS;
  private transitionDuration = CROSSFADE_SECONDS;
  private readonly feet: THREE.Object3D[] = [];
  private readonly footRestY: number[] = [];
  private readonly footPosition = new THREE.Vector3();
  private hipsRestY = 0;
  private groundOffset = 0;
  private attackReach = 0;
  private walkPhase = 0;
  private deathStartPitch = 0;
  private deathStartRoll = 0;
  private deathStartForward = 0;
  private deathTravel = 0;
  private readonly arms: ZombieLimb[] = [];
  private readonly limbBones = new Set<THREE.Object3D>();
  private attackVariant = 0;
  private barrierVariant = 0;
  private nextAttackVariant = 0;
  private nextBarrierVariant = 0;
  private readonly strikeTarget = new THREE.Vector3(0, 1.3, 1);
  /** Climb pose the owner asks for, and the eased pose actually shown (it settles when a climb ends or is cut short). */
  private readonly vaultGoal: WindowVaultPose = { lift: 0, rootPitch: 0, torsoPitch: 0, roll: 0, reach: 0 };
  private readonly vaultPose: WindowVaultPose = { lift: 0, rootPitch: 0, torsoPitch: 0, roll: 0, reach: 0 };
  /** Sill height and distance ahead to it, in root units, for the planted hands. */
  private vaultSill = 0;
  private vaultDepth = 0;
  private readonly limbPoint = new THREE.Vector3();
  private readonly limbRotation = new THREE.Quaternion();

  constructor(
    modelId: ZombieModelId,
    source: ZombieModelSource | null,
    tint: number,
    castShadow = true,
  ) {
    this.modelId = modelId;
    this.modelConfig = ZOMBIE_MODELS[modelId];

    if (source) {
      const model = cloneSkeleton(source.scene) as THREE.Group;
      // Box3.setFromObject measures SkinnedMesh bounds through
      // bindMatrixInverse, which SkeletonUtils.clone leaves stale (the inverse
      // of the load-time bind matrix — identity on these GLBs). Refreshing the
      // matrices first re-syncs it to the current world matrix; otherwise the
      // armature scale (x100+ on these assets) is applied twice and the
      // normalization below shrinks zombies to a few centimeters tall.
      model.updateMatrixWorld(true);
      // Normalize to the model contract height with feet on the ground.
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const scale = this.modelConfig.height / Math.max(size.y, 1e-4);
      model.scale.setScalar(scale);
      model.position.y = -box.min.y * scale;
      // Preserve authored segment lengths and ground contact. Variation comes
      // from materials/phase, not cascading non-uniform bone scales.

      model.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = castShadow;
        object.receiveShadow = false;
        object.frustumCulled = false; // skinned bounds go stale when pooled
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        const cloned = mats.map((m) => {
          const c = m.clone() as THREE.MeshStandardMaterial;
          c.color.multiply(new THREE.Color(tint));
          // Corpse skin and fabric are dielectric. The source's 0.4
          // metalness made the whole textured body read like tinted plastic.
          c.metalness = Math.min(c.metalness, 0.04);
          c.roughness = Math.min(0.94, Math.max(0.72, c.roughness));
          c.envMapIntensity = 0.72;
          c.emissive = new THREE.Color(UNDEAD_GLOW);
          c.emissiveIntensity = UNDEAD_GLOW_INTENSITY;
          this.materials.push(c);
          return c;
        });
        object.material = Array.isArray(object.material) ? cloned : cloned[0];
      });
      this.root.add(model);
      this.torsoAnchor = findByName(model, this.modelConfig.anchors.torso) ?? this.root;
      this.headAnchor = findByName(model, this.modelConfig.anchors.head) ?? this.root;
      this.headTop = findByName(model, this.modelConfig.anchors.headTop);
      this.barrierRig = {
        torso: findByName(model, ['Spine2', 'Spine1']),
        head: findByName(model, ['Head']),
        shoulderL: findByName(model, ['LeftShoulder']),
        shoulderR: findByName(model, ['RightShoulder']),
      };


      this.mixer = new THREE.AnimationMixer(model);
      let restClips = restClipCache.get(source.scene);
      if (restClips === undefined) {
        restClips = buildZombieRestClips(this.root, this.modelConfig.height);
        restClipCache.set(source.scene, restClips);
      }
      for (const state of ['spawn', 'walk', 'attack', 'barrierAttack', 'barrierBreak', 'hit'] as const) {
        const clip = resolveClip(source.clips, this.modelConfig.clips[state]);
        if (clip) this.actions.set(state, this.mixer.clipAction(clip));
      }
      for (const [style, clip] of restClips?.deaths ?? []) {
        const action = this.mixer.clipAction(clip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        this.deathActions.set(style, action);
      }
      const idleClip = restClips?.idle ?? (this.modelConfig.idleClip
        ? resolveClip(source.clips, this.modelConfig.idleClip)
        : null);
      if (idleClip) {
        const idleAction = this.mixer.clipAction(idleClip);
        idleAction.setLoop(THREE.LoopRepeat, Infinity);
        this.idleAction = idleAction;
      }
    } else {
      const built = modelId === 'brute'
        ? buildProceduralBrute(tint, castShadow)
        : buildProceduralHumanoid(tint, castShadow);
      this.rig = built.rig;
      this.materials.push(...built.materials);
      this.root.add(built.root);
      this.torsoAnchor = built.rig.hips;
      this.headAnchor = built.rig.head;
      this.barrierRig = {
        torso: built.rig.torso, head: built.rig.head,
        shoulderL: built.rig.armL, shoulderR: built.rig.armR,
      };

    }

    if (this.rig) {
      this.hipsRestY = this.rig.hips.position.y;
      this.poseBones.push(...Object.values(this.rig));
      this.poseFrom.push(...this.poseBones.map((bone) => bone.quaternion.clone()));
    }
    if (source) {
      // Measure limb rest positions only after normalization has reached the
      // world matrices. Stale pre-scale matrices create oversized attack arcs.
      this.root.updateMatrixWorld(true);
      for (const side of ['Left', 'Right']) {
        const makeLimb = (names: string[][], list: ZombieLimb[]): void => {
          const bones = names.map((candidates) => findByName(this.root, candidates));
          if (!bones[0] || !bones[1] || !bones[2]) return;
          const limb = new ZombieLimb(this.root, bones[0], bones[1], bones[2]);
          list.push(limb);
          for (const bone of bones) this.limbBones.add(bone!);
        };
        makeLimb([[`${side}Arm`], [`${side}ForeArm`], [`${side}Hand`]], this.arms);
      }
      this.root.traverse((bone) => {
        if (bone instanceof THREE.Bone || this.limbBones.has(bone) ||
          bone === this.torsoAnchor || bone === this.headAnchor || bone === this.barrierRig?.torso) {
          this.poseBones.push(bone);
          this.poseFrom.push(bone.quaternion.clone());
        }
      });
      for (const names of [['LeftFoot'], ['RightFoot']]) {
        const foot = findByName(this.root, names);
        if (!foot) continue;
        this.feet.push(foot);
        foot.getWorldPosition(this.footPosition);
        this.footRestY.push(this.root.worldToLocal(this.footPosition).y);
      }
    }

    const eyes = buildEyes(this.modelConfig.eyes);
    this.positionFrom.push(...this.poseBones.map(bone => bone.position.clone()));
    this.baseRotations.push(...this.poseBones.map(bone => bone.quaternion.clone()));
    this.basePositions.push(...this.poseBones.map(bone => bone.position.clone()));
    this.baseScales.push(...this.poseBones.map(bone => bone.scale.clone()));
    this.eyeMaterials = eyes.materials;
    this.fadeMaterials = [...this.materials, ...this.eyeMaterials]
      .filter((material) => material.blending === THREE.NormalBlending);
    for (const material of this.fadeMaterials) registerFadeMaterial(material);
    for (const material of this.materials) {
      installRayGunDissolve(material, this.modelConfig.height);
    }
    this.root.updateMatrixWorld(true);
    placeOnAnchor(eyes.group, this.headAnchor, this.resolveHeadTarget());

    this.materialBases.push(...this.materials.map((material) => ({
      color: material.color.clone(),
      roughness: material.roughness,
      metalness: material.metalness,
      envMapIntensity: material.envMapIntensity,
    })));
    this.shinyStars = modelId === 'walker' ? new ShinyStars() : null;
    if (this.shinyStars) this.root.add(this.shinyStars.points);
    const arcAnchors = this.rig
      ? Object.values(this.rig)
      : ARC_ANCHORS.map((name) => findByName(this.root, [name])).filter((bone): bone is THREE.Object3D => bone !== null);
    this.electricArcs = new ZombieElectricArcs(arcAnchors);
    this.root.add(this.electricArcs.mesh);
    this.rayGunAsh = new RayGunAshParticles(this.modelConfig.height);
    this.root.add(this.rayGunAsh.points);
    // Pitch and roll tip the body in its own frame; the death twist then yaws the result.
    this.root.rotation.order = 'YXZ';
  }

  /** Resets and applies a type treatment compatible with this fixed model. */
  public setZombieType(typeId: ZombieTypeId): void {
    const config = ZOMBIE_TYPE_CONFIGS[typeId];
    if (config.modelId !== this.modelId) {
      throw new Error(`Zombie type "${typeId}" requires model "${config.modelId}", got "${this.modelId}"`);
    }
    this.flash = this.electrified = 0;
    this.emissiveOverridden = false;
    this.electricArcs.hide();
    this.restoreBasePose();
    this.motionSpeed = this.lean = this.turnLean = 0;
    this.reactionX = this.reactionZ = 0;
    this.reactionAge = 1;
    this.deathTime = this.deathLean = this.deathSide = this.deathTwist = 0;
    this.deathStyle = 'knockback';
    this.groundOffset = this.attackReach = 0;
    this.clearWindowVault();
    Object.assign(this.vaultPose, this.vaultGoal);
    this.locomotionAction = null;
    this.strikeTarget.set(0, 1.3, 1);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.mixer?.stopAllAction();
    this.captureBasePose();
    this.currentAction = null;
    this.idleActive = false;
    const walk = this.actions.get('walk');
    if (walk) walk.time = this.walkPhase * walk.getClip().duration;
    this.zombieType = typeId;
    this.root.scale.set(...config.bodyScale);
    this.walkAnimationMultiplier = config.walkAnimationMultiplier;
    this.glowColor = UNDEAD_GLOW;
    this.glowIntensity = UNDEAD_GLOW_INTENSITY;
    this.shinyStars?.setEnabled(typeId === 'shiny');
    this.dissolveOrigin.set(0, this.modelConfig.height * 0.55, 0);
    this.setDissolveProgress(0, this.dissolveOrigin);
    this.rayGunAsh.reset();

    for (let index = 0; index < this.materials.length; index++) {
      const material = this.materials[index];
      const base = this.materialBases[index];
      material.color.copy(base.color);
      material.roughness = base.roughness;
      material.metalness = base.metalness;
      material.envMapIntensity = base.envMapIntensity;
      if (config.materialTreatment === 'shiny') {
        material.color.setHex(0xffe39b);
        material.roughness = Math.min(material.roughness, 0.28);
        material.metalness = Math.max(material.metalness, 0.22);
        material.envMapIntensity = Math.max(material.envMapIntensity, 1.6);
        this.glowColor = 0xffb52e;
        this.glowIntensity = 0.85;
      }
      material.emissive.setHex(this.glowColor);
      material.emissiveIntensity = this.glowIntensity;
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

  /** Full-cycle per-instance phase offset without changing stride cadence. */
  public setWalkPhase(phase: number): void {
    this.walkPhase = THREE.MathUtils.euclideanModulo(phase, 1);
    const walk = this.actions.get('walk');
    if (walk) {
      walk.time = this.walkPhase * walk.getClip().duration;
    }
    this.nextAttackVariant = Math.floor(this.walkPhase * 3) % 3;
    this.nextBarrierVariant = (this.nextAttackVariant + 1) % 3;
  }

  /** The attack clip is stretched/squeezed to the gameplay attack duration. */
  setAttackDuration(seconds: number): void {
    this.attackDuration = seconds;
  }

  /** Collision-cleared visual step, bounded independently from damage range. */
  setAttackReach(reach: number): void {
    this.attackReach = THREE.MathUtils.clamp(reach, 0, ZOMBIE_ATTACK_LUNGE);
  }

  /** Contact point relative to the navigation body, in unscaled visual meters. */
  setStrikeTarget(x: number, y: number, z: number): void {
    this.strikeTarget.set(x, y, z);
  }

  /**
   * Climb over a window sill at `progress` 0..1; `sill` and `depth` (how
   * far ahead the sill is) are in root units. Layered over the walk cycle.
   */
  setWindowVault(progress: number, sill: number, depth: number): void {
    windowVaultPose(progress, sill, this.vaultGoal);
    this.vaultSill = sill;
    this.vaultDepth = depth;
  }

  /** No climb: the pose eases back to the plain walk. */
  clearWindowVault(): void {
    this.vaultGoal.lift = this.vaultGoal.rootPitch = this.vaultGoal.torsoPitch = this.vaultGoal.roll = this.vaultGoal.reach = 0;
  }

  setBarrierBreakDuration(seconds: number): void {
    this.barrierBreakDuration = seconds;
  }

  /**
   * Chooses the fall played by the next setState('death'). The push is the
   * body-local direction of the killing impact; impact-following falls turn
   * up to DEATH_MAX_TWIST towards it so a side hit never falls sideways-on.
   */
  public prepareDeath(style: ZombieDeathStyle, pushX: number, pushZ: number): void {
    this.deathStyle = style;
    const profile = ZOMBIE_DEATH_PROFILES[style];
    if (!profile.followsImpact || (pushX === 0 && pushZ === 0)) {
      this.deathTwist = 0;
      return;
    }
    const delta = Math.atan2(pushX, pushZ) - (profile.fall === 'back' ? Math.PI : 0);
    this.deathTwist = THREE.MathUtils.clamp(Math.atan2(Math.sin(delta), Math.cos(delta)), -DEATH_MAX_TWIST, DEATH_MAX_TWIST);
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
  public setState(state: ZombieState): void {
    const previous = this.state;
    if (previous !== state) {
      for (let i = 0; i < this.poseBones.length; i++) {
        this.poseFrom[i].copy(this.poseBones[i].quaternion);
        this.positionFrom[i].copy(this.poseBones[i].position);
      }
      this.transitionDuration = state === 'death' ? DEATH_CROSSFADE_SECONDS : CROSSFADE_SECONDS;
      this.transitionTime = state === 'spawn' || (state === 'barrierBreak' && previous === 'barrierAttack')
        ? this.transitionDuration : 0;
    }
    if (state === 'walk' && previous === 'walk' && this.idleActive) return;
    this.state = state;
    if (previous !== state) this.idleActive = false;
    if ((state === 'barrierAttack' || state === 'attack') && previous !== state) {
      this.barrierMotionTime = 0;
      const variant = state === 'attack' ? this.nextAttackVariant : this.nextBarrierVariant;
      if (state === 'attack') {
        this.attackVariant = variant;
        this.nextAttackVariant = (variant + 1) % 3;
      } else {
        this.barrierVariant = variant;
        this.nextBarrierVariant = (variant + 1) % 3;
      }
      // Variants 0/1 lead with one arm each; variant 2 strikes with both.
      this.barrierStrikeSide = variant === 2 ? 0 : Math.sign(this.arms[variant]?.rest.x ?? (variant === 0 ? -1 : 1));
    }
    if (state === 'barrierBreak' && previous === 'barrierAttack') {
      this.barrierBreakStart = Math.min(1, this.barrierMotionTime / this.attackDuration);
      this.barrierMotionTime = 0;
    }
    if (state === 'death' && this.shinyStars) this.shinyStars.points.visible = false;
    if (state === 'death' && previous !== 'death') {
      this.deathTime = 0;
      this.deathStartPitch = this.root.rotation.x;
      this.deathStartRoll = this.root.rotation.z;
      this.deathStartForward = this.root.position.z;
      this.deathTravel = Math.min(0.14, this.motionSpeed * DEATH_MOMENTUM_SECONDS);
      this.deathLean = Math.min(0.16, this.motionSpeed * 0.065) + this.lean;
      this.deathSide = Math.sin(this.bobPhase + this.idlePhase) * 0.16 + this.turnLean;
    }
    if (state !== 'death') this.collapse = 0;
    // Known rigs use a contact-timed upper-body strike over a quiet base.
    // Unknown rigs retain their authored attack; barriers never use a bite.
    if (state === 'barrierAttack' || state === 'barrierBreak' ||
      (state === 'attack' && this.arms.length === 2)) {
      const base = this.idleAction ?? this.actions.get('walk') ?? null;
      if (base && base !== this.currentAction) {
        base.reset();
        base.enabled = true;
        base.play();
        if (this.currentAction) base.crossFadeFrom(this.currentAction, CROSSFADE_SECONDS, false);
        this.currentAction = base;
      }
      this.locomotionAction = base;
      // Attack choreography owns the limbs. A moving idle/walk underneath it
      // changes the shoulder origin and turns the same swipe into a wobble.
      if (base) { base.time = 0; base.timeScale = 0; }
      return;
    }
    const next = (state === 'death' ? this.deathActions.get(this.deathStyle) : this.actions.get(state)) ?? null;
    if (!next) {
      // Clipless reactions layer over the uninterrupted locomotion clock.
      if (state === 'hit' && previous !== 'hit') this.reactToHit(0, -1, 0.12);
      // Keep the last living joint pose under the lightweight collapse.
      if (state === 'death' && this.currentAction) this.currentAction.paused = true;
      return;
    }
    if (next === this.currentAction) {
      // Already driving the pose (walk after a clipless hit, or a repeated
      // one-shot under sustained fire): let the clip run, never reset.
      if (state === 'walk') next.timeScale = 1;
      return;
    }
    if (state === 'walk') {
      next.enabled = true;
      next.timeScale = 1;
      if (this.currentAction) next.crossFadeFrom(this.currentAction, CROSSFADE_SECONDS, false);
      next.play();
      this.currentAction = next;
      this.locomotionAction = next;
      return;
    }
    next.reset();
    if (state === 'attack') {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.timeScale = next.getClip().duration / this.attackDuration;
    }
    if (state === 'spawn') next.timeScale = 1.15;
    if (state === 'hit') next.timeScale = 1.4;
    // Each death clip is authored at its real speed (ZombieDeath profiles).
    if (state === 'death') {
      next.timeScale = 1;
      // The pose-space blend alone carries the living pose into the fall. A
      // mixer crossfade on top kept the walk cycle stepping and ended with a
      // velocity jump, read as a hitch before the body went down. Disabling
      // (not stopping) keeps the mixer from snapping bindings to the bind pose.
      for (const action of this.actions.values()) action.enabled = false;
      if (this.idleAction) this.idleAction.enabled = false;
    }
    next.enabled = true;
    // next !== currentAction here (the same-action case returned above).
    if (this.currentAction && state !== 'death') next.crossFadeFrom(this.currentAction, CROSSFADE_SECONDS, false);
    next.play();
    this.currentAction = next;
  }

  /** Red emissive pulse on bullet impact. */
  hitFlash(): void {
    this.flash = 1;
  }

  /** Keeps ZEUS-77 arcs crawling over the body (alive or dead) for at least `seconds`. */
  public electrify(seconds: number): void {
    this.electrified = Math.max(this.electrified, seconds);
  }

  /** Additive recoil in body-local space; never changes the locomotion clock. */
  reactToHit(localX: number, localZ: number, strength: number): void {
    this.reactionX = THREE.MathUtils.clamp(this.reactionX + localZ * strength, -0.18, 0.18);
    this.reactionZ = THREE.MathUtils.clamp(this.reactionZ - localX * strength, -0.14, 0.14);
    this.reactionAge = 0;
  }

  /** Actual collision-resolved speed and angular velocity, supplied by the owner. */
  setMotion(dt: number, speed: number, turnRate: number): void {
    if (dt <= 0 || this.state === 'death') return;
    const blend = 1 - Math.exp(-dt * 9);
    const acceleration = THREE.MathUtils.clamp((speed - this.motionSpeed) * 0.09, -0.12, 0.12);
    this.lean += (acceleration - this.lean) * blend;
    this.turnLean += (THREE.MathUtils.clamp(-turnRate * 0.025, -0.12, 0.12) - this.turnLean) * blend;
    this.motionSpeed += (speed - this.motionSpeed) * blend;
  }

  /** 0 (fully buried) → 1 (standing on the ground) while spawning. */
  setSpawnRise(t: number): void {
    this.rise = t;
  }

  /** 0 → 1 during the death fall; only collapses when no death clip exists. */
  setDeathProgress(t: number): void {
    if (this.deathActions.size > 0) return; // the clip handles the fall
    this.collapse = t;
  }

  /** Death fade driven by the owning Zombie during its last moments. */
  public setOpacity(opacity: number): void {
    if (this.shinyStars) this.shinyStars.points.material.opacity = opacity;
    for (const material of this.eyeMaterials) material.opacity = opacity;
    for (const material of this.fadeMaterials) setFadeOpacity(material, opacity);
    this.opacity = opacity;
    if (this.emissiveOverridden) return;
    for (const material of this.materials) material.emissiveIntensity = this.glowIntensity * opacity;
  }

  /**
   * Drives the Ray Gun energy dissolution shader (`0..1`) and ascending ash
   * particle burst instead of the standard corpse fall-and-linger sequence.
   */
  public setDissolveProgress(progress: number, localOrigin?: THREE.Vector3): void {
    this.dissolveProgress = THREE.MathUtils.clamp(progress, 0, 1);
    if (localOrigin) this.dissolveOrigin.copy(localOrigin);
    for (const material of this.materials) {
      setRayGunDissolveState(material, this.dissolveProgress, localOrigin);
      if (this.dissolveProgress > 0) {
        material.emissive.setHex(RAYGUN_NEON_GREEN);
        material.emissiveIntensity = Math.sin(this.dissolveProgress * Math.PI) * 1.65;
      }
    }
    if (this.dissolveProgress > 0) {
      const eyeAlpha = Math.max(0, 1 - this.dissolveProgress * 2.2);
      for (const material of this.eyeMaterials) material.opacity = eyeAlpha;
      if (this.currentAction) this.currentAction.paused = true;
    }
    this.rayGunAsh.setProgress(this.dissolveProgress);
  }

  public get currentDissolveProgress(): number {
    return this.dissolveProgress;
  }

  public update(dt: number, speed: number): void {
    this.restoreBasePose();
    this.transitionTime += dt;
    this.reactionAge += dt;
    if (this.state === 'death') this.deathTime += dt;
    // Spawn rise and death collapse apply to the visual root in both paths.
    this.heavyBobPhase += dt * Math.max(0.4, speed) * 2.1;
    this.idlePhase += dt;
    if (this.state === 'barrierAttack' || this.state === 'barrierBreak' || this.state === 'attack') {
      this.barrierMotionTime += dt;
    }
    const heavyBob = this.zombieType === 'brute' && this.state === 'walk'
      ? (1 - Math.cos(this.heavyBobPhase * 2)) * 0.009
      : 0;
    this.root.position.y = -(1 - this.rise) * SPAWN_DEPTH + heavyBob;
    this.root.position.z = 0;
    this.root.rotation.set(0, 0, 0);
    if (this.dissolveProgress > 0) {
      // Vaporizing zombies arch back slightly and convulse in place as they disintegrate.
      const arch = Math.sin(Math.min(1, this.dissolveProgress * 1.4) * Math.PI * 0.5);
      this.root.rotation.x = -arch * 0.24;
      this.root.rotation.z = Math.sin(this.dissolveProgress * 28) * 0.04 * (1 - this.dissolveProgress);
      this.root.position.y += arch * 0.08;
    } else if (this.collapse > 0) {
      // Clipless fallback: tip the rigid body over in the style's direction.
      const ease = 1 - (1 - this.collapse) * (1 - this.collapse);
      const tip = ease * (Math.PI / 2 - 0.12);
      const fall = ZOMBIE_DEATH_PROFILES[this.deathStyle].fall;
      if (fall === 'side') this.root.rotation.z = tip;
      else {
        this.root.rotation.x = fall === 'back' ? -tip : tip;
        this.root.rotation.z = ease * (0.18 + this.deathSide);
      }
    }
    if (this.state === 'death' && this.dissolveProgress <= 0) {
      const settle = Math.min(1, this.deathTime / ZOMBIE_DEATH_FALL);
      const remaining = 1 - smoothStep(settle);
      // Momentum and pose continuity from the living body, layered over the fall:
      // the body leaves at walking speed and decays, never stopping dead first.
      const carried = 1 - Math.exp(-this.deathTime / DEATH_MOMENTUM_SECONDS);
      this.root.position.z = this.deathStartForward + this.deathTravel * carried;
      this.root.rotation.x += this.deathStartPitch * remaining;
      this.root.rotation.z += this.deathStartRoll * remaining;
      // Lean and sway humps fade before the body is low: rocking a lying body
      // about the feet would sink its far end into the floor.
      const hump = Math.sin(Math.min(1, settle * 2) * Math.PI);
      this.root.rotation.x += this.deathLean * hump;
      if (this.deathActions.size > 0) this.root.rotation.z += this.deathSide * hump;
      this.root.rotation.y = this.deathTwist * smoothStep(Math.min(1, settle * 2));
    }
    if (this.state === 'attack') {
      this.root.position.z = sampleMeleeMotion(this.barrierProgress(), 0, this.attackReach * 0.12,
        this.attackReach, this.attackReach * 0.85, 0);
    }
    if (this.state === 'barrierAttack' || this.state === 'barrierBreak') {
      const progress = this.barrierProgress();
      // Braced feet and a small weight shift, never a whole-body rocking pivot.
      this.root.position.y += sampleWindowMotion(progress, 0, -0.015, -0.025, -0.015, 0);
      this.root.position.z = sampleWindowMotion(progress, 0, 0.025, 0.025, -0.025, 0);
    }
    this.easeWindowVault(dt);
    // The leading leg alternates with the stride phase, so bodies do not climb in lockstep.
    const leadSide = this.walkPhase < 0.5 ? 1 : -1;
    this.root.position.y += this.vaultPose.lift;
    this.root.rotation.x += this.vaultPose.rootPitch;
    this.root.rotation.z += this.vaultPose.roll * leadSide;

    if (this.mixer) {
      const walk = this.actions.get('walk');
      const stationary = this.state === 'walk' && speed <= STATIONARY_SPEED && this.collapse <= 0;
      if (this.idleAction) {
        if (stationary && !this.idleActive) {
          // The walk clip freezes mid-cycle at zero ground speed (e.g.
          // recovering between barrier swings), which can pause on an
          // arms-raised frame and read as stuck. Crossfading into the
          // authored idle clip drives real joint motion (breathing, head
          // and arm sway) instead of just swaying the whole root.
          this.idleActive = true;
          this.idleAction.reset();
          this.idleAction.enabled = true;
          this.idleAction.timeScale = 1;
          this.idleAction.play();
          if (this.currentAction) this.idleAction.crossFadeFrom(this.currentAction, CROSSFADE_SECONDS, false);
          this.currentAction = this.idleAction;
          this.locomotionAction = this.idleAction;
        } else if (!stationary && this.idleActive && walk) {
          this.idleActive = false;
          walk.enabled = true;
          walk.timeScale = 1;
          walk.play();
          walk.crossFadeFrom(this.idleAction, CROSSFADE_SECONDS, false);
          this.currentAction = walk;
          this.locomotionAction = walk;
        }
      }
      if (walk && this.state === 'walk' && !stationary) {
        if (this.locomotionAction !== walk) {
          const previous = this.locomotionAction;
          const phase = previous
            ? THREE.MathUtils.euclideanModulo(previous.time / previous.getClip().duration, 1)
            : this.walkPhase;
          walk.enabled = true;
          walk.time = phase * walk.getClip().duration;
          walk.play();
          if (previous) walk.crossFadeFrom(previous, CROSSFADE_SECONDS, false);
          this.currentAction = walk;
          this.locomotionAction = walk;
          this.idleActive = false;
        }
        walk.timeScale = this.walkAnimationMultiplier
          * Math.max(0, speed / this.modelConfig.walkReferenceSpeed);
      } else if (stationary && !this.idleAction && this.locomotionAction) {
        // Assets without an idle hold a planted locomotion pose. Subtle life
        // comes from torso/head breathing below, never from shuffling feet or
        // rocking the complete body around its ankles.
        this.locomotionAction.timeScale = 0;
      }
      this.mixer.update(dt);
    } else if (this.rig) {
      this.updateProcedural(dt, speed);
    }

    this.captureBasePose();
    if (this.state === 'death' && this.deathActions.size === 0) {
      // The mixer has paused its base clip, but the actual last visible pose
      // also includes solved limbs. Preserve that pose underneath the fall.
      for (let i = 0; i < this.poseBones.length; i++) this.poseBones[i].quaternion.copy(this.poseFrom[i]);
    }
    if (this.state === 'attack' || this.state === 'barrierAttack' || this.state === 'barrierBreak') {
      this.applyAttackBodyPose(this.barrierProgress());
    }
    this.applyInertia(dt);
    this.applyWindowVaultPose();
    this.applyLimbMotion();
    const blend = smoothStep(Math.min(1, this.transitionTime / this.transitionDuration));
    if (blend < 1) {
      for (let i = 0; i < this.poseBones.length; i++) {
        this.poseBones[i].quaternion.slerp(this.poseFrom[i], 1 - blend);
        this.poseBones[i].position.lerp(this.positionFrom[i], 1 - blend);
      }
    }
    // Two cached ankle anchors, no raycasts or per-vertex bounds. Preserve
    // the authored swing foot while seating the lower support foot.
    let groundTarget = 0;
    if (this.state === 'walk' && this.feet.length === 2) {
      let support = Infinity;
      for (let i = 0; i < this.feet.length; i++) {
        this.feet[i].getWorldPosition(this.footPosition);
        support = Math.min(support, this.root.worldToLocal(this.footPosition).y - this.footRestY[i]);
      }
      groundTarget = -THREE.MathUtils.clamp(support * this.root.scale.y, -0.08, 0.08);
    }
    this.groundOffset += (groundTarget - this.groundOffset) * (1 - Math.exp(-dt * 18));
    this.root.position.y += this.groundOffset;

    if (this.shinyStars?.points.visible) {
      this.torsoAnchor.getWorldPosition(this.tmpShinyAnchor);
      this.root.worldToLocal(this.tmpShinyAnchor);
      this.shinyStars.points.position.set(this.tmpShinyAnchor.x, this.tmpShinyAnchor.y - 0.85, this.tmpShinyAnchor.z);
      this.shinyStars.update(dt);
    }

    this.electrified = Math.max(0, this.electrified - dt);
    const charge = Math.min(1, this.electrified / ELECTRIC_FADE);
    this.electricArcs.update(dt, charge * this.opacity);
    if (this.flash > 0 || charge > 0 || this.dissolveProgress > 0 || this.emissiveOverridden) {
      this.updateEmissive(dt, charge);
    }
  }

  /** Red hit flash beats the electric flicker and dissolve glow; the undead glow returns when all end. */
  private updateEmissive(dt: number, charge: number): void {
    this.flash = Math.max(0, this.flash - dt * 5);
    // Mostly a faint cold sheen with occasional bright jolts, so the arcs stay the focus.
    const spike = Math.random() ** 3;
    const flicker = charge * (0.15 + 0.55 * spike) * this.opacity;
    for (const material of this.materials) {
      if (this.flash > 0) {
        material.emissive.setHex(FLASH_COLOR);
        material.emissiveIntensity = this.flash * 1.5;
      } else if (this.dissolveProgress > 0) {
        material.emissive.setHex(RAYGUN_NEON_GREEN);
        material.emissiveIntensity = Math.sin(this.dissolveProgress * Math.PI) * 1.65;
      } else if (charge > 0) {
        material.emissive.setHex(ELECTRIC_COLOR);
        material.emissiveIntensity = flicker;
      } else {
        material.emissive.setHex(this.glowColor);
        material.emissiveIntensity = this.glowIntensity * this.opacity;
      }
    }
    this.emissiveOverridden = this.flash > 0 || charge > 0 || this.dissolveProgress > 0;
  }

  /** Code-driven humanoid animation for the fallback rig. */
  private updateProcedural(dt: number, speed: number): void {
    const rig = this.rig;
    if (!rig) return;
    if (this.state === 'death') {
      for (let i = 0; i < this.poseBones.length; i++) this.poseBones[i].quaternion.copy(this.poseFrom[i]);
      return;
    }
    // The emergency rig retains its own stride; GLB calibration is asset-specific.
    const referenceSpeed = this.modelId === 'walker' ? 1.35 : this.modelConfig.walkReferenceSpeed;
    this.bobPhase += dt * 4.8 * Math.max(0, speed / referenceSpeed);
    const p = this.bobPhase;

    if (this.state === 'attack' || this.state === 'barrierAttack' || this.state === 'barrierBreak') {
      rig.torso.rotation.set(0.28, 0, 0);
      rig.head.rotation.set(-0.15, 0, 0);
      rig.armL.rotation.set(-0.7, 0, 0.12);
      rig.armR.rotation.set(-0.7, 0, -0.12);
      rig.legL.rotation.set(0.08, 0, 0);
      rig.legR.rotation.set(-0.08, 0, 0);
      rig.hips.position.y = this.hipsRestY;
      return;
    }
    if (this.state === 'hit') {
      rig.torso.rotation.x = -0.2; // knocked backwards
      rig.head.rotation.x = -0.5;
      return;
    }
    rig.head.rotation.x = -0.15;
    const stride = Math.min(1, speed / 0.35);
    rig.legL.rotation.x = Math.sin(p) * 0.55 * stride;
    rig.legR.rotation.x = Math.sin(p + Math.PI) * 0.55 * stride;
    const legLength = this.modelId === 'walker' ? 0.92 : 1.37;
    rig.hips.position.y = this.hipsRestY - legLength * (1 - Math.cos(rig.legL.rotation.x));
    // Restrained arm drag shares the leg phase.
    rig.armL.rotation.x = -0.4 + Math.sin(p + Math.PI) * 0.08;
    rig.armR.rotation.x = -0.48 + Math.sin(p) * 0.08;
    rig.armL.rotation.z = 0.12 + Math.sin(p) * 0.015;
    rig.armR.rotation.z = -0.14 - Math.sin(p) * 0.015;
    rig.torso.rotation.x = 0.28 + Math.sin(p * 2) * 0.04;
    rig.torso.rotation.z = Math.sin(p) * 0.06;
    rig.head.rotation.z = -Math.sin(p) * 0.02;
  }

  private barrierProgress(): number {
    if (this.state === 'barrierBreak') {
      return Math.min(1, this.barrierBreakStart
        + Math.min(this.barrierMotionTime, this.barrierBreakDuration) / this.attackDuration);
    }
    return Math.min(1, this.barrierMotionTime / Math.max(this.attackDuration, 1e-3));
  }

  private restoreBasePose(): void {
    for (let i = 0; i < this.poseBones.length; i++) {
      this.poseBones[i].quaternion.copy(this.baseRotations[i]);
      this.poseBones[i].position.copy(this.basePositions[i]);
      this.poseBones[i].scale.copy(this.baseScales[i]);
    }
  }

  private captureBasePose(): void {
    for (let i = 0; i < this.poseBones.length; i++) {
      this.baseRotations[i].copy(this.poseBones[i].quaternion).normalize();
      this.basePositions[i].copy(this.poseBones[i].position);
      this.baseScales[i].copy(this.poseBones[i].scale);
    }
  }

  private rotateBarrierBone(bone: THREE.Object3D | null, x: number, y: number, z: number): void {
    if (!bone) return;

    this.barrierQuaternion.setFromEuler(this.barrierEuler.set(x, y, z));
    // Anatomical offsets use the visual body's axes, not each export's
    // arbitrary bone-local axes (GLB rigs and procedural fallbacks differ here).
    bone.getWorldQuaternion(this.boneWorldRotation).normalize();
    this.root.getWorldQuaternion(this.rootWorldRotation).normalize();
    this.boneBasis.copy(this.boneWorldRotation).invert().multiply(this.rootWorldRotation);
    this.barrierQuaternion.premultiply(this.boneBasis);
    this.boneBasis.invert();
    this.barrierQuaternion.multiply(this.boneBasis);
    bone.quaternion.multiply(this.barrierQuaternion).normalize();
  }

  /** Compact spatially aimed strikes. Locomotion remains owned by the authored
   * clips so procedural correction cannot destabilize the legs or wrists. */
  private applyLimbMotion(): void {
    const melee = this.state === 'attack';
    if (!melee && this.state !== 'barrierAttack' && this.state !== 'barrierBreak') return;

    const progress = this.barrierProgress();
    const variant = melee ? this.attackVariant : this.barrierVariant;
    for (let i = 0; i < this.arms.length; i++) {
      const arm = this.arms[i];
      const side = Math.sign(arm.rest.x) || 1;
      const height = this.modelConfig.height;
      const active = variant === 2 || i === variant;
      // Let the spare arm keep its relaxed, authored pose. Solving it into
      // a second artificial guard was forcing the elbow away from the ribs.
      if (!active) continue;
      arm.tip.getWorldPosition(this.limbPoint);
      this.root.worldToLocal(this.limbPoint);
      const neutralX = this.limbPoint.x;
      const neutralY = this.limbPoint.y;
      const neutralZ = this.limbPoint.z;
      const x = this.strikeTarget.x;
      const y = this.strikeTarget.y;
      const z = this.strikeTarget.z;
      const weight = smoothStep(Math.min(1, progress / 0.22));
      if (melee) {
        const spread = variant === 2 ? side * 0.17 : 0;
        this.limbPoint.set(
          sampleMeleeMotion(progress, neutralX, side * 0.3, x + spread, x - side * 0.1 + spread, neutralX),
          sampleMeleeMotion(progress, neutralY, y - 0.12, y, y - 0.1, neutralY),
          sampleMeleeMotion(progress, neutralZ, 0.24, z, z - 0.08, neutralZ),
        );
      } else {
        const elapsed = progress * this.attackDuration - ZOMBIE_ATTACK_HIT_MOMENT;
        const pull = boardPullProgress(elapsed);
        const release = smoothStep(Math.max(0, Math.min(1, (elapsed - BOARD_PULL_DURATION) / 0.095)));
        // Wind-up stays behind the contact plane. The shoulder drives the
        // compact pound; only after contact does the hand follow the board.
        this.limbPoint.set(
          sampleWindowMotion(progress, neutralX, x + side * 0.22, x + side * 0.16, x + side * 0.16, neutralX),
          sampleWindowMotion(progress, neutralY, y + (variant === 2 ? 0.24 : 0.12), y, y, neutralY) - BOARD_PULL_DROP * pull * (1 - release),
          sampleWindowMotion(progress, neutralZ, z - 0.32, z, z, neutralZ) - BOARD_PULL_DISTANCE * pull * (1 - release),
        );
      }
      // Targets are body-relative; compensate once for the root's step.
      this.limbPoint.sub(this.root.position);
      this.limbRotation.copy(this.root.quaternion).invert();
      this.limbPoint.applyQuaternion(this.limbRotation);
      arm.solve(this.limbPoint.x, this.limbPoint.y, this.limbPoint.z,
        side * height * 0.24, height * 0.52, -0.05, weight, 0, true);
    }
  }

  private applyInertia(dt: number): void {
    const rig = this.barrierRig;
    if (!rig || this.state === 'spawn') return;
    const recoil = this.reactionAge < 0.24 ? Math.sin(Math.PI * this.reactionAge / 0.24) : 0;
    const alive = this.state === 'death' ? Math.max(0, 1 - this.deathTime / ZOMBIE_DEATH_FALL) : 1;
    const pitch = (this.lean + this.reactionX * recoil) * alive;
    const roll = (this.turnLean + this.reactionZ * recoil) * alive;
    // Keep locomotion authored by the original asset. Only acceleration,
    // steering and hit recoil are layered here, so the classic hunched gait
    // and arm swing remain intact instead of being re-authored every frame.
    this.rotateBarrierBone(rig.torso, pitch, -roll * 0.5, roll);
    this.rotateBarrierBone(rig.head, -pitch * 0.55, roll * 0.4, -roll * 0.6);
    const decay = Math.exp(-dt * 6);
    this.reactionX *= decay;
    this.reactionZ *= decay;
  }

  private easeWindowVault(dt: number): void {
    const blend = 1 - Math.exp(-Math.max(0, dt) * 12);
    const pose = this.vaultPose;
    const goal = this.vaultGoal;
    pose.lift += (goal.lift - pose.lift) * blend;
    pose.rootPitch += (goal.rootPitch - pose.rootPitch) * blend;
    pose.torsoPitch += (goal.torsoPitch - pose.torsoPitch) * blend;
    pose.roll += (goal.roll - pose.roll) * blend;
    pose.reach += (goal.reach - pose.reach) * blend;
  }

  /** Spine hunched over the sill and both hands planted on it while hauling the body up. */
  private applyWindowVaultPose(): void {
    const rig = this.barrierRig;
    const pose = this.vaultPose;
    if (!rig || this.state === 'death') return;
    if (pose.torsoPitch > 1e-3) {
      this.rotateBarrierBone(rig.torso, pose.torsoPitch, 0, 0);
      // The head keeps looking ahead into the room.
      this.rotateBarrierBone(rig.head, -pose.torsoPitch * 0.5, 0, 0);
    }
    if (pose.reach <= 1e-3 || this.state === 'attack' || this.state === 'barrierAttack' || this.state === 'barrierBreak') return;
    if (this.arms.length !== 2) {
      this.rotateBarrierBone(rig.shoulderL, -0.95 * pose.reach, 0, 0);
      this.rotateBarrierBone(rig.shoulderR, -0.95 * pose.reach, 0, 0);
      return;
    }
    const height = this.modelConfig.height;
    for (const arm of this.arms) {
      const side = Math.sign(arm.rest.x) || 1;
      // Hands on the sill edge a shoulder-width apart; body-relative like the strikes.
      this.limbPoint.set(side * 0.2, this.vaultSill + 0.03, Math.max(0.14, this.vaultDepth));
      this.limbPoint.sub(this.root.position);
      this.limbRotation.copy(this.root.quaternion).invert();
      this.limbPoint.applyQuaternion(this.limbRotation);
      arm.solve(this.limbPoint.x, this.limbPoint.y, this.limbPoint.z,
        side * height * 0.24, height * 0.52, -0.05, pose.reach, 0, true);
    }
  }

  private applyAttackBodyPose(progress: number): void {
    const rig = this.barrierRig;
    if (!rig) return;
    const side = this.barrierStrikeSide;
    const melee = this.state === 'attack';
    if (melee && this.currentAction === this.actions.get('attack') && this.currentAction) return;
    const sample = melee ? sampleMeleeMotion : sampleWindowMotion;
    const pitch = sample(progress, 0, -0.035, 0.16, 0.06, 0);
    const twist = side * sample(progress, 0, -0.07, 0.035, 0.07, 0);
    this.rotateBarrierBone(rig.torso, pitch, twist, 0);
    this.rotateBarrierBone(rig.head, -pitch * 0.45, -twist * 0.5, 0);
    if (this.arms.length === 2) return; // IK is the only owner of known-rig arms.
    // Clipless emergency rigs use the same distinct timing and asymmetry.
    const reach = sample(progress, 0, 0.15, -0.85, -0.6, 0);
    this.rotateBarrierBone(rig.shoulderL, side <= 0 ? reach : -0.1, 0, 0);
    this.rotateBarrierBone(rig.shoulderR, side >= 0 ? reach : -0.1, 0, 0);
  }

  /**
   * Releases GPU resources owned exclusively by this visual instance:
   * cloned materials, eye materials, ash particle geometry/shader, and
   * procedural fallback geometries.
   */
  public dispose(): void {
    this.mixer?.stopAllAction();
    this.rayGunAsh.dispose();
    if (this.shinyStars) {
      this.shinyStars.points.geometry.dispose();
      this.shinyStars.points.material.dispose();
    }
    for (const material of this.materials) material.dispose();
    for (const material of this.eyeMaterials) material.dispose();
    if (this.rig) {
      this.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.geometry !== eyeSocketGeometry
          && obj.geometry !== eyeGlowGeometry && obj.geometry !== eyeCoreGeometry) {
          obj.geometry.dispose();
        }
      });
    }
  }
}
