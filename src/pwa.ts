import { registerSW } from 'virtual:pwa-register';
import { getDeviceProfile } from './core/DeviceProfile';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function button(id: string): HTMLButtonElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`Missing PWA button #${id}`);
  return element;
}

function isStandalone(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}

function isIOS(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export class PwaLifecycle {
  private readonly profile: ReturnType<typeof getDeviceProfile>;
  private readonly standalone: boolean;
  private readonly installButton: HTMLButtonElement;
  private readonly iosInstallHint: HTMLElement;
  private readonly updateButtons: HTMLButtonElement[];
  private readonly mapSelect: HTMLElement;
  private readonly pauseMenu: HTMLElement;
  private installPrompt: InstallPromptEvent | null = null;
  private updateAvailable: boolean = false;
  private applyingUpdate: boolean = false;
  private reloadPending: boolean = false;
  private reloadStarted: boolean = false;
  private updateSW: () => Promise<void> = async () => { };
  private swRegistration: ServiceWorkerRegistration | null = null;
  private approvedWorker: ServiceWorker | null = null;
  private watchedWorker: ServiceWorker | null = null;
  private readonly serviceWorker: ServiceWorkerContainer | null;
  private controllerSeen: boolean;

  public constructor() {
    this.profile = getDeviceProfile();
    this.standalone = isStandalone();
    this.installButton = button('pwa-install');
    const iosInstallHint = document.getElementById('ios-install-hint');
    if (!iosInstallHint) throw new Error('Missing #ios-install-hint');
    this.iosInstallHint = iosInstallHint;
    this.updateButtons = [button('pwa-update-menu'), button('pwa-update-pause')];
    const mapSelect = document.getElementById('map-select');
    const pauseMenu = document.getElementById('pause-menu');
    if (!mapSelect || !pauseMenu) throw new Error('Missing safe PWA update menus');
    this.mapSelect = mapSelect;
    this.pauseMenu = pauseMenu;
    this.serviceWorker = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
    this.controllerSeen = this.serviceWorker?.controller != null;
    this.installButton.classList.add('hidden');
    this.iosInstallHint.classList.toggle('hidden', !isIOS() || this.standalone);
  }

  private _setUpdateAvailable(available: boolean): void {
    this.updateAvailable = available;
    for (const updateButton of this.updateButtons) {
      updateButton.classList.toggle('hidden', !available);
    }
  }

  private _reloadOnce(): void {
    if (this.reloadStarted) return;
    this.reloadStarted = true;
    window.location.reload();
  }

  private async _applyBrowserUpdate(): Promise<void> {
    if (this.standalone || this.applyingUpdate) return;
    this.applyingUpdate = true;
    try {
      await this.updateSW();
    } catch {
      // Keep the current version if the update fails.
    } finally {
      this.applyingUpdate = false;
    }
  }

  private _applyWhenInstalled(registration: ServiceWorkerRegistration): void {
    const worker = registration.installing;
    if (!worker || worker === this.watchedWorker) return;
    this.watchedWorker = worker;
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installed' || registration.waiting !== worker) return;
      this._setUpdateAvailable(true);
      void this._applyBrowserUpdate();
    });
  }

  private _handleWorkerControl(): void {
    const controller = this.serviceWorker?.controller;
    if (!controller) return;
    if (!this.controllerSeen) {
      this.controllerSeen = true;
      return;
    }
    if (!this.standalone || controller === this.approvedWorker) {
      this._reloadOnce();
      return;
    }
    this.reloadPending = true;
    this._setUpdateAvailable(true);
  }

  private async _applyUpdate(): Promise<void> {
    if (!this.updateAvailable || this.applyingUpdate) return;

    const safeMenuVisible = !this.mapSelect.classList.contains('hidden') || !this.pauseMenu.classList.contains('hidden');
    if (!safeMenuVisible) return;
    if (
      !this.pauseMenu.classList.contains('hidden') &&
      !window.confirm('Actualizar reiniciara la partida actual. Continuar?')
    ) {
      return;
    }

    if (this.reloadPending) {
      this._reloadOnce();
      return;
    }

    this.approvedWorker = this.swRegistration?.waiting ?? null;
    this.applyingUpdate = true;
    for (const updateButton of this.updateButtons) updateButton.disabled = true;
    try {
      await this.updateSW();
    } catch {
      // Leave the update available for another attempt.
    } finally {
      this.applyingUpdate = false;
      for (const updateButton of this.updateButtons) updateButton.disabled = false;
    }
  }

  public setup(): void {
    this.serviceWorker?.addEventListener('controllerchange', () => this._handleWorkerControl());

    this.updateSW = registerSW({
      immediate: true,
      onNeedRefresh: () => {
        this._setUpdateAvailable(true);
        void this._applyBrowserUpdate();
      },
      onNeedReload: () => this._handleWorkerControl(),
      onRegisteredSW: (_swScriptUrl, registration) => {
        this.swRegistration = registration ?? null;
        if (this.standalone || !registration) return;
        this._applyWhenInstalled(registration);
        void registration
          .update()
          .then(() => {
            if (registration.waiting) {
              this._setUpdateAvailable(true);
              void this._applyBrowserUpdate();
              return;
            }
            // update() resolves as soon as the new worker starts installing, not when it waits.
            this._applyWhenInstalled(registration);
          })
          .catch(() => { });
      },
    });

    for (const updateButton of this.updateButtons) {
      updateButton.addEventListener('click', () => void this._applyUpdate());
    }

    window.addEventListener('beforeinstallprompt', (event) => {
      if (!this.profile.isMobile) return;
      event.preventDefault();
      this.installPrompt = event as InstallPromptEvent;
      this.installButton.classList.toggle('hidden', isStandalone() || !this.profile.isMobile);
    });

    this.installButton.addEventListener('click', async () => {
      if (!this.profile.isMobile || !this.installPrompt || isStandalone()) return;
      const prompt = this.installPrompt;
      this.installPrompt = null;
      this.installButton.classList.add('hidden');
      await prompt.prompt();
      await prompt.userChoice;
    });

    window.addEventListener('appinstalled', () => {
      this.installPrompt = null;
      this.installButton.classList.add('hidden');
    });
  }
}

/** Browser-only PWA lifecycle. Gameplay state remains owned by Game. */
export function setupPWA(): void {
  new PwaLifecycle().setup();
}
