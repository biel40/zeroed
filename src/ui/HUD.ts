import { getZombieMapDefinition, type ZombieMapId } from '../config/zombieMaps';
import { clamp } from '../utils/math';
import type { Weapon } from '../weapons/Weapon';

/** Live state shown on the Zombies mode panel. */
export interface ZombieHudState {
  readonly round: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly lethalHitDamage: number;
  readonly kills: number;
  readonly headshots: number;
  readonly points: number;
}

export interface GameOverStats {
  readonly round: number;
  readonly kills: number;
  readonly headshots: number;
}

const ROMAN_NUMERALS: readonly (readonly [number, string])[] = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Roman rounds stay compact through 3999; extreme endless rounds fall back safely. */
export function formatRomanRound(round: number): string {
  if (!Number.isInteger(round) || round < 1 || round > 3999) return `${round}`;
  let remaining = round;
  let result = '';
  for (const [value, numeral] of ROMAN_NUMERALS) {
    while (remaining >= value) {
      result += numeral;
      remaining -= value;
    }
  }
  return result;
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
  private readonly root: HTMLElement = mustGet('hud');
  private readonly weaponName: HTMLElement = mustGet('hud-weapon-name');
  private readonly ammo: HTMLElement = mustGet('hud-ammo');
  private readonly mode: HTMLElement = mustGet('hud-mode');
  private readonly crosshair: HTMLElement = mustGet('crosshair');
  private readonly scope: HTMLElement = mustGet('scope-overlay');
  private readonly hitmarker: HTMLElement = mustGet('hitmarker');
  private readonly startScreen: HTMLElement = mustGet('start-screen');
  private readonly startHint: HTMLElement = mustGet('start-hint');
  private readonly loadingBar: HTMLElement = mustGet('loading-bar');
  private readonly loadingBarFill: HTMLElement;
  private readonly zombiesPanel: HTMLElement = mustGet('hud-zombies');
  private readonly zRound: HTMLElement = mustGet('z-round');
  private readonly zPoints: HTMLElement = mustGet('z-points');
  private readonly zHpFill: HTMLElement = mustGet('z-hp-fill');
  private readonly zKills: HTMLElement = mustGet('z-kills');
  private readonly zHeadshots: HTMLElement = mustGet('z-headshots');
  private readonly roundBanner: HTMLElement = mustGet('round-banner');
  private readonly bannerTitle: HTMLElement = mustGet('banner-title');
  private readonly bannerSub: HTMLElement = mustGet('banner-sub');
  private readonly damageOverlay: HTMLElement = mustGet('damage-overlay');
  private readonly gameOverPanel: HTMLElement = mustGet('game-over');
  private readonly goRound: HTMLElement = mustGet('go-round');
  private readonly goKills: HTMLElement = mustGet('go-kills');
  private readonly goHeadshots: HTMLElement = mustGet('go-headshots');
  private readonly mapSelect: HTMLElement = mustGet('map-select');
  private readonly interactPrompt: HTMLElement = mustGet('interact-prompt');
  private readonly endingScreen: HTMLElement = mustGet('ending-screen');
  private readonly endingRound: HTMLElement = mustGet('ending-round');

  private lastWeapon: string = '';
  private lastAmmo: string = '';
  private lastMode: string = '';
  private lastZombies: string = '';
  private lastPrompt: string | null = null;
  private ready: boolean = false;

  public constructor() {
    const fill = this.loadingBar.querySelector('span');
    if (!fill) throw new Error('Missing #loading-bar span');
    this.loadingBarFill = fill as HTMLElement;
  }

  /** Real asset loading progress, 0..1. */
  public setLoadProgress(ratio: number): void {
    const percent = Math.round(ratio * 100);
    this.loadingBarFill.style.width = `${percent}%`;
    this.startHint.textContent = `LOADING ASSETS — ${percent} %`;
  }

  public setReady(): void {
    this.ready = true;
    this.loadingBar.classList.add('hidden');
    this.startHint.textContent = 'CLICK TO START';
  }

  public setError(message: string): void {
    this.ready = false;
    this.loadingBar.classList.remove('hidden');
    this.loadingBarFill.style.width = '0%';
    this.startHint.textContent = message;
    this.startScreen.classList.remove('hidden');
  }

  public setHudVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  public showStartScreen(paused: boolean): void {
    if (!this.ready) return;
    this.startHint.textContent = paused ? 'PAUSED — CLICK TO RESUME' : 'CLICK TO START';
    this.startScreen.classList.remove('hidden');
  }

  public hideStartScreen(): void {
    this.startScreen.classList.add('hidden');
  }

  public setStartHandler(handler: () => void): void {
    this.startScreen.addEventListener('click', () => {
      if (this.ready) handler();
    });
  }

  /** Initial picker: Zombies is the only mode, so the player chooses its arena directly. */
  public showMapSelect(onSelect: (mapId: ZombieMapId) => void): void {
    this.startScreen.classList.add('hidden');
    this.mapSelect.classList.remove('hidden');
    const buttons = this.mapSelect.querySelectorAll<HTMLButtonElement>('[data-map]');
    let firstVisibleButton: HTMLButtonElement | null = null;
    for (const button of buttons) {
      const map = getZombieMapDefinition(button.dataset.map);
      button.classList.toggle('hidden', !map?.visible);
      if (!map) {
        button.onclick = null;
        continue;
      }
      if (map.visible && !firstVisibleButton) firstVisibleButton = button;
      // Assignment replaces a previous handler if this menu is shown again.
      button.onclick = () => {
        for (const mapButton of buttons) mapButton.onclick = null;
        this.mapSelect.classList.add('hidden');
        onSelect(map.id);
      };
    }
    firstVisibleButton?.focus();
  }

  public setZombiesPanelVisible(visible: boolean): void {
    this.zombiesPanel.classList.toggle('hidden', !visible);
  }

  /** Zombies panel; the whole block only re-renders when something changed. */
  public updateZombies(state: ZombieHudState): void {
    const key = `${state.round}|${state.hp}|${state.maxHp}|${state.lethalHitDamage}|${state.kills}|${state.headshots}|${state.points}`;
    if (key === this.lastZombies) return;
    this.lastZombies = key;
    this.zRound.textContent = state.round > 0 ? `ROUND ${formatRomanRound(state.round)}` : 'GET READY';
    this.zPoints.textContent = `${state.points} PTS`;
    const ratio = clamp(state.hp / state.maxHp, 0, 1);
    this.zHpFill.style.width = `${ratio * 100}%`;
    this.zHpFill.classList.toggle('low', ratio <= 0.3);
    this.damageOverlay.classList.toggle(
      'lethal',
      state.hp > 0 && state.hp <= state.lethalHitDamage,
    );
    this.zKills.textContent = `${state.kills}`;
    this.zHeadshots.textContent = `${state.headshots}`;
  }

  /** Brief red flash on the points counter: a purchase was refused. */
  public flashNotEnoughPoints(): void {
    this.zPoints.classList.remove('denied');
    // Force reflow so the CSS animation restarts on rapid repeated attempts.
    void this.zPoints.offsetWidth;
    this.zPoints.classList.add('denied');
  }

  /** Big centered announcement; CSS animation auto-fades it. */
  public showRoundBanner(title: string, sub = ''): void {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.roundBanner.classList.remove('active');
    // Force reflow so the animation restarts on back-to-back rounds.
    void this.roundBanner.offsetWidth;
    this.roundBanner.classList.add('active');
  }

  /** Brief red vignette when the player takes a hit. */
  public flashDamage(): void {
    this.damageOverlay.classList.remove('active');
    void this.damageOverlay.offsetWidth;
    this.damageOverlay.classList.add('active');
  }

  public showGameOver(stats: GameOverStats): void {
    this.goRound.textContent = `${stats.round}`;
    this.goKills.textContent = `${stats.kills}`;
    this.goHeadshots.textContent = `${stats.headshots}`;
    this.gameOverPanel.classList.remove('hidden');
  }

  public hideGameOver(): void {
    this.gameOverPanel.classList.add('hidden');
  }

  public setZombiesRestartHandler(handler: () => void): void {
    mustGet('go-restart').addEventListener('click', handler);
  }

  public showEnding(round: number): void {
    this.setInteractionPrompt(null);
    this.endingRound.textContent = `${round}`;
    this.endingScreen.classList.remove('hidden', 'credits');
    this.endingScreen.classList.add('ending');
  }

  public showCredits(): void {
    this.root.classList.add('hidden');
    this.endingScreen.classList.remove('ending');
    this.endingScreen.classList.add('credits');
  }

  public hideEnding(): void {
    this.endingScreen.classList.add('hidden');
    this.endingScreen.classList.remove('ending', 'credits');
  }

  public setCreditsMainMenuHandler(handler: () => void): void {
    (mustGet('credits-main-menu') as HTMLButtonElement).onclick = handler;
  }

  /** Pause menu: shown while the game loop is halted (Game owns the state). */
  public showPauseMenu(): void {
    mustGet('pause-menu').classList.remove('hidden');
  }

  public hidePauseMenu(): void {
    mustGet('pause-menu').classList.add('hidden');
  }

  /**
   * Wires the three pause-menu actions. Handlers live in Game (it owns the
   * loop, the pointer lock and the restart/menu flow).
   */
  public setPauseHandlers(handlers: {
    onResume: () => void;
    onRestart: () => void;
    onMainMenu: () => void;
  }): void {
    mustGet('pause-resume').addEventListener('click', handlers.onResume);
    mustGet('pause-restart').addEventListener('click', handlers.onRestart);
    mustGet('pause-menu-btn').addEventListener('click', handlers.onMainMenu);
  }

  public showHitmarker(headshot = false): void {
    this.hitmarker.classList.remove('active');
    this.hitmarker.classList.toggle('headshot', headshot);
    // Force reflow so the CSS animation restarts on rapid consecutive hits.
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('active');
  }

  /** Center-screen interaction prompt ("MYSTERY BOX\nPress E"); null hides it. */
  public setInteractionPrompt(text: string | null): void {
    if (text === this.lastPrompt) return;
    this.lastPrompt = text;
    this.interactPrompt.classList.toggle('hidden', text === null);
    if (text !== null) this.interactPrompt.textContent = text;
  }

  public update(weapon: Weapon, spreadPixels: number): void {
    const definition = weapon.definition;

    if (definition.name !== this.lastWeapon) {
      this.weaponName.textContent = definition.name;
      this.lastWeapon = definition.name;
    }
    // Finite-reserve weapons show the real pool; generic bottomless definitions keep the infinity symbol.
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
    this.crosshair.style.setProperty('--gap', `${spreadPixels.toFixed(1)}px`);
    this.crosshair.style.opacity = (1 - weapon.adsAlpha).toFixed(2);

    const scopeOpacity = definition.scoped ? clamp((weapon.adsAlpha - 0.82) / 0.18, 0, 1) : 0;
    this.scope.style.opacity = scopeOpacity.toFixed(2);
    this.scope.style.visibility = scopeOpacity > 0.01 ? 'visible' : 'hidden';
  }
}
