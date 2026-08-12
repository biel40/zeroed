import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { AssetManager } from '../assets/AssetManager';
import { AudioSystem } from '../audio/AudioSystem';
import { WEAPON_DEFINITIONS, WEAPON_ORDER } from '../config/weapons';
import { Stats } from '../game/Stats';
import { Input } from '../player/Input';
import { PlayerController } from '../player/PlayerController';
import { ShootingRange } from '../range/ShootingRange';
import { Effects } from '../rendering/Effects';
import { BallisticsSystem } from '../shooting/BallisticsSystem';
import type { SurfaceType } from '../shooting/HitTarget';
import { HUD } from '../ui/HUD';
import { clamp } from '../utils/math';
import { Weapon } from '../weapons/Weapon';
import { WeaponView } from '../weapons/WeaponView';

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
 * player, weapons, ballistics, effects, audio and HUD together.
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
  private readonly weapons: Weapon[] = [];
  private readonly views: WeaponView[] = [];
  private readonly flashLight = new THREE.PointLight(0xffc27a, 0, 12, 1.6);
  private readonly aimRaycaster = new THREE.Raycaster();
  private readonly aimHits: THREE.Intersection[] = [];
  private currentWeaponIndex = 0;
  private aimTimer = 0;
  private aimDistance: number | null = null;

  private readonly debugElement: HTMLElement | null = null;
  private debugTimer = 0;
  private fpsEstimate = 60;

  private readonly tmpOrigin = new THREE.Vector3();
  private readonly tmpDirection = new THREE.Vector3();
  private readonly tmpMuzzle = new THREE.Vector3();
  private readonly tmpEject = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();
  private readonly spreadRight = new THREE.Vector3();
  private readonly spreadUp = new THREE.Vector3();
  /** Reused every frame to avoid per-frame allocations in the loop. */
  private readonly frameInput = { trigger: false, ads: false };

  constructor(
    container: HTMLElement,
    private readonly hud: HUD,
    private readonly assets: AssetManager,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.background = makeSkyTexture();
    this.scene.fog = new THREE.Fog(0xc3d3e0, 80, 380);

    // Image-based lighting from the built-in room environment: no download,
    // MIT-licensed, and enough to make metals and plastics read as PBR.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();

    this.input = new Input(this.renderer.domElement);
    this.player = new PlayerController(window.innerWidth / window.innerHeight);
    this.scene.add(this.player.rig);

    this.range = new ShootingRange(this.assets);
    this.scene.add(this.range.group);

    this.effects = new Effects(this.scene);
    this.ballistics = new BallisticsSystem(this.range.colliders, this.scene);
    this.ballistics.onTargetHit = (target, distance, point, normal, object) => {
      this.stats.registerHit(distance);
      this.hud.showHitmarker();
      if (target.surface === 'metal') {
        this.audio.playPing();
        this.effects.spark(point, normal);
      } else {
        this.audio.playImpact('paper');
        this.effects.bulletHole(point, normal, object);
      }
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

    for (const id of WEAPON_ORDER) {
      const weapon = new Weapon(WEAPON_DEFINITIONS[id]);
      const view = new WeaponView(weapon.definition, this.assets.getWeaponModel(id));
      this.player.camera.add(view.root);
      this.weapons.push(weapon);
      this.views.push(view);
    }
    this.views[0].root.visible = true;
    this.scene.add(this.flashLight);

    this.input.onLockChange = (locked) => {
      if (locked) {
        this.hud.hideStartScreen();
        this.hud.setHudVisible(true);
      } else {
        this.hud.showStartScreen(true);
        this.hud.setHudVisible(false);
      }
    };
    this.hud.setStartHandler(() => {
      this.audio.resume();
      this.input.requestPointerLock();
    });

    if (new URLSearchParams(window.location.search).has('debug')) {
      this.debugElement = document.createElement('div');
      this.debugElement.id = 'debug-stats';
      document.body.appendChild(this.debugElement);
    }

    window.addEventListener('resize', this.handleResize);
    this.renderer.setAnimationLoop(this.tick);
  }

  private get currentWeapon(): Weapon {
    return this.weapons[this.currentWeaponIndex];
  }

  private get currentView(): WeaponView {
    return this.views[this.currentWeaponIndex];
  }

  private readonly handleResize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.player.resize(window.innerWidth / window.innerHeight);
  };

  private switchWeapon(index: number): void {
    if (index === this.currentWeaponIndex) return;
    this.currentView.root.visible = false;
    this.currentWeaponIndex = index;
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
    this.stats.registerShot();

    this.player.camera.getWorldPosition(this.tmpOrigin);
    this.player.camera.getWorldDirection(this.tmpDirection);
    this.applyCone(this.tmpDirection, weapon.currentSpread());
    this.ballistics.spawn(this.tmpOrigin, this.tmpDirection, weapon.definition.projectile);

    this.audio.playShot(weapon.definition.audio);
    view.onShot();
    view.getMuzzleWorldPosition(this.tmpMuzzle);
    this.flashLight.position.copy(this.tmpMuzzle);
    this.flashLight.intensity = 9;
    this.effects.puff(this.tmpMuzzle, 0xdedede, 0.26);

    this.tmpRight.setFromMatrixColumn(this.player.camera.matrixWorld, 0);
    view.getEjectionWorldPosition(this.tmpEject);
    this.effects.ejectShell(this.tmpEject, this.tmpRight);
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
          this.audio.playReload(weapon.definition.reloadTime);
          break;
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
    this.aimRaycaster.intersectObjects(this.range.colliders, false, this.aimHits);
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
    const dt = Math.min(this.clock.getDelta(), MAX_DELTA);
    const weapon = this.currentWeapon;

    if (this.input.pointerLocked) {
      for (let i = 0; i < WEAPON_ORDER.length; i++) {
        if (this.input.wasPressed(`Digit${i + 1}`)) this.switchWeapon(i);
      }
      if (this.input.wasPressed('KeyR')) weapon.reload();
      if (this.input.wasPressed('KeyX')) weapon.cycleFireMode();
    }

    this.player.update(dt, this.input, weapon);
    this.frameInput.trigger = this.input.pointerLocked && this.input.leftButtonDown;
    this.frameInput.ads = this.input.pointerLocked && this.input.rightButtonDown;
    weapon.update(dt, this.frameInput);
    this.processWeaponEvents();

    this.ballistics.update(dt);
    this.range.update(dt);
    this.currentView.update(
      dt,
      weapon,
      this.player.speed01,
      this.input.mouseDeltaX,
      this.input.mouseDeltaY,
    );
    this.effects.update(dt);

    this.flashLight.intensity =
      this.flashLight.intensity > 0.02
        ? this.flashLight.intensity * Math.exp(-FLASH_LIGHT_DECAY * dt)
        : 0;

    this.aimTimer -= dt;
    if (this.aimTimer <= 0) {
      this.aimTimer = AIM_QUERY_INTERVAL;
      this.updateAimDistance();
    }

    const fovRadians = (this.player.camera.fov * Math.PI) / 180;
    const spreadPixels = clamp(
      10 + (Math.tan(weapon.currentSpread()) / Math.tan(fovRadians / 2)) * (window.innerHeight / 2),
      10,
      MAX_SPREAD_PIXELS,
    );
    this.hud.update(weapon, this.stats, this.aimDistance, spreadPixels);

    this.renderer.render(this.scene, this.player.camera);
    this.updateDebug(dt);
    this.input.endFrame();
  };
}
