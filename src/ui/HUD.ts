import { getZombieMapDefinition, type ZombieMapId } from '../config/zombieMaps';
import { formatNumber, getLanguage, isLanguage, onLanguageChange, setLanguage, t } from '../i18n/i18n';
import { clamp } from '../utils/math';
import { NUCLEAR_DETONATION_TIME } from '../zombies/ZombiesRunFlow';
import type { Weapon } from '../weapons/Weapon';
import { gameOverEpitaph, lampProgress, roundMarks } from './SurvivalPresentation';

/** Live state shown on the Zombies mode panel. */
export interface ZombieHudState {
  readonly round: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly lethalHitDamage: number;
  readonly kills: number;
  readonly headshots: number;
  readonly points: number;
  readonly totalPoints: number;
  readonly totalDamage: number;
  readonly lamps: readonly boolean[];
}

export interface GameOverStats {
  readonly round: number;
  readonly kills: number;
  readonly headshots: number;
}

/** Keep in sync with the #map-loading opacity transition in style.css. */
const MAP_LOADING_FADE_MS = 450;
const MAP_LOADING_MIN_MS = 700;
/** Matches the #start-screen opacity transition in style.css. */
const START_SCREEN_FADE_MS = 450;

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
  private readonly coopLobby: HTMLElement = mustGet('coop-lobby');
  private readonly interactPrompt: HTMLElement = mustGet('interact-prompt');
  private readonly downedFilter: HTMLElement = mustGet('downed-filter');
  private readonly downedStatus: HTMLElement = mustGet('downed-status');
  private readonly downedCountdown: HTMLElement = mustGet('downed-countdown');
  private readonly reviveStatus: HTMLElement = mustGet('revive-status');
  private readonly reviveProgress: HTMLElement = mustGet('revive-progress');
  private readonly hostPauseStatus: HTMLElement = mustGet('host-pause-status');
  private readonly endingScreen: HTMLElement = mustGet('ending-screen');
  private readonly endingRound: HTMLElement = mustGet('ending-round');

  private lastWeapon: string = '';
  private lastAmmo: string = '';
  private lastMode: string = '';
  private lastZombies: string = '';
  private lastRound = -1;
  private lastLamps = '';
  private lastPrompt: string | null = null;
  private ready: boolean = false;
  private readonly mapLoading: HTMLElement = mustGet('map-loading');
  private mapLoadingShownAt = 0;
  private mapLoadingTimer = 0;
  private startScreenTimer = 0;

  public constructor() {
    const fill = this.loadingBar.querySelector('span');
    if (!fill) throw new Error('Missing #loading-bar span');
    this.loadingBarFill = fill as HTMLElement;

    const privacyDialog = mustGet('privacy-dialog') as HTMLDialogElement;
    const privacyFrame = mustGet('privacy-frame') as HTMLIFrameElement;
    mustGet('privacy-open').onclick = () => {
      if (!privacyFrame.hasAttribute('src')) privacyFrame.src = './privacy.html';
      privacyDialog.showModal();
    };
    mustGet('privacy-close').onclick = () => privacyDialog.close();

    // The language is only chosen from the main menu; in-game texts read it when rendered.
    const languageButtons = mustGet('language-select').querySelectorAll<HTMLButtonElement>('[data-language]');
    const syncLanguageButtons = (): void => {
      for (const button of languageButtons) {
        button.setAttribute('aria-pressed', String(button.dataset.language === getLanguage()));
      }
    };
    for (const button of languageButtons) {
      button.onclick = () => {
        if (isLanguage(button.dataset.language)) setLanguage(button.dataset.language);
      };
    }
    syncLanguageButtons();
    onLanguageChange(() => {
      syncLanguageButtons();
      // Cached HUD texts were rendered in the previous language.
      this.lastWeapon = this.lastAmmo = this.lastMode = this.lastZombies = this.lastLamps = '';
      this.lastRound = -1;
      this.lastPrompt = null;
    });
  }

  /** Real asset loading progress, 0..1. */
  public setLoadProgress(ratio: number): void {
    const percent = Math.round(ratio * 100);
    this.loadingBarFill.style.width = `${percent}%`;
    this.startHint.textContent = t('start.loadingProgress', { percent });
  }

  public setReady(): void {
    this.ready = true;
    this.startScreen.classList.add('ready');
    this.loadingBar.classList.add('hidden');
    this.startHint.textContent = t('start.clickToStart');
  }

  public setError(message: string): void {
    this.ready = false;
    this.startScreen.classList.remove('ready');
    this.loadingBar.classList.remove('hidden');
    this.loadingBarFill.style.width = '0%';
    this.startHint.textContent = message;
    this.revealStartScreen();
  }

  /** Opaque cover shown from the map pick until the first frame is ready. */
  public showMapLoading(): void {
    clearTimeout(this.mapLoadingTimer);
    this.mapLoadingShownAt = performance.now();
    this.mapLoading.classList.remove('hidden', 'leaving');
  }

  /** Fades the cover out; a minimum on-screen time keeps fast loads from flickering. */
  public hideMapLoading(immediate = false): void {
    clearTimeout(this.mapLoadingTimer);
    if (immediate) {
      this.mapLoading.classList.add('hidden');
      return;
    }
    const remaining = Math.max(0, MAP_LOADING_MIN_MS - (performance.now() - this.mapLoadingShownAt));
    this.mapLoadingTimer = window.setTimeout(() => {
      this.mapLoading.classList.add('leaving');
      this.mapLoadingTimer = window.setTimeout(() => this.mapLoading.classList.add('hidden'), MAP_LOADING_FADE_MS);
    }, remaining);
  }

  public setHudVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  public showStartScreen(paused: boolean): void {
    if (!this.ready) return;
    this.startHint.textContent = t(paused ? 'start.pausedClick' : 'start.clickToStart');
    this.revealStartScreen();
  }

  public hideStartScreen(): void {
    clearTimeout(this.startScreenTimer);
    this.startScreen.classList.remove('leaving');
    this.startScreen.classList.add('hidden');
  }

  private revealStartScreen(): void {
    clearTimeout(this.startScreenTimer);
    this.startScreen.classList.remove('hidden', 'leaving');
  }

  /** Cross-fades the loading screen into the menu shown beneath it. */
  private fadeOutStartScreen(): void {
    if (this.startScreen.classList.contains('hidden')) return;
    clearTimeout(this.startScreenTimer);
    this.startScreen.classList.add('leaving');
    this.startScreenTimer = window.setTimeout(() => this.hideStartScreen(), START_SCREEN_FADE_MS);
  }

  public setStartHandler(handler: () => void): void {
    // Assignment, not addEventListener: every run replaces the previous handler.
    this.startScreen.onclick = () => {
      if (this.ready && !(document.documentElement.classList.contains('touch-controls-enabled') &&
        window.matchMedia('(orientation: portrait)').matches)) handler();
    };
  }

  /** Initial picker: Zombies is the only mode, so the player chooses its arena directly. */
  public showMapSelect(onSelect: (mapId: ZombieMapId) => void): void {
    this.fadeOutStartScreen();
    this.coopLobby.classList.add('hidden');
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

  public setCoopSelectHandler(handler: () => void): void {
    (mustGet('coop-select') as HTMLButtonElement).onclick = handler;
  }

  public showCoopLobby(defaultServerUrl: string, handlers: {
    host: (url: string) => void;
    join: (url: string, code: string) => void;
    back: () => void;
  }): void {
    this.mapSelect.classList.add('hidden');
    this.coopLobby.classList.remove('hidden');
    const server = mustGet('coop-server') as HTMLInputElement;
    const code = mustGet('coop-code') as HTMLInputElement;
    const joinFields = mustGet('coop-join-fields');
    const back = mustGet('coop-back') as HTMLButtonElement;
    server.value = defaultServerUrl;
    code.value = '';
    joinFields.classList.add('hidden');
    back.setAttribute('aria-label', t('coop.backToMenu'));
    this.hideCoopRoomCode();
    (mustGet('coop-connection-options') as HTMLDetailsElement).open = false;
    (mustGet('coop-host') as HTMLButtonElement).onclick = () => {
      joinFields.classList.add('hidden');
      back.setAttribute('aria-label', t('coop.backToMenu'));
      handlers.host(server.value.trim());
    };
    (mustGet('coop-join') as HTMLButtonElement).onclick = () => {
      joinFields.classList.remove('hidden');
      back.setAttribute('aria-label', t('coop.backToChoices'));
      code.focus();
      this.setCoopStatus(t('coop.enterCode'));
    };
    const submitJoin = () => handlers.join(server.value.trim(), code.value.trim().toUpperCase());
    (mustGet('coop-join-submit') as HTMLButtonElement).onclick = submitJoin;
    code.onkeydown = (event) => { if (event.key === 'Enter') submitJoin(); };
    back.onclick = () => {
      if (joinFields.classList.contains('hidden')) {
        handlers.back();
        return;
      }
      joinFields.classList.add('hidden');
      code.value = '';
      back.setAttribute('aria-label', t('coop.backToMenu'));
      this.setCoopStatus(t('coop.chooseAction'));
      (mustGet('coop-join') as HTMLButtonElement).focus();
    };
    this.setCoopStatus(t('coop.chooseAction'));
  }

  public setCoopStatus(message: string): void {
    mustGet('coop-status').textContent = message;
  }

  public showCoopRoomCode(code: string): void {
    const roomCode = mustGet('coop-room-code');
    const copyButton = mustGet('coop-copy-code') as HTMLButtonElement;
    const shareButton = mustGet('coop-share-code') as HTMLButtonElement;
    roomCode.textContent = code;
    copyButton.textContent = t('coop.copy');
    mustGet('coop-room-share').classList.remove('hidden');
    shareButton.classList.toggle('hidden', typeof navigator.share !== 'function');

    copyButton.onclick = async () => {
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(code);
          copied = true;
        }
      } catch { /* Try the fallback below. */ }
      if (!copied) {
        const input = document.createElement('textarea');
        input.value = code;
        input.style.position = 'fixed';
        input.style.opacity = '0';
        input.style.userSelect = 'text';
        document.body.append(input);
        input.select();
        try {
          copied = document.execCommand('copy');
        } catch { /* The player can still select the visible code. */ }
        finally { input.remove(); }
      }
      if (!copied) {
        this.setCoopStatus(t('coop.copyFailed'));
        return;
      }
      copyButton.textContent = t('coop.copied');
      window.setTimeout(() => {
        if (roomCode.textContent === code) copyButton.textContent = t('coop.copy');
      }, 2000);
    };

    shareButton.onclick = async () => {
      const data: ShareData = { title: t('coop.shareTitle'), text: t('coop.shareText', { code }) };
      if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
        data.url = new URL(location.pathname, location.origin).href;
      }
      try {
        await navigator.share(data);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          this.setCoopStatus(t('coop.shareFailed'));
        }
      }
    };
  }

  public hideCoopRoomCode(): void {
    mustGet('coop-room-share').classList.add('hidden');
  }

  public hideCoopLobby(): void {
    this.coopLobby.classList.add('hidden');
  }

  public setCoopPresentation(role: 'host' | 'guest'): void {
    document.documentElement.classList.add('coop-mode');
    document.documentElement.classList.toggle('coop-guest', role === 'guest');
    // Only the host restarts; a guest can always leave, and follows a host restart automatically.
    mustGet('go-restart').textContent = t(role === 'host' ? 'gameOver.restart' : 'gameOver.leave');
  }

  public clearCoopPresentation(): void {
    document.documentElement.classList.remove('coop-mode', 'coop-guest');
    this.setDownedState('alive', 0, 0);
    this.setHostPauseVisible(false);
    mustGet('go-restart').textContent = t('gameOver.restart');
  }

  public setHostPauseVisible(visible: boolean): void {
    this.hostPauseStatus.classList.toggle('hidden', !visible);
  }

  public setDownedState(life: 'alive' | 'downed' | 'dead', seconds: number, reviveProgress: number): void {
    const downed = life === 'downed';
    this.downedFilter.classList.toggle('hidden', !downed);
    this.downedStatus.classList.toggle('hidden', !downed);
    if (downed) this.downedCountdown.textContent = t('hud.bleedingOut', { seconds: Math.ceil(seconds) });
    this.reviveStatus.classList.toggle('hidden', reviveProgress <= 0);
    this.reviveProgress.style.width = `${Math.min(1, reviveProgress) * 100}%`;
  }

  public setZombiesPanelVisible(visible: boolean): void {
    this.zombiesPanel.classList.toggle('hidden', !visible);
  }

  /** Zombies panel; the whole block only re-renders when something changed. */
  public updateZombies(state: ZombieHudState): void {
    const key = `${state.round}|${state.hp}|${state.maxHp}|${state.lethalHitDamage}|${state.kills}|${state.headshots}|${state.points}|${state.totalPoints}|${state.totalDamage}|${state.lamps.join(',')}`;
    if (key === this.lastZombies) return;
    this.lastZombies = key;
    if (this.lastRound !== state.round) {
      this.lastRound = state.round;
      this.zRound.innerHTML = roundMarks(state.round);
      this.zRound.setAttribute('aria-label', t('hud.roundLabel', { round: state.round }));
      mustGet('pause-round').textContent = `${state.round}`;
    }
    this.zPoints.textContent = formatNumber(state.points);
    mustGet('z-hp').textContent = `${Math.ceil(state.hp)} / ${state.maxHp}`;
    const ratio = state.maxHp > 0 ? clamp(state.hp / state.maxHp, 0, 1) : 0;
    this.zHpFill.style.width = `${ratio * 100}%`;
    this.zHpFill.classList.toggle('low', ratio <= 0.3);
    this.damageOverlay.classList.toggle(
      'lethal',
      state.hp > 0 && state.hp <= state.lethalHitDamage,
    );
    this.zKills.textContent = `${state.kills}`;
    this.zHeadshots.textContent = `${state.headshots}`;
    mustGet('pause-damage').textContent = formatNumber(Math.round(state.totalDamage));
    mustGet('pause-points').textContent = formatNumber(state.totalPoints);
    mustGet('pause-kills').textContent = `${state.kills}`;
    mustGet('pause-headshots').textContent = `${state.headshots}`;
    const lampKey = `${state.lamps.length}|${state.lamps.join(',')}`;
    if (this.lastLamps !== lampKey) {
      this.lastLamps = lampKey;
      mustGet('z-lamps').innerHTML = lampProgress(state.lamps, true);
      mustGet('pause-lamps').innerHTML = lampProgress(state.lamps);
    }
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
    // A data-i18n key keeps the line translated if the language changes meanwhile.
    const epitaph = mustGet('go-epitaph');
    const epitaphKey = gameOverEpitaph(stats.round);
    epitaph.dataset.i18n = epitaphKey;
    epitaph.textContent = t(epitaphKey);
    this.gameOverPanel.classList.remove('hidden');
  }

  public hideGameOver(): void {
    this.gameOverPanel.classList.add('hidden');
  }

  public setZombiesRestartHandler(handler: () => void): void {
    mustGet('go-restart').onclick = handler;
  }

  public showEnding(round: number): void {
    this.root.classList.add('hidden');
    this.setInteractionPrompt(null);
    this.endingScreen.style.setProperty('--detonation', `${NUCLEAR_DETONATION_TIME}s`);
    this.endingRound.textContent = `${round}`;
    this.endingScreen.classList.remove('hidden', 'credits');
    this.endingScreen.classList.add('ending');
  }

  public showCredits(): void {
    this.root.classList.add('hidden');
    this.endingScreen.classList.remove('hidden', 'ending');
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
    mustGet('pause-resume').onclick = handlers.onResume;
    mustGet('pause-restart').onclick = handlers.onRestart;
    mustGet('pause-menu-btn').onclick = handlers.onMainMenu;
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

  public update(weapon: Weapon, spreadPixels: number, fallbackWeapon: string | null = null): void {
    const definition = weapon.definition;
    if (fallbackWeapon !== null) {
      if (fallbackWeapon !== this.lastWeapon) {
        this.weaponName.textContent = fallbackWeapon;
        this.lastWeapon = fallbackWeapon;
      }
      const melee = t('hud.melee');
      if (this.lastAmmo !== melee) {
        this.ammo.textContent = melee;
        this.lastAmmo = melee;
      }
      const blade = t('hud.blade');
      if (this.lastMode !== blade) {
        this.mode.textContent = blade;
        this.lastMode = blade;
      }
      this.crosshair.style.setProperty('--gap', '10.0px');
      this.crosshair.style.opacity = '1';
      this.scope.style.opacity = '0';
      this.scope.style.visibility = 'hidden';
      return;
    }

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
    const mode = t(weapon.fireMode === 'auto' ? 'hud.fireMode.auto' : 'hud.fireMode.semi');
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
