export type WeaponId = 'm4a1' | 'ak47' | 'm60' | 'l96' | 'raygun' | 'm1911' | 'tesla';

export type FireMode = 'auto' | 'semi';

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
}

export interface WeaponAudioConfig {
  readonly volume: number;
  readonly duration: number;
  readonly lowpass: number;
  readonly thump: number;
  /** Energy weapons get a sci-fi synth shot instead of a powder report. */
  readonly energy?: boolean;
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

export type MagazineStyle = 'straight' | 'curved' | 'box' | 'internal';
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
 */
export type ReloadStyle = 'rifle' | 'rock' | 'belt' | 'bolt' | 'cell' | 'pistol';

export interface ReloadAnimConfig {
  readonly style: ReloadStyle;
  readonly magOut: number;
  readonly magDrop: number;
  readonly magIn: number;
  readonly magSeat: number;
  /** Action/charging-handle window; set charge < 0 to skip (cell style). */
  readonly charge: number;
  readonly chargeEnd: number;
  /** Belt-fed only: feed-cover open/close fractions. */
  readonly coverOpen?: number;
  readonly coverClose?: number;
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
   * 'lmg' uses the dedicated M60 builder (belt box, feed cover, bipod).
   * Default: generic long gun.
   */
  readonly frame?: 'pistol' | 'lmg';
  /** 'tesla' uses the dedicated ZEUS-77 builder (coils, capacitor fins, fork emitter). */
  readonly teslaFrame?: 'tesla';
  /** Reload choreography; absence keeps the legacy generic dip. */
  readonly reloadAnim?: ReloadAnimConfig;
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
  /** Headshot damage multiplier (zombies mode). */
  readonly headshotMultiplier: number;
  /** Energy projectile behaviour; absence means classic ballistics. */
  readonly energy?: EnergyWeaponConfig;
  readonly recoil: RecoilConfig;
  readonly spread: SpreadConfig;
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
