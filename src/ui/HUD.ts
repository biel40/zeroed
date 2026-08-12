import type { Stats } from '../game/Stats';
import { clamp } from '../utils/math';
import type { Weapon } from '../weapons/Weapon';

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

  private lastWeapon = '';
  private lastAmmo = -1;
  private lastMode = '';
  private lastDistance = '';
  private lastAccuracy = '';
  private lastHits = '';
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

  showHitmarker(): void {
    this.hitmarker.classList.remove('active');
    // Force reflow so the CSS animation restarts on rapid consecutive hits.
    void this.hitmarker.offsetWidth;
    this.hitmarker.classList.add('active');
  }

  update(weapon: Weapon, stats: Stats, aimDistance: number | null, spreadPixels: number): void {
    const definition = weapon.definition;

    if (definition.name !== this.lastWeapon) {
      this.weaponName.textContent = definition.name;
      this.lastWeapon = definition.name;
    }
    if (weapon.ammoInMagazine !== this.lastAmmo) {
      this.ammo.textContent = `${weapon.ammoInMagazine} / ∞`;
      this.lastAmmo = weapon.ammoInMagazine;
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
