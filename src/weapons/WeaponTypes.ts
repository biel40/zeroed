import type { ShotVariation } from '../audio/ShotVariation';

export type WeaponId = 'm4a1' | 'ak47' | 'm60' | 'l96' | 'barrett' | 'raygun' | 'm1911' | 'tesla' | 'mp5' | 'vector' | 'ppsh41' | 'fakel';

export type FireMode = 'auto' | 'semi';

export type ShellCasingProfile = 'standard' | 'bmg50';

export type WeaponState = 'ready' | 'reloading' | 'cycling' | 'equipping';

export type ReloadType = 'tactical' | 'empty';

/** All angular values are radians, times are seconds, velocities are m/s. */
export interface RecoilConfig {
  /** Upward camera pitch added per shot. */
  readonly verticalKick: number;
  /** Maximum sideways yaw added per shot. */
  readonly horizontalKick: number;
  /** -1..1, horizontal tendency: 0 = symmetric, positive = drifts right. */
  readonly horizontalBias: number;
  /** 0..1, random fraction applied to each kick. */
  readonly kickVariance: number;
  /** Exponential recovery rate (1/s) once recovery starts. */
  readonly recoverySpeed: number;
  /** Delay after the last shot before recovery starts. */
  readonly recoveryDelay: number;
  /** Fraction of recoil sent to the camera; the rest drives the view model. */
  readonly cameraShare: number;
  /** Recoil multiplier while fully aiming down sights. */
  readonly adsRecoilMultiplier: number;
  /** Optional sharp upward camera jolt per shot that settles within a blink; heavy rifles only. */
  readonly cameraJolt?: number;
  /** Optional backward shove of the player per shot (m/s), damped out by movement; heavy rifles only. */
  readonly playerPush?: number;
}

export interface SpreadConfig {
  /** Base dispersion from the hip. */
  readonly hipBase: number;
  /** Base dispersion while fully in ADS. */
  readonly adsBase: number;
  /** Extra dispersion added per shot (bloom). */
  readonly bloomPerShot: number;
  /** Bloom cap. */
  readonly maxBloom: number;
  /** Bloom recovery per second. */
  readonly bloomRecovery: number;
}

/**
 * Barrel overheating under sustained full-auto fire (automatic weapons
 * only): the muzzle glows orange, smokes more and the spread grows.
 */
export interface BarrelHeatConfig {
  /** Consecutive rapid shots that take a cold barrel to full heat. */
  readonly shotsToOverheat: number;
  /** Seconds a fully hot barrel needs to cool down once firing stops. */
  readonly coolTime: number;
  /**
   * Seconds the barrel holds its heat after each shot before it starts
   * cooling; absent keeps a quarter second. A hold longer than the gap
   * between shots lets rapid semi-automatic fire stack heat exactly.
   */
  readonly coolDelay?: number;
  /** A fully hot barrel locks the trigger until it has cooled completely. */
  readonly lockout?: boolean;
  /**
   * Heat level (0..1) whose crossing warns that the lockout is near
   * (`heatWarning` event); a weapon that sets it also announces the moment
   * its locked barrel frees the trigger again (`cooledDown`).
   */
  readonly warning?: number;
  /** Extra dispersion (radians) at full overheat. */
  readonly maxSpreadBonus: number;
  /**
   * Glow sleeve size in model metres (before `view.scale`). Absent sizes it
   * from `view.barrelRadius`; set it when the barrel hides inside a jacket
   * or shroud so the glow wraps what the player actually sees.
   */
  readonly glow?: BarrelGlowSize;
}

/**
 * Heavy muzzle smoke: on top of the standard shot puff, a muzzle brake vents
 * clouds out to both sides of the view (clear of the sight line) and the
 * overheat wisps grow by the same scale.
 */
export interface MuzzleSmokeConfig {
  /** Side-vented puffs released per shot, alternating left and right. */
  readonly puffs: number;
  /** Size multiplier over the standard shot puff and the overheat wisps. */
  readonly scale: number;
  /** Seconds each vented puff lingers. */
  readonly life: number;
}

/** Heavy ballistic flash, in view-model metres and seconds; absent keeps the ordinary flash. */
export interface MuzzleFlashConfig {
  readonly length: number;
  readonly width: number;
  readonly sideLength: number;
  readonly coreScale: number;
  readonly duration: number;
  readonly lightIntensity: number;
}

export interface BarrelGlowSize {
  readonly radius: number;
  /** Stretch behind the muzzle that glows. */
  readonly length: number;
}

export interface AdsConfig {
  /** Camera FOV when fully aiming. */
  readonly fov: number;
  /** ADS blend speed (alpha per second). */
  readonly speed: number;
  /** Mouse sensitivity multiplier while aiming. */
  readonly sensitivity: number;
}

export interface ProjectileConfig {
  readonly muzzleVelocity: number;
  /** Effective gravity applied to the projectile; tuned for gameplay. */
  readonly gravity: number;
  readonly maxDistance: number;
  /** Linear velocity decay (1/s). 0 disables drag. */
  readonly drag: number;
  /**
   * Optional number of zombies one round passes through, each taking full
   * damage, before it stops; absent stops at the first. Walls and other
   * targets always stop it.
   */
  readonly maxTargets?: number;
}

export interface WeaponAudioConfig {
  readonly volume: number;
  readonly duration: number;
  readonly lowpass: number;
  readonly thump: number;
  /** Optional supersonic crack layer (volume) for full-power rifle rounds. */
  readonly crack?: number;
  /** Optional room echo tail in seconds; absent keeps the dry report. */
  readonly tail?: number;
  /** Optional volume of the reciprocating carrier slamming home after each shot. */
  readonly mechanism?: number;
  /**
   * Optional MP3 in `public/assets/audio/` that replaces the procedural
   * report once decoded, played at `volume`; a missing file keeps the
   * procedural shot.
   */
  readonly sampleFile?: string;
  /** Optional subtle pitch and gain jitter per shot of `sampleFile`; omitted plays it verbatim. */
  readonly variation?: ShotVariation;
  /**
   * Energy weapons get a sci-fi synth shot instead of a powder report; the
   * value picks the voice: the Ray Gun's warbling zap or the arc weapon's.
   */
  readonly energy?: 'raygun' | 'arc';
}

/** Behaviour of an energy projectile weapon (Ray Gun). Zombies mode only. */
export interface EnergyWeaponConfig {
  /** Visible projectile travel speed, m/s. Deliberately slow enough to see. */
  readonly projectileSpeed: number;
  /** Splash damage radius in meters. */
  readonly splashRadius: number;
  /** Splash damage at the epicenter; falls off linearly to 0 at the edge. */
  readonly splashDamage: number;
  /** Emissive / VFX color of the energy bolt. */
  readonly color: number;
}

/**
 * Continuous flame stream (ФАКЕЛ-33), Zombies mode only: every shot is one
 * tick of the stream, which scorches every zombie in its cone and sets it
 * burning for a while after it leaves the fire.
 */
export interface FlameWeaponConfig {
  /** Reach of the stream in metres; walls cut it short. */
  readonly range: number;
  /** Half angle of the scorching cone, radians. */
  readonly coneHalfAngle: number;
  /** Zombies one tick can scorch, nearest first. */
  readonly maxTargets: number;
  /** Seconds a zombie keeps burning once out of the stream. */
  readonly burnSeconds: number;
  /** Burn damage per second while it lasts. */
  readonly burnDamagePerSecond: number;
}

export type MagazineStyle = 'straight' | 'curved' | 'box' | 'internal' | 'drum';
/**
 * irons: classic post+notch. scope: telescopic sight (L96). reddot: a
 * compact reflex sight whose emissive dot sits exactly on the sight line,
 * so ADS aligns the dot with the true shot center for free.
 */
export type OpticStyle = 'irons' | 'scope' | 'reddot';

/**
 * Reload choreography per weapon. All times are fractions of reloadTime
 * (0..1), so retuning the reload duration never desyncs the animation.
 * Phases: the magazine detaches (magOut), is released to gravity (magDrop),
 * a fresh one rises (magIn) and seats (magSeat), then the action is worked
 * (charge→chargeEnd). Belt-fed guns add cover open/close around the swap.
 * A 'canister' is never dropped: the support hand unscrews it, carries it off
 * screen to refill it and screws it back on between magDrop and magIn.
 * 'drum' swaps the PPSh magazine and cocks its open bolt onto the rear sear.
 * 'crystal' opens a cage (the cover part), lifts the spent core crystal out,
 * seats a fresh one, locks the cage and re-energises the core on every
 * reload, tactical or empty.
 */
export type ReloadStyle = 'rifle' | 'rock' | 'belt' | 'bolt' | 'cell' | 'canister' | 'pistol' | 'drum' | 'crystal';

/**
 * Whole-weapon pose layered on the view model during a reload stage:
 * a camera-space offset in meters and yaw/roll/tilt in radians (positive
 * yaw turns the muzzle left and the left flank to the eye, negative roll
 * tips the top outboard, positive tilt raises the muzzle).
 */
export interface ReloadPoseConfig {
  readonly shift: readonly [number, number, number];
  readonly yaw: number;
  readonly roll: number;
  readonly tilt: number;
}

export interface ReloadAnimConfig {
  readonly style: ReloadStyle;
  readonly magOut: number;
  readonly magDrop: number;
  readonly magIn: number;
  readonly magSeat: number;
  /** Action/charging-handle window; set charge < 0 to skip (cell style). */
  readonly charge: number;
  readonly chargeEnd: number;
  /** Belt-fed only: feed-cover open/close fractions (the cover slams shut at coverClose). */
  readonly coverOpen?: number;
  readonly coverClose?: number;
  /**
   * Showcase pose held while the magazine (and belt) is swapped: the
   * weapon comes up towards the screen center with the swap turned to
   * the eye. It arrives with a touch of overshoot and leaves at magSeat
   * (coverClose for belt-fed weapons).
   */
  readonly swapPose: ReloadPoseConfig;
  /** Pose while the action is worked on an empty reload, showing the handle or bolt. */
  readonly rackPose?: ReloadPoseConfig;
  /**
   * Detachable magazines (pistol, rifle, rock, drum): share of the magazine length
   * inside the well when seated. It sets how far the old one travels to
   * hang clear and where the fresh one is lined up before going in.
   */
  readonly wellDepth?: number;
  /** Procedural magazine dimensions [w, h, d] in meters and color. */
  readonly magSize: readonly [number, number, number];
  readonly magColor: number;
  /** Optional local-space magazine pose for a single-mesh GLB weapon. */
  readonly magAnchor?: readonly [number, number, number];
  readonly magRotation?: readonly [number, number, number];
}

/** Events the ReloadAnimator emits as thresholds are crossed. */
export type ReloadPhase =
  | 'magOut'
  | 'magDrop'
  | 'magIn'
  | 'magSeat'
  | 'chargeStart'
  | 'chargeEnd'
  | 'coverOpen'
  | 'coverClose';

/** Spring parameters of the purely-visual recoil layer (view model only). */
export interface VisualRecoilConfig {
  /** Backward translation impulse, m/s. */
  readonly kickImpulse: number;
  /** Upward pitch impulse, rad/s. */
  readonly pitchImpulse: number;
  /** Roll impulse, rad/s, random direction per shot. */
  readonly rollImpulse: number;
  /** Spring stiffness (return speed). */
  readonly stiffness: number;
  /** Spring damping (oscillation control). */
  readonly damping: number;
}

/** Finger pose presets of the first-person hands (see HandPoses.ts). */
export type HandPoseId =
  | 'fist'
  | 'pistolGrip'
  | 'rifleGrip'
  | 'stockGrip'
  | 'handleGrip'
  | 'supportHandguard'
  | 'supportPistol'
  | 'magazineGrab'
  | 'supportMagwell'
  | 'boltPinch'
  | 'relaxed'
  | 'openHand';

type Vec3 = readonly [number, number, number];

/**
 * Where a hand holds a part. `position` is the center of the held part;
 * `axis` is the hand's thumb side (along the part, give or take the tilt of
 * a natural wrist) and `palm` is the direction the palm faces. Together they
 * fix the hand rotation (palm is orthogonalized).
 */
export interface HandGripConfig {
  readonly position: Vec3;
  readonly axis: Vec3;
  readonly palm: Vec3;
  readonly pose: HandPoseId;
  /**
   * Section of the held part (width across the palm, depth along the
   * fingers) and its long axis: the palm sits flush on it and the pose's
   * wrapping fingers close around it.
   */
  readonly hold?: { readonly size: readonly [number, number]; readonly axis: Vec3 };
  /** Trigger face the index finger rests on, in the same space as `position`. */
  readonly trigger?: Vec3;
}

/**
 * First-person hands on a weapon, in the weapon root's local space. The
 * forearm continues each hand, so a grip's rotation also sets its arm.
 */
export interface WeaponHandsConfig {
  readonly right: HandGripConfig;
  /** Absent for one-handed weapons: the left arm stays hidden. */
  readonly left?: HandGripConfig;
  /** Hand that works the charging handle / bolt / slide. Default right. */
  readonly actionHand?: 'left' | 'right';
  /** Grip on the reload handle part, in that part's local space. */
  readonly action?: HandGripConfig;
  /**
   * Left-hand grip on the magazine part, in its local space; without it the
   * support hand does not ride the magazine during a reload. Box magazines
   * are cupped under the baseplate so the whole tube shows above the hand.
   */
  readonly magazine?: HandGripConfig;
}

/** Drives the view model: GLB when available, procedural fallback otherwise. */
export interface ViewModelConfig {
  // --- GLB model (optional; procedural fallback when missing/failed) ---
  readonly modelUrl?: string;
  /** Real-world weapon length in meters; the GLB is uniformly normalized to it. */
  readonly modelLength?: number;
  /** Yaw fix so the model faces -Z (camera forward). */
  readonly modelYaw?: number;

  // --- First-person placement ---
  /** Hip-fire position relative to the camera. */
  readonly hip: readonly [number, number, number];
  /**
   * ADS position. For GLB weapons, [1] is a trim added to the sight line
   * derived from the model bounds; for procedural ones it is absolute.
   */
  readonly ads: readonly [number, number, number];
  /** Mouse sway multiplier (1 = default). */
  readonly sway: number;
  /** Movement bob multiplier (1 = default). */
  readonly bob: number;
  readonly visualRecoil: VisualRecoilConfig;

  // --- Procedural fallback builder ---
  readonly scale: number;
  readonly bodyColor: number;
  readonly accentColor: number;
  readonly barrelLength: number;
  readonly barrelRadius: number;
  readonly receiverLength: number;
  readonly stockLength: number;
  readonly magazine: MagazineStyle;
  readonly optic: OpticStyle;
  /** Height of the sight line above the receiver center; ADS aligns it to screen center. */
  readonly sightHeight: number;
  /** Overall chunkiness multiplier. */
  readonly bulk: number;
  /** When set, the dedicated Ray Gun procedural builder is used with this glow color. */
  readonly energyColor?: number;
  /**
   * 'pistol' uses the handgun builder (slide, hammer, grip magazine);
   * 'lmg' uses the dedicated M60 builder (belt pouch, feed cover, bipod);
   * 'ak47' uses the dedicated Type-3 AK builder (milled receiver, lacquered
   * wood, gas tube, curved magazine); 'l96' uses the dedicated L96A1 builder (thumbhole
   * stock, scope, liftable bolt); 'mp5' uses the MP5A3 builder (drum sight,
   * cocking tube, retractable stock); 'vector' uses the KRISS Vector builder
   * ("Super V" lower, full rail, folding sights); 'ppsh41' uses the wooden
   * stock, perforated jacket and drum-fed PPSh-41; 'barrett' builds the heavy
   * semiautomatic .50 rifle with a ventilated shroud and muzzle brake; 'fakel' builds the
   * ФАКЕЛ-33 flamethrower (caged red core crystal, fuel tank, petal nozzle). Default: generic long gun.
   */
  readonly frame?: 'pistol' | 'lmg' | 'ak47' | 'm4a1' | 'l96' | 'barrett' | 'mp5' | 'vector' | 'ppsh41' | 'fakel';
  /** 'tesla' uses the dedicated ZEUS-77 builder (coils, capacitor fins, fork emitter). */
  readonly teslaFrame?: 'tesla';
  /** Reload choreography; absence keeps the legacy generic dip. */
  readonly reloadAnim?: ReloadAnimConfig;
  /** First-person hand anchors. */
  readonly hands: WeaponHandsConfig;
}

export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly name: string;
  readonly fireModes: readonly FireMode[];
  readonly defaultFireMode: FireMode;
  readonly rpm: number;
  readonly magazineSize: number;
  /**
   * Starting reserve ammunition. Absent means a bottomless reserve; Zombies
   * supplies finite mode-specific pools that reloads draw from.
   */
  readonly reserveAmmo?: number;
  /** Empty reload duration, including the weapon action. */
  readonly reloadTime: number;
  /** Faster reload that preserves the chambered round and skips the action. */
  readonly tacticalReloadTime: number;
  readonly boltAction: boolean;
  readonly boltCycleTime: number;
  readonly scoped: boolean;
  /** Base torso damage per hit (zombies mode). */
  readonly damage: number;
  /** Energy projectile behaviour; absence means classic ballistics. */
  readonly energy?: EnergyWeaponConfig;
  /** Continuous flame stream the mode resolves itself, instead of ballistics. */
  readonly flame?: FlameWeaponConfig;
  readonly recoil: RecoilConfig;
  readonly spread: SpreadConfig;
  /** Full-auto barrel overheating; absence means the barrel never heats. */
  readonly heat?: BarrelHeatConfig;
  readonly muzzleSmoke?: MuzzleSmokeConfig;
  readonly muzzleFlash?: MuzzleFlashConfig;
  /** World-space spent case; absent keeps the standard small brass casing. */
  readonly shellCasing?: ShellCasingProfile;
  readonly ads: AdsConfig;
  readonly projectile: ProjectileConfig;
  readonly moveSpeedMultiplier: number;
  readonly equipTime: number;
  readonly audio: WeaponAudioConfig;
  readonly view: ViewModelConfig;
}

export type WeaponEventType =
  | 'shot'
  | 'dryFire'
  | 'overheated'
  | 'heatWarning'
  | 'cooledDown'
  | 'reloadStart'
  | 'reloadEnd'
  | 'boltStart'
  | 'boltEnd'
  | 'fireModeChanged';

export interface WeaponEvent {
  readonly type: WeaponEventType;
}

export interface WeaponFrameInput {
  readonly trigger: boolean;
  readonly ads: boolean;
  /** Mobile fire-button hold; desktop semi-auto remains edge-triggered. */
  readonly repeatSemiAuto?: boolean;
}
