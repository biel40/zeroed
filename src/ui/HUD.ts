import type { Stats } from '../game/Stats';
import { clamp } from '../utils/math';
import type { Weapon } from '../weapons/Weapon';

/** Live state shown on the Zombies mode panel. */
export interface ZombieHudState {
  readonly round: number;
  readonly alive: number;
  readonly pending: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly kills: number;
  readonly headshots: number;
  readonly points: number;
}

export interface GameOverStats {
  readonly round: number;
  readonly kills: number;
  readonly headshots: number;
}

function mustGet(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing HUD element #${id}`);
  return element;
}

/**
 * DOM-based HUD. Text nodes are only touched when the value actually changes
 * to avoid layout work every frame.
 */
export class HUD {
  private readonly root = mustGet('hud');
  private readonly weaponName = mustGet('hud-weapon-name');
  private readonly ammo = mustGet('hud-ammo');
  private readonly mode = mustGet('hud-mode');
  private readonly distance = mustGet('aim-distance');
  private readonly accuracy = mustGet('hud-accuracy');
  private readonly hits = mustGet('hud-hits');
  private readonly crosshair = mustGet('crosshair');
  private readonly scope = mustGet('scope-overlay');
  private readonly hitmarker = mustGet('hitmarker');
  private readonly startScreen = mustGet('start-screen');
  private readonly startHint = mustGet('start-hint');
  private readonly loadingBar = mustGet('loading-bar');
  private readonly loadingBarFill: HTMLElement;
  private readonly statsPanel = mustGet('hud-stats');
  private readonly zombiesPanel = mustGet('hud-zombies');
  private readonly zRound = mustGet('z-round');
  private readonly zPoints = mustGet('z-points');
  private readonly zCount = mustGet('z-count');
  private readonly zHp = mustGet('z-hp');
  private readonly zHpFill = mustGet('z-hp-fill');
  private readonly zKills = mustGet('z-kills');
  private readonly zHeadshots = mustGet('z-headshots');
  private readonly roundBanner = mustGet('round-banner');
  private readonly bannerTitle = mustGet('banner-title');
  private readonly bannerSub = mustGet('banner-sub');
  private readonly damageOverlay = mustGet('damage-overlay');
  private readonly gameOverPanel = mustGet('game-over');
  private readonly goRound = mustGet('go-round');
  private readonly goKills = mustGet('go-kills');
  private readonly goHeadshots = mustGet('go-headshots');
  private readonly modeSelect = mustGet('mode-select');
  private readonly mapSelect = mustGet('map-select');
  private readonly interactPrompt = mustGet('interact-prompt');

  private lastWeapon = '';
  private lastAmmo = '';
  private lastMode = '';
  private lastDistance = '';
  private lastAccuracy = '';
  private lastHits = '';
  private lastZombies = '';
  private lastPrompt: string | null = null;
  private ready = false;

  constructor() {
    const fill = this.loadingBar.querySelector('span');
    if (!fill) throw new Error('Missing #loading-bar span');
    this.loadingBarFill = fill;
  }

  /** Real asset loading progress, 0..1. */
  setLoadProgress(ratio: number): void {
    const percent = Math.round(ratio * 100);
    this.loadingBarFill.style.width = `${percent}%`;
    this.startHint.textContent = `LOADING ASSETS — ${percent} %`;
  }

  setReady(): void {
    this.ready = true;
    this.loadingBar.classList.add('hidden');
    this.startHint.textContent = 'CLICK TO START';
  }

  setError(message: string): void {
    this.ready = false;
    this.loadingBar.classList.remove('hidden');
    this.loadingBarFill.style.width = '0%';
    this.startHint.textContent = message;
    this.startScreen.classList.remove('hidden');
  }

  setHudVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  showStartScreen(paused: boolean): void {
    if (!this.ready) return;
    this.startHint.textContent = paused ? 'PAUSED — CLICK TO RESUME' : 'CLICK TO START';
    this.startScreen.classList.remove('hidden');
  }

  hideStartScreen(): void {
    this.startScreen.classList.add('hidden');
  }

  setStartHandler(handler: () => void): void {
    this.startScreen.addEventListener('click', () => {
      if (this.ready) handler();
    });
  }

  /** Mode picker shown once assets are ready, before the pointer-lock screen. */
  showModeSelect(onSelect: (mode: 'range' | 'zombies') => void): void {
    this.startScreen.classList.add('hidden');
    this.modeSelect.classList.remove('hidden');
    for (const button of this.modeSelect.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      button.addEventListener('click', () => {
        this.modeSelect.classList.add('hidden');
        onSelect(button.dataset.mode === 'zombies' ? 'zombies' : 'range');
      });
    }
  }

  /** Map picker shown after choosing Zombies mode. */
  showMapSelect(onSelect: (mapId: 'classic' | 'burned-mansion') => void): void {
    this.mapSelect.classList.remove('hidden');
    for (const button of this.mapSelect.querySelectorAll<HTMLButtonElement>('[data-map]')) {
      button.addEventListener('click', () => {
        this.mapSelect.classList.add('hidden');
        const mapId = button.dataset.map;
        onSelect(mapId === 'burned-mansion' ? 'burned-mansion' : 'classic');
      });
    }
  }

  setRangeStatsVisible(visible: boolean): void {
    this.statsPanel.classList.toggle('hidden', !visible);
  }

  setZombiesPanelVisible(visible: boolean): void {
    this.zombiesPanel.classList.toggle('hidden', !visible);
  }

  /** Zombies panel; the whole block only re-renders when something changed. */
  updateZombies(state: ZombieHudState): void {
    const key = `${state.round}|${state.alive}|${state.pending}|${state.hp}|${state.kills}|${state.headshots}|${state.points}`;
    if (key === this.lastZombies) return;
    this.lastZombies = key;
    this.zRound.textContent = state.round > 0 ? `ROUND ${state.round}` : 'GET READY';
    this.zPoints.textContent = `${state.points} PTS`;
    this.zCount.textContent = `${state.alive + state.pending} LEFT`;
    this.zHp.textContent = `${Math.ceil(state.hp)}`;
    const ratio = clamp(state.hp / state.maxHp, 0, 1);
    this.zHpFill.style.width = `${ratio * 100}%`;
    this.zHpFill.classList.toggle('low', ratio <= 0.3);
    this.zKills.textContent = `${state.kills}`;
    this.zHeadshots.textContent = `${state.headshots}`;
  }

  /** Brief red flash on the points counter: a purchase was refused. */
  flashNotEnoughPoints(): void {
    this.zPoints.classList.remove('denied');
    // Force reflow so the CSS animation restarts on rapid repeated attempts.
    void this.zPoints.offsetWidth;
    this.zPoints.classList.add('denied');
  }

  /** Big centered announcement; CSS animation auto-fades it. */
  showRoundBanner(title: string, sub = ''): void {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.roundBanner.classList.remove('active');
    // Force reflow so the animation restarts on back-to-back rounds.
    void this.roundBanner.offsetWidth;
    this.roundBanner.classList.add('active');
  }

  /** Brief red vignette when the player takes a hit. */
  flashDamage(): void {
    this.damageOverlay.classList.remove('active');
    void this.damageOverlay.offsetWidth;
    this.damageOverlay.classList.add('active');
  }

  showGameOver(stats: GameOverStats): void {
    this.goRound.textContent = `${stats.round}`;
    this.goKills.textContent = `${stats.kills}`;
    this.goHeadshots.textContent = `${stats.headshots}`;
    this.gameOverPanel.classList.remove('hidden');
  }

  hideGameOver(): void {
    this.gameOverPanel.classList.add('hidden');
  }

  setZombiesRestartHandler(handler: () => void): void {
    mustGet('go-restart').addEventListener('click', handler);
  }

  /** Pause menu: shown while the game loop is halted (Game owns the state). */
  showPauseMenu(): void {
    mustGet('pause-menu').classList.remove('hidden');
  }

  hidePauseMenu(): void {
    mustGet('pause-menu').classList.add('hidden');
  }

  /**
   * Wires the three pause-menu actions. Handlers live in Game (it owns the
   * loop, the pointer lock and the restart/menu flow).
   */
  setPauseHandlers(handlers: {
    onResume: () => void;
    onRestart: () => void;
    onMainMenu: () => void;
  }): void {
    mustGet('pause-resume').addEventListener('click', handlers.onResume);
    mustGet('pause-restart').addEventListener('click', handlers.onRestart);
    mustGet('pause-menu-btn').addEventListener('click', handlers.onMainMenu);
  }

  showHitmarker(): void {
    this.hitmarker.classList.remove('active');
    // Force reflow so the CSS animation restarts on rapid consecutive hits.
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('active');
  }

  /** Center-screen interaction prompt ("MYSTERY BOX\nPress E"); null hides it. */
  setInteractionPrompt(text: string | null): void {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    this.interactPrompt.classList.toggle('hidden', text === null);
    if (text !== null) this.interactPrompt.textContent = text;
  }

  update(weapon: Weapon, stats: Stats, aimDistance: number | null, spreadPixels: number): void {
    const definition = weapon.definition;

    if (definition.name !== this.lastWeapon) {
      this.weaponName.textContent = definition.name;
      this.lastWeapon = definition.name;
    }
    // Finite-reserve weapons show the real pool; range weapons keep the ∞.
    const ammoText =
      weapon.reserveAmmo === null
        ? `${weapon.ammoInMagazine} / ∞`
        : `${weapon.ammoInMagazine} / ${weapon.reserveAmmo}`;
    if (ammoText !== this.lastAmmo) {
      this.ammo.textContent = ammoText;
      this.lastAmmo = ammoText;
    }
    const mode = weapon.fireMode.toUpperCase();
    if (mode !== this.lastMode) {
      this.mode.textContent = mode;
      this.lastMode = mode;
    }
    const distance = aimDistance === null ? '—' : `${Math.round(aimDistance)} m`;
    if (distance !== this.lastDistance) {
      this.distance.textContent = distance;
      this.lastDistance = distance;
    }
    const accuracy = `${Math.round(stats.accuracy * 100)} %`;
    if (accuracy !== this.lastAccuracy) {
      this.accuracy.textContent = accuracy;
      this.lastAccuracy = accuracy;
    }
    const hits = `${stats.hits} / ${stats.shots}`;
    if (hits !== this.lastHits) {
      this.hits.textContent = hits;
      this.lastHits = hits;
    }

    this.crosshair.style.setProperty('--gap', `${spreadPixels.toFixed(1)}px`);
    this.crosshair.style.opacity = (1 - weapon.adsAlpha).toFixed(2);

    const scopeOpacity = definition.scoped ? clamp((weapon.adsAlpha - 0.82) / 0.18, 0, 1) : 0;
    this.scope.style.opacity = scopeOpacity.toFixed(2);
    this.scope.style.visibility = scopeOpacity > 0.01 ? 'visible' : 'hidden';
  }
}
