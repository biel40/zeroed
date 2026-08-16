import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { AssetManager } from '../assets/AssetManager';
import { AudioSystem } from '../audio/AudioSystem';
import { WEAPON_DEFINITIONS } from '../config/weapons';
import { getDeviceProfile, type DeviceProfile } from '../core/DeviceProfile';
import { Stats } from '../game/Stats';
import { WeaponInventory } from '../game/WeaponInventory';
import type { GameMode } from '../modes/GameMode';
import { Input } from '../player/Input';
import { PlayerController } from '../player/PlayerController';
import { ShootingRange } from '../range/ShootingRange';
import { Effects } from '../rendering/Effects';
import { BallisticsSystem } from '../shooting/BallisticsSystem';
import type { SurfaceType } from '../shooting/HitTarget';
import { HUD } from '../ui/HUD';
import { clamp } from '../utils/math';
import { Weapon } from '../weapons/Weapon';
import { MagazineDropPool } from '../weapons/MagazineDrop';
import type { WeaponId } from '../weapons/WeaponTypes';
import { WeaponView } from '../weapons/WeaponView';

interface ArsenalEntry {
  readonly weapon: Weapon;
  readonly view: WeaponView;
}

const MAX_DELTA = 0.05;
const AIM_QUERY_INTERVAL = 0.1;
const FLASH_LIGHT_DECAY = 26;
const MAX_SPREAD_PIXELS = 130;
const UP = new THREE.Vector3(0, 1, 0);
const FALLBACK_UP = new THREE.Vector3(1, 0, 0);

function makeSkyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#7fa8d0');
  gradient.addColorStop(0.55, '#a8c3dc');
  gradient.addColorStop(0.8, '#cfdde8');
  gradient.addColorStop(1, '#dfe7ec');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

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
  private readonly range: ShootingRange;
  private readonly ballistics: BallisticsSystem;
  private readonly effects: Effects;
  private readonly audio = new AudioSystem();
  private readonly stats = new Stats();
  /** Every weapon the mode may use, preloaded once; the inventory picks slots. */
  private readonly arsenal = new Map<WeaponId, ArsenalEntry>();
  private inventory!: WeaponInventory;
  private readonly magazineDrops: MagazineDropPool;
  /** Range colliders + dynamic mode hitboxes (zombies). Mutated by the mode. */
  private readonly hitColliders: THREE.Object3D[];
  private readonly flashLight = new THREE.PointLight(0xffc27a, 0, 12, 1.6);
  private readonly aimRaycaster = new THREE.Raycaster();
  private readonly aimHits: THREE.Intersection[] = [];
  private aimTimer = 0;
  private aimDistance: number | null = null;

  private readonly debugElement: HTMLElement | null = null;
  private debugTimer = 0;
  private fpsEstimate = 60;
  /**
   * Real pause: while true the tick renders the frozen frame but advances
   * NOTHING — no player, weapon, ballistics, mode, effects or timers. This
   * is a simulation halt, not hidden UI or blocked input. Owned here because
   * only Game controls the loop and the pointer lock.
   */
  private paused = true;
  /** Desktop lock requests only complete after the browser confirms the canvas. */
  private pointerLockRequested = false;
  private gameplayStarted = false;

  /** Last applied viewport size in CSS pixels; also drives the spread math. */
  private viewportWidth = 1;
  private viewportHeight = 1;
  private resizeObserver: ResizeObserver | null = null;

  private readonly tmpOrigin = new THREE.Vector3();
  private readonly tmpDirection = new THREE.Vector3();
  private readonly tmpMuzzle = new THREE.Vector3();
  private readonly tmpEject = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
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
  ) {
    const rendererOptions = {
      antialias: !this.profile.useReducedEffects,
      powerPreference: 'high-performance' as const,
      alpha: false,
      depth: true,
      stencil: false,
      precision: this.profile.isMobile ? 'mediump' : 'highp',
    };

    console.info('[Game] Initializing renderer with profile', this.profile.log);
    this.viewportWidth = container.clientWidth || window.innerWidth || 1;
    this.viewportHeight = container.clientHeight || window.innerHeight || 1;
    this.renderer = new THREE.WebGLRenderer(rendererOptions);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.profile.pixelRatioLimit));
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

    this.scene.background = makeSkyTexture();
    this.scene.fog = new THREE.Fog(0xc3d3e0, 80, 380);

    // Image-based lighting from the built-in room environment: no download,
    // MIT-licensed, and enough to make metals and plastics read as PBR.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = this.profile.useReducedEffects ? 0.3 : 0.45;
    pmrem.dispose();

    this.input = new Input(this.renderer.domElement, this.profile);
    this.player = new PlayerController(this.viewportWidth / this.viewportHeight);
    this.scene.add(this.player.rig);

    this.range = new ShootingRange(this.assets);
    this.scene.add(this.range.group);

    this.effects = new Effects(this.scene);
    this.magazineDrops = new MagazineDropPool(this.scene);

    // The ballistics layer raycasts against this shared, mutable array:
    // range geometry is static, modes may add/remove dynamic hitboxes.
    this.hitColliders = [...this.range.colliders];
    this.ballistics = new BallisticsSystem(this.hitColliders, this.scene);
    this.ballistics.onTargetHit = (target, distance, point, normal, object) => {
      this.mode.onTargetHit(target, distance, point, normal, object, this.currentWeapon);
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

    for (const id of this.mode.weaponIds) {
      // The mode decides the starting reserve (Zombies: finite; Range:
      // bottomless). When the mode defines reserveAmmoFor, its return value
      // wins over the shared definition — see Weapon's reserveOverride.
      const weapon = this.mode.reserveAmmoFor
        ? new Weapon(WEAPON_DEFINITIONS[id], Math.random, this.mode.reserveAmmoFor(id))
        : new Weapon(WEAPON_DEFINITIONS[id]);
      const view = new WeaponView(weapon.definition, this.assets.getWeaponModel(id), this.magazineDrops);
      view.onReloadPhase = (phase) =>
        this.audio.playReloadPhase(
          phase,
          !!weapon.definition.audio.energy,
          weapon.definition.view.reloadAnim?.style ?? 'rifle',
        );
      this.player.camera.add(view.root);
      this.arsenal.set(id, { weapon, view });
    }
    const starting = this.mode.startingInventory ?? this.mode.weaponIds;
    this.inventory = new WeaponInventory(starting, this.mode.maxWeapons ?? starting.length);
    this.entry(this.inventory.currentWeapon).view.root.visible = true;
    this.scene.add(this.flashLight);

    // Touch-only weapon swap button (mobile keyboards have no 1–5 row).
    this.input.onWeaponSwap = () => this.cycleWeapon();

    this.hud.setAimDistanceVisible(this.mode.showsAimDistance === true);
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
      range: this.range,
      hitColliders: this.hitColliders,
      setExposure: (exposure) => {
        this.renderer.toneMappingExposure = exposure;
      },
      lockPointer: () => this.start(),
      unlockPointer: () => document.exitPointerLock(),
      grantWeapon: (id) => this.grantWeapon(id),
      canGrantWeapon: (id) => this.arsenal.has(id),
      hasWeapon: (id) => this.inventory.has(id),
      canRefillWeaponAmmo: (id) => {
        const entry = this.arsenal.get(id);
        return this.inventory.has(id) && !!entry && !entry.weapon.isAmmoFull;
      },
      refillWeaponAmmo: (id) => {
        const entry = this.arsenal.get(id);
        return this.inventory.has(id) && !!entry && entry.weapon.refillAmmo();
      },
      resetArsenal: () => this.resetArsenal(),
    });

    this.input.onLockChange = (locked) => this.handlePointerLockChange(locked);
    this.hud.setStartHandler(() => this.start());

    // Pause wiring. Desktop: ESC toggles (the pointer-lock release opens the
    // menu via onLockChange; a keydown ESC while unlocked resumes). Mobile:
    // the touch pause button. The menu buttons drive resume/restart/menu.
    this.input.onPauseRequest = () => {
      if (this.paused) this.resume();
      else this.pause();
    };
    this.hud.setPauseHandlers({
      onResume: () => this.resume(),
      onRestart: () => this.restartRun(),
      onMainMenu: () => window.location.reload(),
    });
    // ESC to resume while the menu is open and the pointer is unlocked.
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.paused && this.gameplayStarted) this.resume();
    });

    if (new URLSearchParams(window.location.search).has('debug')) {
      this.debugElement = document.createElement('div');
      this.debugElement.id = 'debug-stats';
      document.body.appendChild(this.debugElement);
    }

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
    this.renderer.setAnimationLoop(this.tick);
  }

  /** Entry point for the first user gesture: resumes audio, locks the pointer. */
  start(): void {
    if (
      this.profile.isMobile &&
      document.fullscreenElement === null &&
      typeof document.documentElement.requestFullscreen === 'function'
    ) {
      try {
        void document.documentElement.requestFullscreen().catch(() => undefined);
      } catch {}
    }
    this.audio.resume();
    void this.audio.loadMysteryBoxOpenAsset();
    if (this.profile.useTouchControls) {
      this.gameplayStarted = true;
      this.paused = false;
      this.audio.music.stopBackgroundLoop();
      this.hud.hidePauseMenu();
      this.hud.hideStartScreen();
      this.hud.setHudVisible(true);
      return;
    }
    if (this.gameplayStarted) {
      this.paused = true;
      this.audio.pauseMusic();
      this.hud.showPauseMenu();
    }
    this.pointerLockRequested = true;
    this.input.requestPointerLock();
  }

  private handlePointerLockChange(locked: boolean): void {
    if (this.profile.useTouchControls) return;

    if (locked) {
      // Never accept a delayed/unexpected lock behind a pause or mode menu.
      if (!this.pointerLockRequested) {
        document.exitPointerLock();
        return;
      }
      this.pointerLockRequested = false;
      this.gameplayStarted = true;
      this.paused = false;
      this.audio.music.stopBackgroundLoop();
      this.audio.resumeMusic();
      this.hud.hidePauseMenu();
      this.hud.hideStartScreen();
      this.hud.setHudVisible(true);
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

  /**
   * Pause/resume. Pausing halts the simulation (see `paused`) and releases
   * the pointer on desktop; resuming re-locks it and continues from the exact
   * same state — nothing is reset or advanced while paused.
   */
  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.audio.pauseMusic();
    if (this.mode.id === 'zombies') this.audio.music.startBackgroundLoop();
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.profile.pixelRatioLimit));
    this.renderer.setSize(width, height, false);
    this.player.resize(width / height);
  };

  private switchWeapon(index: number): void {
    const previousId = this.inventory.currentWeapon;
    const nextId = this.inventory.switchTo(index);
    if (!nextId) return;
    this.entry(previousId).view.root.visible = false;
    this.currentView.root.visible = true;
    this.currentWeapon.equip();
  }

  /** Cycles to the next carried weapon (touch swap button). */
  private cycleWeapon(): void {
    const count = this.inventory.weapons.length;
    if (count < 2) return;
    this.switchWeapon((this.inventory.currentIndex + 1) % count);
  }

  /**
   * Weapon pickup/purchase: the weapon enters the inventory (slot cap rules
   * live in WeaponInventory), arrives with fresh ammo, and is equipped.
   */
  private grantWeapon(id: WeaponId): boolean {
    const entry = this.arsenal.get(id);
    if (!entry) {
      console.warn(`[Game] Cannot grant "${id}": not preloaded in mode "${this.mode.id}"`);
      return false;
    }
    const previousId = this.inventory.currentWeapon;
    const { equipped, dropped } = this.inventory.grant(id);
    entry.weapon.resetAmmo();
    if (previousId !== equipped) this.entry(previousId).view.root.visible = false;
    entry.view.root.visible = true;
    entry.weapon.equip();
    console.info(
      `[Game] Weapon granted: ${equipped}` + (dropped ? ` (replaced ${dropped})` : ''),
    );
    return true;
  }

  /** Zombies restart: starting loadout, every weapon back to full ammo. */
  private resetArsenal(): void {
    this.inventory.reset(this.mode.startingInventory ?? this.mode.weaponIds);
    for (const entry of this.arsenal.values()) {
      entry.weapon.resetAmmo();
      entry.view.root.visible = false;
    }
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

  private handleShot(): void {
    const weapon = this.currentWeapon;
    const view = this.currentView;
    const energy = weapon.definition.energy;
    this.stats.registerShot();

    this.player.camera.getWorldPosition(this.tmpOrigin);
    this.player.camera.getWorldDirection(this.tmpDirection);
    this.applyCone(this.tmpDirection, weapon.currentSpread());

    // Energy weapons fire visible bolts handled by the mode; everything
    // else goes through the classic ballistic simulation.
    const handledByMode = this.mode.onWeaponFired?.(weapon, this.tmpOrigin, this.tmpDirection);
    if (!handledByMode) {
      this.ballistics.spawn(this.tmpOrigin, this.tmpDirection, weapon.definition.projectile);
    }

    this.audio.playShot(weapon.definition.audio);
    view.onShot();
    view.getMuzzleWorldPosition(this.tmpMuzzle);
    this.flashLight.position.copy(this.tmpMuzzle);
    this.flashLight.color.setHex(energy ? energy.color : 0xffc27a);
    this.flashLight.intensity = 9;

    if (energy) {
      this.effects.puff(this.tmpMuzzle, energy.color, 0.2);
    } else {
      this.effects.puff(this.tmpMuzzle, 0xdedede, 0.26);
      this.tmpRight.setFromMatrixColumn(this.player.camera.matrixWorld, 0);
      view.getEjectionWorldPosition(this.tmpEject);
      this.effects.ejectShell(this.tmpEject, this.tmpRight);
    }
  }

  private processWeaponEvents(): void {
    const weapon = this.currentWeapon;
    for (const event of weapon.pendingEvents) {
      switch (event.type) {
        case 'shot':
          this.handleShot();
          break;
        case 'dryFire':
          this.audio.playDryFire();
          break;
        case 'reloadStart':
          break; // per-phase foley kicks in via WeaponView.onReloadPhase
        case 'boltStart':
          this.audio.playBolt();
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

  private updateAimDistance(): void {
    this.player.camera.getWorldPosition(this.tmpOrigin);
    this.player.camera.getWorldDirection(this.tmpDirection);
    this.aimRaycaster.set(this.tmpOrigin, this.tmpDirection);
    this.aimRaycaster.near = 0;
    this.aimRaycaster.far = 600;
    this.aimHits.length = 0;
    this.aimRaycaster.intersectObjects(this.hitColliders, false, this.aimHits);
    this.aimDistance = this.aimHits.length > 0 ? this.aimHits[0].distance : null;
  }

  private updateDebug(dt: number): void {
    if (!this.debugElement) return;
    this.fpsEstimate += (1 / Math.max(dt, 1e-4) - this.fpsEstimate) * 0.05;
    this.debugTimer -= dt;
    if (this.debugTimer > 0) return;
    this.debugTimer = 0.25;
    const { render, memory } = this.renderer.info;
    this.debugElement.textContent =
      `FPS ${this.fpsEstimate.toFixed(0)}\n` +
      `calls ${render.calls}\n` +
      `tris ${render.triangles}\n` +
      `geometries ${memory.geometries}\n` +
      `textures ${memory.textures}`;
  }

  private readonly tick = (): void => {
    // Always consume the clock delta so resuming never sees a huge dt spike.
    const dt = Math.min(this.clock.getDelta(), MAX_DELTA);

    // Paused: render the frozen frame and nothing else. No player, weapon,
    // ballistics, mode, effects or timers advance — the simulation halts.
    if (this.paused) {
      this.renderer.render(this.scene, this.player.camera);
      this.input.endFrame();
      return;
    }

    let weapon = this.currentWeapon;
    const allowGameplayInput = this.input.pointerLocked || this.profile.useTouchControls;

    if (allowGameplayInput) {
      for (let i = 0; i < this.inventory.weapons.length; i++) {
        if (this.input.wasPressed(`Digit${i + 1}`)) this.switchWeapon(i);
      }
      if (this.input.wasPressed('KeyR')) weapon.reload();
      if (this.input.wasPressed('KeyX')) weapon.cycleFireMode();
      if (this.input.wasPressed('KeyE')) this.mode.onInteract?.();
    }

    // Interactions may equip a purchased/picked-up weapon in this same frame.
    weapon = this.currentWeapon;

    this.player.update(dt, this.input, weapon);
    this.frameInput.trigger = allowGameplayInput && this.input.leftButtonDown;
    this.frameInput.ads = allowGameplayInput && this.input.rightButtonDown;
    this.frameInput.repeatSemiAuto = allowGameplayInput && this.input.repeatSemiAuto;
    weapon.update(dt, this.frameInput);
    this.processWeaponEvents();

    this.ballistics.update(dt);
    this.range.update(dt);
    this.mode.update(dt);
    this.currentView.update(
      dt,
      weapon,
      this.player.speed01,
      this.input.mouseDeltaX,
      this.input.mouseDeltaY,
    );
    this.effects.update(dt);
    this.magazineDrops.update(dt);

    this.flashLight.intensity =
      this.flashLight.intensity > 0.02
        ? this.flashLight.intensity * Math.exp(-FLASH_LIGHT_DECAY * dt)
        : 0;

    if (this.mode.showsAimDistance === true) {
      this.aimTimer -= dt;
      if (this.aimTimer <= 0) {
        this.aimTimer = AIM_QUERY_INTERVAL;
        this.updateAimDistance();
      }
    }

    const fovRadians = (this.player.camera.fov * Math.PI) / 180;
    const spreadPixels = clamp(
      10 + (Math.tan(weapon.currentSpread()) / Math.tan(fovRadians / 2)) * (this.viewportHeight / 2),
      10,
      MAX_SPREAD_PIXELS,
    );
    this.hud.update(
      weapon,
      this.stats,
      this.mode.showsAimDistance === true ? this.aimDistance : undefined,
      spreadPixels,
    );
    this.hud.setInteractionPrompt(
      allowGameplayInput ? (this.mode.getInteractPrompt?.() ?? null) : null,
    );

    this.renderer.render(this.scene, this.player.camera);
    this.updateDebug(dt);
    this.input.endFrame();
  };
}
