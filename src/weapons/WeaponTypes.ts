export type WeaponId = 'm4a1' | 'ak47' | 'm60' | 'l96';

export type FireMode = 'auto' | 'semi';

export type WeaponState = 'ready' | 'reloading' | 'cycling' | 'equipping';

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
}

export type MagazineStyle = 'straight' | 'curved' | 'box' | 'internal';
export type OpticStyle = 'irons' | 'scope';

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
}

export interface WeaponDefinition {
  readonly id: WeaponId;
  readonly name: string;
  readonly fireModes: readonly FireMode[];
  readonly defaultFireMode: FireMode;
  readonly rpm: number;
  readonly magazineSize: number;
  readonly reloadTime: number;
  readonly boltAction: boolean;
  readonly boltCycleTime: number;
  readonly scoped: boolean;
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
}
