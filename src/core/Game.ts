import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { AssetManager } from '../assets/AssetManager';
import { AudioSystem } from '../audio/AudioSystem';
import { MusicManager } from '../audio/MusicManager';
import { WEAPON_DEFINITIONS } from '../config/weapons';
import type { AutoQualityGovernor } from '../core/AutoQualityGovernor';
import { getDeviceProfile, type DeviceProfile } from '../core/DeviceProfile';
import { DynamicResolution } from '../core/DynamicResolution';
import { Stats } from '../game/Stats';
import { WeaponInventory } from '../game/WeaponInventory';
import type { GameMode } from '../modes/GameMode';
import { Input, LETHAL_INPUT_CODES } from '../player/Input';
import type { GamepadControls } from '../player/GamepadControls';
import { PlayerController } from '../player/PlayerController';
import { BarrelSmoke } from '../rendering/BarrelSmoke';
import { Effects } from '../rendering/Effects';
import { isFadeMaterial, setFadeBlending } from '../rendering/FadeMaterials';
import { advancedFeatures } from '../rendering/AdvancedRenderingFeatures';
import { LampShadows } from '../rendering/LampShadows';
import { hdrTextureType, PostProcessing } from '../rendering/PostProcessing';
import { ReflectionProbe } from '../rendering/ReflectionProbe';
import { applyEnvironmentSurfaceDetail, applySurfaceDetail, WEAPON_SURFACE_DETAIL } from '../rendering/SurfaceDetail';
import { BallisticsSystem } from '../shooting/BallisticsSystem';
import type { SurfaceType } from '../shooting/HitTarget';
import { HUD } from '../ui/HUD';
import { DeveloperConsole } from '../ui/DeveloperConsole';
import { DebugStats } from '../ui/DebugStats';
import { clamp } from '../utils/math';
import { Weapon } from '../weapons/Weapon';
import { MagazineDropPool } from '../weapons/MagazineDrop';
import type { ShellCasingProfile, WeaponId } from '../weapons/WeaponTypes';
import { WeaponView } from '../weapons/WeaponView';
import { ViewArms } from '../weapons/ViewArms';
import { PlayerFootsteps } from '../player/PlayerFootsteps';
import { footstepSurfacesUsed } from '../zombies/maps/FootstepSurfaces';
import { armDetailFor } from '../weapons/FirstPersonArm';
import { FLARE_LIGHT_COLOR, flareLightDecay } from '../weapons/MuzzleFlare';

interface ArsenalEntry {
  readonly weapon: Weapon;
  readonly view: WeaponView;
}

const MAX_DELTA = 0.05;
const FLASH_LIGHT_DECAY = 26;
/** Fast decay (~1–2 frames at 60 fps) so energy muzzle PointLights never saturate mobile/web GPUs. */
const ENERGY_FLASH_LIGHT_DECAY = 160;
/** A flame stream relights the muzzle light every tick; a slow decay turns that into a firelight flicker. */
const FLAME_LIGHT_DECAY = 9;
const FLAME_LIGHT = { color: 0xff7a2e, intensity: 11, ahead: 2.6 } as const;
/** Each tick of a flame stream rattles the view up or down a hair: the weapon fights the hands. */
const FLAME_RUMBLE = 0.0055;
const MAX_SPREAD_PIXELS = 130;
/** A driver that never reports its programs ready must not hold the loading screen. */
const SHADER_WARMUP_TIMEOUT_MS = 10000;
const UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_UP = new THREE.Vector3(1, 0, 0);

/**
 * Composition root: owns the renderer and the frame loop, and wires input,
 * player, weapons, ballistics, effects, audio and HUD together. Mode-specific
 * behavior (targets vs. zombies, energy projectiles, game over) lives in the
 * plugged GameMode; this shell stays mode-agnostic.
 */
export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly clock = new THREE.Clock();
  private readonly input: Input;
  private readonly player: PlayerController;
  private readonly ballistics: BallisticsSystem;
  private readonly effects: Effects;
  private readonly barrelSmoke: BarrelSmoke;
  private readonly audio: AudioSystem;
  private readonly footsteps: PlayerFootsteps;
  private readonly stats = new Stats();
  /** Every weapon the mode may use, preloaded once; the inventory picks slots. */
  private readonly arsenal = new Map<WeaponId, ArsenalEntry>();
  private inventory!: WeaponInventory;
  /** Empty firearm whose reload waits for the accepted melee to release the hands. */
  private meleeReloadWeapon: Weapon | null = null;
  private readonly magazineDrops: MagazineDropPool;
  /** First-person arms and hands shared by every weapon view and the knife. */
  private readonly viewArms: ViewArms;
  /** Map colliders + dynamic mode hitboxes (zombies). Mutated by the mode. */
  private readonly hitColliders: THREE.Object3D[] = [];
  private readonly flashLight = new THREE.PointLight(0xffc27a, 0, 12, 1.6);
  private flashLightDecay = FLASH_LIGHT_DECAY;
  /** A flame weapon drove the stream's audio loop last frame (it gets one last call to fall silent). */
  private flameStreamDriven = false;
  /** Scales the drawing buffer below the profile's pixel ratio while frames run slow. */
  private readonly dynamicResolution = new DynamicResolution();
  /** Top quality tier only: the HDR frame, the local reflections and the lamp shadows. */
  private readonly postProcessing: PostProcessing | null = null;
  private readonly reflectionProbe: ReflectionProbe | null = null;
  private readonly lampShadows: LampShadows | null = null;

  private readonly debugFromUrl = new URLSearchParams(window.location.search).has('debug');
  private debugStats: DebugStats | null = null;
  /**
   * Local menu state: true while this player is on the start screen or the
   * pause menu. In single player it also HALTS the simulation (the tick
   * renders the frozen frame and advances nothing). A mode with
   * `sharedSimulation` keeps simulating behind a local menu unless the mode's
   * authority has explicitly paused the shared match.
   */
  private paused = true;
  private controllerSession = false;
  /** Desktop lock requests only complete after the browser confirms the canvas. */
  private pointerLockRequested = false;
  private gameplayStarted = false;
  private disposed = false;
  private developerConsole: DeveloperConsole | null = null;

  /** Last applied viewport size in CSS pixels; also drives the spread math. */
  private viewportWidth = 1;
  private viewportHeight = 1;
  private resizeObserver: ResizeObserver | null = null;

  private readonly tmpOrigin = new THREE.Vector3();
  private readonly tmpDirection = new THREE.Vector3();
  private readonly tmpMuzzle = new THREE.Vector3();
  /** Reused tracer request of a forged firearm's shot: leaves the muzzle in the finish's colour. */
  private readonly shotTracer = { muzzle: this.tmpMuzzle, color: 0 };
  private readonly tmpEject = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly tmpObserver = new THREE.Vector3();
  private readonly spreadRight = new THREE.Vector3();
  private readonly spreadUp = new THREE.Vector3();
  /** Reused every frame to avoid per-frame allocations in the loop. */
  private readonly frameInput = { trigger: false, ads: false, repeatSemiAuto: false };

  constructor(
    private readonly container: HTMLElement,
    private readonly hud: HUD,
    private readonly assets: AssetManager,
    private readonly profile: DeviceProfile = getDeviceProfile(),
    private readonly mode: GameMode,
    music: MusicManager = new MusicManager(),
    private readonly onExitToMenu: () => void = () => undefined,
    gamepad?: GamepadControls,
    /** Automatic quality only: judges this match's frame rate for the next one. */
    private readonly qualityGovernor: AutoQualityGovernor | null = null,
  ) {
    this.audio = new AudioSystem(music);
    this.footsteps = new PlayerFootsteps(this.audio);
    const rendererOptions = {
      // The post-processed frame is antialiased in its own offscreen target.
      antialias: !this.profile.useReducedEffects && !this.profile.useAdvancedRendering,
      powerPreference: 'high-performance' as const,
      alpha: false,
      depth: true,
      stencil: false,
      precision: this.profile.isMobile ? 'mediump' : 'highp',
    };

    this.viewportWidth = container.clientWidth || window.innerWidth || 1;
    this.viewportHeight = container.clientHeight || window.innerHeight || 1;
    this.renderer = new THREE.WebGLRenderer(rendererOptions);
    this.player = new PlayerController(this.viewportWidth / this.viewportHeight);
    const features = advancedFeatures(window.location.search);
    if (this.profile.useAdvancedRendering) {
      this.postProcessing = new PostProcessing(this.renderer, this.scene, this.player.camera, features);
    }
    this.applyPixelRatio();
    // updateStyle=false everywhere: CSS owns the canvas box (100% of a
    // dvh-sized container), the renderer only owns the drawing buffer. An
    // inline px size here would freeze the arrangement of the first frame
    // and survive every later resize — exactly what cropped mobile viewports.
    this.renderer.setSize(this.viewportWidth, this.viewportHeight, false);
    this.renderer.shadowMap.enabled = !this.profile.useReducedEffects;
    this.renderer.shadowMap.type = this.profile.shadowQuality === 0 ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = !this.profile.useReducedEffects;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.profile.useReducedEffects ? 1.0 : 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // Image-based lighting from the built-in room environment: no download,
    // MIT-licensed, and enough to make metals and plastics read as PBR.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = this.profile.useReducedEffects ? 0.3 : 0.45;
    pmrem.dispose();

    this.input = new Input(this.renderer.domElement, this.profile, gamepad);
    this.scene.add(this.player.rig);

    this.effects = new Effects(this.scene);
    this.barrelSmoke = new BarrelSmoke(this.effects);
    this.magazineDrops = new MagazineDropPool(this.scene);
    this.viewArms = new ViewArms(armDetailFor(this.profile));
    this.player.camera.add(this.viewArms.root);

    // The ballistics layer raycasts against this shared, mutable array.
    // The mode registers its map and dynamic hitboxes during init.
    this.ballistics = new BallisticsSystem(this.hitColliders, this.scene);
    this.ballistics.onTargetHit = (target, distance, point, normal, object, shotWeapon) => {
      this.mode.onTargetHit(target, distance, point, normal, object, shotWeapon ?? this.currentWeapon);
    };
    this.ballistics.onEnvironmentHit = (point, normal, object) => {
      const surface = (object.userData.surface as SurfaceType | undefined) ?? 'dirt';
      this.effects.bulletHole(point, normal, object);
      switch (surface) {
        case 'metal':
          this.effects.spark(point, normal);
          this.audio.playImpact('metal');
          break;
        case 'wood':
          this.effects.puff(point, 0x8a6b42, 0.26);
          this.audio.playImpact('wood');
          break;
        case 'concrete':
          this.effects.puff(point, 0x9a968c, 0.3);
          this.audio.playImpact('concrete');
          break;
        default:
          this.effects.puff(point, 0x8f8265, 0.36);
          this.audio.playImpact('dirt');
          break;
      }
    };

    const definitions = this.mode.weaponDefinitions ?? WEAPON_DEFINITIONS;
    for (const id of this.mode.weaponIds) {
      // The mode decides the starting reserve. When it defines reserveAmmoFor, its return value
      // wins over the shared definition — see Weapon's reserveOverride.
      const weapon = this.mode.reserveAmmoFor
        ? new Weapon(definitions[id], Math.random, this.mode.reserveAmmoFor(id))
        : new Weapon(definitions[id]);
      const view = new WeaponView(weapon.definition, this.assets.getWeaponModel(id), this.magazineDrops,
        { cinematicFlash: this.profile.useAdvancedRendering });
      const reloadAnim = weapon.definition.view.reloadAnim;
      view.onReloadPhase = (phase) =>
        this.audio.playReloadPhase(
          phase,
          !!weapon.definition.audio.energy,
          reloadAnim?.style ?? 'rifle',
          reloadAnim ? (reloadAnim.chargeEnd - reloadAnim.charge) * weapon.definition.reloadTime * weapon.reloadTimeScale : 0,
        );
      if (weapon.definition.boltAction) view.onBoltEject = () => this.ejectShell(view, weapon.definition.shellCasing);
      if (this.profile.useAdvancedRendering) applySurfaceDetail(view.root, WEAPON_SURFACE_DETAIL);
      this.player.camera.add(view.root);
      this.arsenal.set(id, { weapon, view });
    }
    const starting = this.mode.startingInventory ?? this.mode.weaponIds;
    this.inventory = new WeaponInventory(starting, this.mode.maxWeapons ?? starting.length);
    this.entry(this.inventory.currentWeapon).view.root.visible = true;
    this.scene.add(this.flashLight);

    // Touch-only weapon swap button (mobile keyboards have no 1–5 row).
    this.input.onWeaponSwap = () => this.cycleWeapon();

    this.mode.init({
      scene: this.scene,
      player: this.player,
      input: this.input,
      hud: this.hud,
      audio: this.audio,
      effects: this.effects,
      stats: this.stats,
      assets: this.assets,
      profile: this.profile,
      hitColliders: this.hitColliders,
      handRings: this.viewArms.rings,
      lockPointer: () => this.start(),
      unlockPointer: () => document.exitPointerLock(),
      grantWeapon: (id, replacePinned) => this.grantWeapon(id, replacePinned),
      canGrantWeapon: (id) => this.arsenal.has(id),
      hasWeapon: (id) => this.inventory.owns(id),
      canStoreWeapon: (id) => this.inventory.canStore(id),
      storeWeapon: (id) => this.storeWeapon(id),
      retrieveStoredWeapon: () => this.retrieveStoredWeapon(),
      getEquippedWeaponId: () => this.inventory.currentWeapon,
      getEquippedWeapon: () => this.currentWeapon,
      getMuzzleWorldPosition: (out) => this.currentView.getMuzzleWorldPosition(out),
      canRefillWeaponAmmo: (id) => {
        const entry = this.arsenal.get(id);
        return this.inventory.has(id) && !!entry && !entry.weapon.isAmmoFull;
      },
      refillWeaponAmmo: (id) => {
        const entry = this.arsenal.get(id);
        return this.inventory.has(id) && !!entry && entry.weapon.refillAmmo();
      },
      canRefillEquippedWeaponAmmo: () => !this.currentWeapon.isAmmoFull,
      refillEquippedWeaponAmmo: () => this.currentWeapon.refillAmmo(),
      setWeaponInfiniteReserve: (id) => {
        const entry = this.arsenal.get(id);
        if (!entry) return false;
        entry.weapon.setInfiniteReserve();
        this.inventory.pin(id);
        return true;
      },
      setWeaponFinish: (id, finish) => this.arsenal.get(id)?.view.setFinish(finish, this.profile.useReducedEffects),
      setWeaponCapacityScale: (id, scale) => this.arsenal.get(id)?.weapon.setCapacityScale(scale),
      setReloadTimeScale: (scale) => {
        for (const entry of this.arsenal.values()) entry.weapon.reloadTimeScale = scale;
      },
      setFireRateScale: (scale) => {
        for (const entry of this.arsenal.values()) entry.weapon.fireRateScale = scale;
      },
      resetArsenal: () => this.resetArsenal(),
      returnToMainMenu: () => this.returnToMainMenu(),
      setDebugStatsEnabled: (enabled) => this.setDebugStatsEnabled(enabled),
    });
    const footstepSurfaces = this.mode.getFootstepSurfaces?.() ?? null;
    this.footsteps.setSurfaces(footstepSurfaces);
    this.audio.preloadFootsteps(footstepSurfacesUsed(footstepSurfaces));
    applyEnvironmentSurfaceDetail(this.scene, this.profile.useAdvancedRendering);
    if (this.profile.useAdvancedRendering && features.reflections) {
      this.reflectionProbe = new ReflectionProbe(this.renderer, this.scene, this.player.rig, [this.flashLight], hdrTextureType(this.renderer));
    }
    if (this.profile.useAdvancedRendering && features.shadows) {
      this.lampShadows = new LampShadows(this.scene, new Set([this.flashLight]));
      // Before the shader warm-up, which compiles for the lights casting then.
      this.lampShadows.update(0, this.player.camera.getWorldPosition(this.tmpObserver));
    }

    this.input.onLockChange = (locked) => this.handlePointerLockChange(locked);
    this.input.onKeyInput = (key) => {
      if (this.gameplayStarted && !this.paused) this.mode.onKeyInput?.(key);
    };
    this.hud.setStartHandler(() => this.start());

    // Pause wiring. Desktop: ESC toggles (the pointer-lock release opens the
    // menu via onLockChange; a keydown ESC while unlocked resumes). Mobile:
    // the touch pause button. The menu buttons drive resume/restart/menu.
    this.input.onPauseRequest = () => {
      if (this.paused) this.resume();
      else this.pause();
    };
    this.input.onControllerUnavailable = () => {
      if (this.controllerSession && !this.input.pointerLocked && !this.profile.useTouchControls
        && this.gameplayStarted && !this.mode.onPointerUnlock?.()) this.pause();
    };
    this.input.onFocusLost = () => {
      if (this.gameplayStarted && !this.mode.onPointerUnlock?.()) this.pause();
    };
    this.input.onPointerLockRequest = () => {
      if (this.controllerSession && !this.paused) this.start();
    };
    this.hud.setPauseHandlers({
      onResume: () => this.resume(),
      onRestart: () => this.restartRun(),
      onMainMenu: () => this.returnToMainMenu(),
    });
    this.hud.setGameOverHandlers({
      onRestart: () => this.restartRun(),
      onMainMenu: () => this.returnToMainMenu(),
    });
    // ESC to resume while the menu is open and the pointer is unlocked.
    document.addEventListener('keydown', this.handleEscapeKey);

    if (this.mode.executeDeveloperCommand) {
      this.developerConsole = new DeveloperConsole({
        canOpen: () => this.gameplayStarted && !this.paused
          && !!this.mode.isDeveloperConsoleEnabled?.(),
        execute: (line) => this.mode.executeDeveloperCommand!(line),
        onOpen: () => {
          this.input.releaseAll();
          this.pause();
          this.hud.hidePauseMenu();
        },
        onClose: () => {
          this.input.releaseAll();
          this.resume();
        },
      });
    }

    if (this.debugFromUrl) this.setDebugStatsEnabled(true);

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    // orientationchange fires before the layout settles on several mobile
    // browsers, and the URL bar collapsing resizes the container without any
    // window event at all. Observing the container itself catches every case.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.handleResize);
      this.resizeObserver.observe(container);
    }
    window.visualViewport?.addEventListener('resize', this.handleResize);
  }

  /**
   * Warms the GPU behind the loading screen, then starts the frame loop.
   * Every material is compiled (hidden weapons and pooled zombies included),
   * their textures are uploaded and one frame is drawn so the shadow maps
   * exist; otherwise all that work lands on the first visible frames.
   */
  public async prepare(): Promise<void> {
    const camera = this.player.camera;
    const compile = (): Promise<unknown> => {
      // Programs depend on the target bound when they are requested.
      this.renderer.setRenderTarget(this.postProcessing?.sceneTarget ?? null);
      const compiled = this.renderer.compileAsync(this.scene, camera).catch(() => undefined);
      this.renderer.setRenderTarget(null);
      return Promise.race([compiled, new Promise((resolve) => setTimeout(resolve, SHADER_WARMUP_TIMEOUT_MS))]);
    };
    // Rings start off the hand; show them for the compile so wearing one never stalls.
    this.viewArms.rings.setWarmup(true);
    await compile();
    this.viewArms.rings.setWarmup(false);
    if (this.disposed) return;
    this.reflectionProbe?.capture(camera.getWorldPosition(this.tmpObserver));
    const textures = new Set<THREE.Texture>();
    const fadeMaterials = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      for (const entry of Array.isArray(material) ? material : material ? [material] : []) {
        if (isFadeMaterial(entry)) fadeMaterials.add(entry);
        for (const value of Object.values(entry)) {
          if ((value as THREE.Texture | null)?.isTexture) textures.add(value as THREE.Texture);
        }
      }
    });
    // The blended variant is first used mid-game, when a corpse fades out.
    if (fadeMaterials.size > 0) {
      for (const material of fadeMaterials) setFadeBlending(material, true);
      await compile();
      for (const material of fadeMaterials) setFadeBlending(material, false);
      if (this.disposed) return;
    }
    for (const texture of textures) this.renderer.initTexture(texture);
    // The ready frame is frozen until play starts: grip the weapon now, or the
    // unposed arms float in front of the camera.
    this.viewArms.update(0, this.currentView, null);
    this.present(camera);
    this.renderer.setAnimationLoop(this.tick);
  }

  /** Starts/resumes through the current device, requesting a real lock only for desktop mouse. */
  start(): void {
    if (
      this.profile.isMobile &&
      !document.fullscreenElement &&
      typeof document.documentElement.requestFullscreen === 'function'
    ) {
      try {
        void document.documentElement.requestFullscreen().catch(() => undefined);
      } catch {}
    }
    this.audio.resume();
    void this.audio.loadMysteryBoxOpenAsset();
    void this.audio.loadDryFireAsset();
    for (const { weapon } of this.arsenal.values()) this.audio.preloadShotSample(weapon.definition.audio);
    void this.audio.loadDoorPurchaseAsset();
    void this.audio.loadBarricadeRepairAsset();
    if (this.profile.useTouchControls || (this.input.usingGamepad && this.input.gamepadConnected)) {
      this.controllerSession = this.input.usingGamepad && this.input.gamepadConnected;
      this.pointerLockRequested = false;
      this.input.suppressGamepad();
      this.beginGameplay();
      return;
    }
    if (this.gameplayStarted) {
      this.paused = true;
      this.hud.showPauseMenu();
    }
    this.pointerLockRequested = true;
    this.input.requestPointerLock();
  }

  private beginGameplay(): void {
    this.gameplayStarted = true;
    this.paused = false;
    this.mode?.onLocalPauseChanged?.(false);
    this.mode?.onGameplayStarted?.();
    this.audio.music.stopMenuLoop();
    this.audio.resumeMusic();
    this.audio.setAmbienceSuspended(false);
    this.startGameplayMusic();
    this.hud.hidePauseMenu();
    this.hud.fadeOutStartScreen();
    this.hud.setHudVisible(true);
  }

  private handlePointerLockChange(locked: boolean): void {
    if (this.profile.useTouchControls) return;

    if (locked) {
      if (!this.pointerLockRequested) {
        // A repeated lock notification while already playing is harmless;
        // forcing an unlock here re-opened the pause menu in a loop.
        if (!this.paused) return;
        // Never accept a delayed/unexpected lock behind a pause or mode menu.
        document.exitPointerLock();
        return;
      }
      this.pointerLockRequested = false;
      this.controllerSession = false;
      this.beginGameplay();
      return;
    }

    // While a request is pending, an older unlock notification may still be
    // delivered. Current browser truth remains unlocked, so keep the overlay
    // and wait for either a fresh lock or another user-gesture retry.
    if (this.pointerLockRequested) return;
    if (!this.gameplayStarted) return;
    // A mode with its own overlay (game over) suppresses the pause screen.
    if (this.mode.onPointerUnlock?.()) return;
    // ESC, Alt+Tab, tab changes and focus loss all converge here, based on
    // document.pointerLockElement as reported by DesktopInput.
    if (!this.paused) this.pause();
  }

  /** The map's gameplay bed, which the mode exposes once its arena exists. */
  private startGameplayMusic(): void {
    const track = this.mode?.gameplayMusic;
    if (track) this.audio.music.startGameplayLoop(track);
  }

  /**
   * Pause/resume. Pausing opens the local menu and releases the pointer on
   * desktop; in single player it also halts the simulation. Resuming re-locks
   * and continues from the exact same state.
   */
  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.input.suppressGamepad();
    this.mode.onLocalPauseChanged?.(true);
    // The frozen frame stops driving the stream, so its roar must stop here.
    if (this.flameStreamDriven) this.audio.setFlameStream(false, 0);
    this.audio.pauseMusic();
    this.audio.setAmbienceSuspended(true);
    if (this.mode.id === 'zombies') this.audio.music.startMenuLoop();
    this.hud.showPauseMenu();
    // Release the pointer so the cursor can click the menu (desktop).
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private resume(): void {
    if (!this.paused) return;
    // Keep the simulation and overlay paused until pointerlockchange confirms
    // the canvas. A rejected request therefore remains recoverable by click.
    this.start();
  }

  private restartRun(): void {
    this.audio.stopMusic();
    // The mode owns its run state; restart() re-arms health, rounds, kills,
    // economy and re-locks the pointer. Modes without run state still relock.
    if (this.mode.onRestartRequested) this.mode.onRestartRequested();
    else this.start();
  }

  private returnToMainMenu(): void {
    if (this.disposed) return;
    this.mode.onExit?.();
    this.paused = true;
    this.gameplayStarted = false;
    this.pointerLockRequested = false;
    this.audio.stopMusic();
    this.audio.music.startMenuLoop();
    this.hud.hideEnding();
    this.hud.hideGameOver();
    this.hud.hidePauseMenu();
    this.hud.setHudVisible(false);
    this.hud.setZombiesPanelVisible(false);
    this.hud.setInteractionPrompt(null);
    this.dispose();
    this.onExitToMenu();
  }

  /**
   * Releases everything this run registered outside its own object graph:
   * the frame loop, DOM/window listeners, the WebGL context, the canvas and
   * the AudioContext. A later Game starts from a clean page, no reload needed.
   */
  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.developerConsole?.dispose();
    this.input.dispose();
    document.removeEventListener('keydown', this.handleEscapeKey);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    window.visualViewport?.removeEventListener('resize', this.handleResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.debugStats?.dispose();
    this.debugStats = null;
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.dispose();
    this.lampShadows?.dispose();
    this.reflectionProbe?.dispose();
    this.postProcessing?.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private readonly handleEscapeKey = (event: KeyboardEvent): void => {
    // The settings dialog closes itself on ESC; the match stays paused behind it.
    if (this.hud.settingsOpen || document.querySelector('dialog[open]')) return;
    if (event.code === 'Escape' && this.controllerSession && !this.paused && !this.input.blockingMenu) {
      this.pause();
      return;
    }
    if (event.code === 'Escape' && this.paused && this.gameplayStarted) this.resume();
  };

  /** Arsenal lookup; every WeaponId the modes reference is preloaded. */
  private entry(id: WeaponId): ArsenalEntry {
    const entry = this.arsenal.get(id);
    if (!entry) throw new Error(`Weapon "${id}" is not preloaded in mode "${this.mode.id}"`);
    return entry;
  }

  private get currentWeapon(): Weapon {
    return this.entry(this.inventory.currentWeapon).weapon;
  }

  private get currentView(): WeaponView {
    return this.entry(this.inventory.currentWeapon).view;
  }

  private readonly handleResize = (): void => {
    // The container is the single source of truth: it is laid out in dvh, so
    // it already excludes the browser chrome, and unlike visualViewport it
    // does not shrink with pinch zoom or the on-screen keyboard.
    const width = this.container.clientWidth || window.innerWidth || 1;
    const height = this.container.clientHeight || window.innerHeight || 1;
    if (width === this.viewportWidth && height === this.viewportHeight) return;
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.applyPixelRatio();
    this.renderer.setSize(width, height, false);
    this.player.resize(width / height);
  };

  /** Applies the viewport size and the dynamic resolution to every drawing buffer. */
  private applyPixelRatio(): void {
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, this.profile.pixelRatioLimit);
    const pixelRatio = devicePixelRatio * this.dynamicResolution.scale;
    this.renderer.setPixelRatio(pixelRatio);
    this.postProcessing?.setResolution(this.viewportWidth, this.viewportHeight, pixelRatio);
  }

  /** Top quality tier: follows the observer with the lamp shadows and the local reflections. */
  private updateAdvancedLighting(dt: number, camera: THREE.Camera): void {
    if (!this.lampShadows && !this.reflectionProbe) return;
    camera.getWorldPosition(this.tmpObserver);
    this.lampShadows?.update(dt, this.tmpObserver);
    this.reflectionProbe?.update(dt, this.tmpObserver);
  }

  /** Draws the frame, post-processed on the top quality tier. */
  private present(camera: THREE.Camera): void {
    if (this.postProcessing) this.postProcessing.render(camera);
    else this.renderer.render(this.scene, camera);
  }

  private switchWeapon(index: number): void {
    const previousId = this.inventory.currentWeapon;
    const nextId = this.inventory.switchTo(index);
    if (!nextId) return;
    this.presentSelection(previousId);
  }

  /** Puts `previousId` away and raises the weapon now selected. */
  private presentSelection(previousId: WeaponId): void {
    const previous = this.entry(previousId);
    previous.weapon.equip();
    previous.view.reset();
    previous.view.root.visible = false;
    this.currentView.root.visible = true;
    this.currentWeapon.equip();
  }

  /** Leaves `id` at a machine: out of the inventory, its ammunition kept, the other weapon raised. */
  private storeWeapon(id: WeaponId): boolean {
    const previousId = this.inventory.currentWeapon;
    if (!this.inventory.store(id)) return false;
    if (previousId === id) this.presentSelection(id);
    return true;
  }

  /** Takes the stored weapon back into its slot, raised as it was left. */
  private retrieveStoredWeapon(): WeaponId | null {
    const previousId = this.inventory.currentWeapon;
    const id = this.inventory.restore();
    if (id) this.presentSelection(previousId);
    return id;
  }

  /** Cycles to the next carried weapon for touch and controller actions. */
  private cycleWeapon(): void {
    const count = this.inventory.weapons.length;
    if (count < 2) return;
    this.switchWeapon((this.inventory.currentIndex + 1) % count);
  }

  /**
   * Weapon pickup/purchase: the weapon enters the inventory (slot cap rules
   * live in WeaponInventory), arrives with fresh ammo, and is equipped.
   */
  private grantWeapon(id: WeaponId, replacePinned = false): boolean {
    const entry = this.arsenal.get(id);
    // A weapon stored at a machine is still owned: never a second copy.
    if (!entry || this.inventory.storedWeapon === id) return false;
    const previousId = this.inventory.currentWeapon;
    const { equipped } = this.inventory.grant(id, replacePinned);
    const equippedEntry = this.entry(equipped);
    if (equipped === id) {
      const keepInfiniteReserve = equippedEntry.weapon.reserveAmmo === null && this.inventory.isPinned(id);
      equippedEntry.weapon.resetAmmo();
      if (keepInfiniteReserve) equippedEntry.weapon.setInfiniteReserve();
    }
    if (previousId !== equipped) {
      const previous = this.entry(previousId);
      previous.weapon.equip();
      previous.view.reset();
      previous.view.root.visible = false;
    }
    equippedEntry.view.reset();
    equippedEntry.view.root.visible = true;
    equippedEntry.weapon.equip();
    return true;
  }

  /** Zombies restart: starting loadout, every weapon back to full ammo. */
  private resetArsenal(): void {
    this.inventory.reset(this.mode.startingInventory ?? this.mode.weaponIds);
    for (const entry of this.arsenal.values()) {
      entry.weapon.setCapacityScale(1);
      entry.weapon.resetAmmo();
      entry.view.reset();
      entry.view.setFinish(null);
      entry.view.root.visible = false;
    }
    this.magazineDrops.clear();
    this.currentView.root.visible = true;
    this.currentWeapon.equip();
  }

  private applyCone(direction: THREE.Vector3, spread: number): void {
    if (spread <= 0) return;
    const radius = spread * Math.sqrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const up = Math.abs(direction.y) < 0.99 ? UP : FALLBACK_UP;
    this.spreadRight.crossVectors(direction, up).normalize();
    this.spreadUp.crossVectors(this.spreadRight, direction);
    direction
      .addScaledVector(this.spreadRight, Math.cos(theta) * radius)
      .addScaledVector(this.spreadUp, Math.sin(theta) * radius)
      .normalize();
  }

  private handleShot(spread: number): void {
    const weapon = this.currentWeapon;
    const view = this.currentView;
    const energy = weapon.definition.energy;
    const flame = weapon.definition.flame;
    this.stats.registerShot();

    this.player.camera.getWorldPosition(this.tmpOrigin);
    this.player.camera.getWorldDirection(this.tmpDirection);
    this.applyCone(this.tmpDirection, spread);

    view.getMuzzleWorldPosition(this.tmpMuzzle);
    // A forged firearm's round streaks from the muzzle; others keep the plain tracer.
    const firearmLook = view.firearmLook;
    const energyColor = view.energyLook?.color ?? energy?.color;
    // Energy weapons fire visible bolts handled by the mode; everything
    // else goes through the classic ballistic simulation.
    const handledByMode = this.mode.onWeaponFired?.(weapon, this.tmpOrigin, this.tmpDirection);
    if (!handledByMode) {
      if (firearmLook) this.shotTracer.color = firearmLook.tracer;
      this.ballistics.spawn(this.tmpOrigin, this.tmpDirection, weapon.definition.projectile, weapon,
        firearmLook ? this.shotTracer : null);
    }

    // A flame stream roars on its own loop (setFlameStream) instead of a report per tick.
    if (!flame) this.audio.playShot(weapon.definition.audio, weapon.fireMode);
    const { cameraJolt, playerPush } = weapon.definition.recoil;
    if (cameraJolt) this.player.playShotImpulse(cameraJolt);
    if (playerPush) this.player.applyShotPush(playerPush);
    view.onShot(weapon.fireMode === 'auto');
    this.flashLight.position.copy(this.tmpMuzzle);
    if (flame) {
      // The scene's single muzzle light becomes the stream's firelight, out where the fire
      // burns so it lights the room ahead; no shells, no powder smoke.
      this.player.camera.getWorldDirection(this.tmpRight);
      this.flashLight.position.addScaledVector(this.tmpRight, FLAME_LIGHT.ahead);
      this.player.playViewImpulse((Math.random() * 2 - 1) * FLAME_RUMBLE);
      this.flashLight.color.setHex(FLAME_LIGHT.color);
      this.flashLight.intensity = FLAME_LIGHT.intensity * (0.75 + Math.random() * 0.5);
      this.flashLightDecay = FLAME_LIGHT_DECAY;
      return;
    }
    const flare = this.profile.useAdvancedRendering ? weapon.definition.muzzleFlare : undefined;
    if (flare) {
      // A pulse as short as the flame: the HDR frame does not clamp a lingering glow.
      this.flashLight.color.setHex(firearmLook?.light ?? FLARE_LIGHT_COLOR);
      this.flashLight.intensity = flare.light * (0.85 + Math.random() * 0.3);
      this.flashLightDecay = flareLightDecay(flare.duration);
    } else {
      this.flashLight.color.setHex(energyColor ?? firearmLook?.light ?? 0xffc27a);
      this.flashLight.intensity = energy ? 10 : (weapon.definition.muzzleFlash?.lightIntensity ?? 9);
      this.flashLightDecay = energy ? ENERGY_FLASH_LIGHT_DECAY : FLASH_LIGHT_DECAY;
    }

    if (energy) {
      this.player.playViewImpulse(0.014);
      this.effects.puff(this.tmpMuzzle, energyColor ?? energy.color, 0.2);
    } else {
      this.tmpRight.setFromMatrixColumn(this.player.camera.matrixWorld, 0);
      this.barrelSmoke.onShot(this.tmpMuzzle, weapon.heat.intensity, this.tmpRight, weapon.definition.muzzleSmoke);
      // Bolt actions keep the case chambered until the bolt is worked.
      if (!weapon.definition.boltAction) this.ejectShell(view, weapon.definition.shellCasing);
    }
  }

  private ejectShell(view: WeaponView, profile?: ShellCasingProfile): void {
    this.tmpRight.setFromMatrixColumn(this.player.camera.matrixWorld, 0);
    view.getEjectionWorldPosition(this.tmpEject);
    this.effects.ejectShell(this.tmpEject, this.tmpRight, profile);
  }

  private processWeaponEvents(): void {
    const weapon = this.currentWeapon;
    for (const event of weapon.pendingEvents) {
      switch (event.type) {
        case 'shot':
          this.handleShot(event.spread);
          break;
        case 'dryFire':
          this.audio.playDryFire();
          break;
        case 'overheated':
          this.audio.playBarrelOverheat();
          break;
        case 'heatWarning':
          this.audio.playFlameHeatWarning();
          break;
        case 'cooledDown':
          this.audio.playFlameReady();
          break;
        case 'reloadStart':
          this.audio.playReloadStart(
            !!weapon.definition.audio.energy,
            weapon.definition.view.reloadAnim?.style ?? 'rifle',
          );
          break;
        case 'reloadEnd':
          this.audio.playReloadComplete(
            !!weapon.definition.audio.energy,
            weapon.definition.view.reloadAnim?.style ?? 'rifle',
          );
          break;
        case 'boltStart':
          this.audio.playBolt(weapon.boltCycleDuration);
          break;
        case 'fireModeChanged':
          this.audio.playFireMode();
          break;
        default:
          break;
      }
    }
    weapon.clearEvents();
  }

  /**
   * A mode action that borrows the right arm (the knife, a grenade throw):
   * it ends the inspection and, once started, interrupts the reload, which
   * resumes afterwards if the magazine was left empty.
   */
  private startModeArmAction(weapon: Weapon, start: () => boolean): void {
    weapon.cancelInspect();
    if (!start()) return;
    weapon.cancelReload();
    this.meleeReloadWeapon = weapon.ammoInMagazine === 0 ? weapon : null;
  }

  private setDebugStatsEnabled(enabledByMode: boolean): void {
    if (!enabledByMode && !this.debugFromUrl) {
      this.debugStats?.dispose();
      this.debugStats = null;
      return;
    }
    this.debugStats ??= new DebugStats();
  }

  private readonly tick = (): void => this.frame();

  private frame(): void {
    if (this.disposed) return;
    // Always consume the clock delta so resuming never sees a huge dt spike.
    const frameSeconds = this.clock.getDelta();
    const dt = Math.min(frameSeconds, MAX_DELTA);
    this.input.updateGamepad(dt, this.gameplayStarted && !this.paused);
    if (this.disposed) return;

    // Single player on a menu: render the frozen frame and nothing else. No
    // player, weapon, ballistics, mode, effects or timers advance. A shared
    // (networked) match never halts here; the menu only gates local input.
    if ((this.paused && !this.mode.sharedSimulation) || this.mode.isSimulationPaused?.()) {
      this.input.suppressGamepad();
      this.present(this.mode.getCinematicCamera?.() ?? this.player.camera);
      this.debugStats?.pause();
      this.input.endFrame();
      this.dynamicResolution.resetWindow();
      this.qualityGovernor?.reset();
      return;
    }

    let weapon = this.currentWeapon;
    let allowGameplayInput =
      !this.paused &&
      (this.input.pointerLocked || this.profile.useTouchControls || this.controllerSession) &&
      !this.input.blockingMenu &&
      (this.mode.isGameplayInputEnabled?.() ?? true);
    let allowCombatInput = allowGameplayInput && (this.mode.isCombatInputEnabled?.() ?? true);

    if (allowGameplayInput) {
      if (allowCombatInput && this.input.wasPressed('GamepadSwap')) this.cycleWeapon();
      for (let i = 0; i < this.inventory.weapons.length && allowCombatInput; i++) {
        if (this.input.wasPressed(`Digit${i + 1}`)) this.switchWeapon(i);
      }
      // Selection is processed before actions, so reload/fire-mode apply to
      // the weapon visible in this frame rather than the stale pre-switch one.
      weapon = this.currentWeapon;
      if (allowCombatInput && !this.mode.usesFallbackAttack?.()
        && this.input.wasPressed('KeyR') && weapon.reload()) this.mode.onWeaponReloaded?.(weapon);
      if (allowCombatInput && this.input.wasPressed('KeyX')) weapon.cycleFireMode();
      // Touch layouts have no inspect button; physical controllers share desktop inspection.
      if (allowCombatInput && (!this.profile.useTouchControls || this.input.usingGamepad)
        && this.input.wasPressed('KeyF')) weapon.inspect();
      if (this.input.wasPressed('KeyE')) this.mode.onInteract?.();
      if (allowCombatInput && (
        this.input.wasPressed('Digit3') ||
        this.input.wasPressed('Numpad3') ||
        this.input.wasPressed('TouchKnife')
      )) {
        this.startModeArmAction(weapon, () => this.mode.onMeleeAttack?.() ?? false);
      }
      if (allowCombatInput && LETHAL_INPUT_CODES.some((code) => this.input.wasPressed(code))) {
        this.startModeArmAction(weapon, () => this.mode.onLethalThrow?.() ?? false);
      }
      allowGameplayInput =
        !this.paused &&
        (this.input.pointerLocked || this.profile.useTouchControls || this.controllerSession) &&
        !this.input.blockingMenu &&
        (this.mode.isGameplayInputEnabled?.() ?? true);
      allowCombatInput = allowGameplayInput && (this.mode.isCombatInputEnabled?.() ?? true);
    }

    // Interactions may equip a purchased/picked-up weapon in this same frame.
    weapon = this.currentWeapon;
    // A menu, a downed player or a mode lock ends the inspection.
    if (!allowCombatInput) weapon.cancelInspect();

    const fallbackAttack = this.mode.usesFallbackAttack?.() ?? false;
    if (this.meleeReloadWeapon) {
      if (this.meleeReloadWeapon !== weapon || weapon.ammoInMagazine !== 0) this.meleeReloadWeapon = null;
      else if (allowCombatInput && !fallbackAttack) {
        this.meleeReloadWeapon = null;
        if (weapon.reload()) this.mode.onWeaponReloaded?.(weapon);
      }
    }
    if (!allowGameplayInput && !this.paused
      && (this.input.pointerLocked || this.profile.useTouchControls || this.controllerSession)
      && !this.input.blockingMenu
      && this.mode.isDownedLookEnabled?.()) {
      this.player.update(dt, this.input, weapon, false, true);
    } else this.player.update(dt, this.input, weapon, allowGameplayInput);
    this.frameInput.trigger = allowCombatInput && this.input.leftButtonDown && !fallbackAttack;
    this.frameInput.ads = allowCombatInput && this.input.rightButtonDown && !fallbackAttack;
    this.frameInput.repeatSemiAuto = allowCombatInput && this.input.repeatSemiAuto;
    // In a shared match reloads and in-flight bullets keep resolving while
    // this player's input is gated (menu open, downed); triggers stay off.
    if (allowGameplayInput || this.mode.sharedSimulation) {
      weapon.update(dt, this.frameInput);
      this.processWeaponEvents();
      this.ballistics.update(dt);
    }
    // Visual-only camera motion goes on after this frame's shots have taken their aim.
    this.player.applyViewEffects(dt);
    // Only a flame weapon drives the stream's roar; a switch away gets one last call to silence it.
    const flameWeapon = weapon.definition.flame !== undefined;
    if (flameWeapon || this.flameStreamDriven) {
      this.audio.setFlameStream(flameWeapon && weapon.isFiring, flameWeapon ? weapon.heat.level : 0);
    }
    this.flameStreamDriven = flameWeapon;

    this.mode.update(dt);
    const rig = this.player.rig;
    this.hud.updateDamageDirections(dt, rig.position.x, rig.position.z, rig.rotation.y);
    const fallbackName = this.mode.getFallbackWeaponName?.() ?? null;
    const melee = this.mode.getMeleeArm?.() ?? null;
    // A cinematic camera films the world, not the first-person weapon and arms.
    const cinematicCamera = this.mode.getCinematicCamera?.() ?? null;
    this.currentView.update(
      dt,
      weapon,
      this.player.walkGait,
      this.input.mouseDeltaX,
      this.input.mouseDeltaY,
      melee?.firearmLowering ?? 0,
    );
    // Melee already animates the firearm down and back up; the HUD name must
    // not hide that motion. Preserve scope visibility and cinematic/death gates.
    this.currentView.root.visible &&= cinematicCamera === null && !this.player.isDying;
    this.viewArms.update(dt, this.currentView, melee);
    this.viewArms.root.visible = cinematicCamera === null;
    // Steps land on the footfalls the head and weapon bob follow; none in menus, cinematics or death.
    this.footsteps.update(this.player.walkGait, rig.position.x, rig.position.z, this.player.floor, this.player.stance,
      allowGameplayInput && cinematicCamera === null && !this.player.isDying);
    if (this.currentView.root.visible) {
      this.currentView.getMuzzleWorldPosition(this.tmpMuzzle);
      this.barrelSmoke.update(dt, this.tmpMuzzle, weapon.heat.intensity, weapon.definition.muzzleSmoke?.scale);
    }
    this.effects.update(dt);
    this.magazineDrops.update(dt);

    this.flashLight.intensity =
      this.flashLight.intensity > 0.02
        ? this.flashLight.intensity * Math.exp(-this.flashLightDecay * dt)
        : 0;

    const fovRadians = (this.player.camera.fov * Math.PI) / 180;
    const spreadPixels = clamp(
      10 + (Math.tan(weapon.currentSpread()) / Math.tan(fovRadians / 2)) * (this.viewportHeight / 2),
      10,
      MAX_SPREAD_PIXELS,
    );
    this.hud.update(weapon, spreadPixels, fallbackName);
    this.hud.setInteractionPrompt(
      allowGameplayInput ? (this.mode.getInteractPrompt?.() ?? null) : null,
    );

    const camera = cinematicCamera ?? this.player.camera;
    this.updateAdvancedLighting(dt, camera);
    this.present(camera);
    this.debugStats?.update(frameSeconds, this.renderer.info, this.dynamicResolution.scale,
      this.renderer.domElement.width, this.renderer.domElement.height);
    if (this.dynamicResolution.sample(dt)) this.applyPixelRatio();
    // A shared match keeps running behind the local menu; only played frames are judged.
    if (this.paused) this.qualityGovernor?.reset();
    else this.qualityGovernor?.sample(frameSeconds, this.dynamicResolution.scale);
    this.input.endFrame();
  }
}
