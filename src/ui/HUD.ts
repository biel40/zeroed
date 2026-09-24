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
  private readonly coopLobby: HTMLElement = mustGet('coop-lobby');
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
    // Assignment, not addEventListener: every run replaces the previous handler.
    this.startScreen.onclick = () => {
      if (this.ready) handler();
    };
  }

  /** Initial picker: Zombies is the only mode, so the player chooses its arena directly. */
  public showMapSelect(onSelect: (mapId: ZombieMapId) => void): void {
    this.startScreen.classList.add('hidden');
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
    back.setAttribute('aria-label', 'Back to main menu');
    this.hideCoopRoomCode();
    (mustGet('coop-connection-options') as HTMLDetailsElement).open = false;
    (mustGet('coop-host') as HTMLButtonElement).onclick = () => {
      joinFields.classList.add('hidden');
      back.setAttribute('aria-label', 'Back to main menu');
      handlers.host(server.value.trim());
    };
    (mustGet('coop-join') as HTMLButtonElement).onclick = () => {
      joinFields.classList.remove('hidden');
      back.setAttribute('aria-label', 'Back to room choices');
      code.focus();
      this.setCoopStatus('Enter the code your friend shared.');
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
      back.setAttribute('aria-label', 'Back to main menu');
      this.setCoopStatus('Create a room to get a code, or join a friend.');
      (mustGet('coop-join') as HTMLButtonElement).focus();
    };
    this.setCoopStatus('Create a room to get a code, or join a friend.');
  }

  public setCoopStatus(message: string): void {
    mustGet('coop-status').textContent = message;
  }

  public showCoopRoomCode(code: string): void {
    const roomCode = mustGet('coop-room-code');
    const copyButton = mustGet('coop-copy-code') as HTMLButtonElement;
    const shareButton = mustGet('coop-share-code') as HTMLButtonElement;
    roomCode.textContent = code;
    copyButton.textContent = 'COPY CODE';
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
        this.setCoopStatus('Could not copy the code. Select it to copy manually.');
        return;
      }
      copyButton.textContent = 'COPIED';
      window.setTimeout(() => {
        if (roomCode.textContent === code) copyButton.textContent = 'COPY CODE';
      }, 2000);
    };

    shareButton.onclick = async () => {
      const data: ShareData = { title: 'Zeroed room', text: `Join my Zeroed room with code ${code}.` };
      if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
        data.url = new URL(location.pathname, location.origin).href;
      }
      try {
        await navigator.share(data);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          this.setCoopStatus('Could not share the room. Use Copy Code instead.');
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
    mustGet('go-restart').textContent = role === 'host' ? 'RESTART' : 'LEAVE MATCH';
  }

  public clearCoopPresentation(): void {
    document.documentElement.classList.remove('coop-mode', 'coop-guest');
    mustGet('go-restart').textContent = 'RESTART';
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
    mustGet('go-restart').onclick = handler;
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
      if (this.lastAmmo !== 'MELEE') {
        this.ammo.textContent = 'MELEE';
        this.lastAmmo = 'MELEE';
      }
      if (this.lastMode !== 'BLADE') {
        this.mode.textContent = 'BLADE';
        this.lastMode = 'BLADE';
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
