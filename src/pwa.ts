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

/** Browser-only PWA lifecycle. Gameplay state remains owned by Game. */
export function setupPWA(): void {
  const profile = getDeviceProfile();
  const standalone = isStandalone();
  const installButton = button('pwa-install');
  const menuUpdateButton = button('pwa-update-menu');
  const pauseUpdateButton = button('pwa-update-pause');
  const mapSelect = document.getElementById('map-select');
  const pauseMenu = document.getElementById('pause-menu');
  if (!mapSelect || !pauseMenu) throw new Error('Missing safe PWA update menus');
  installButton.classList.toggle('hidden', !profile.isMobile || standalone);
  const updateButtons = [menuUpdateButton, pauseUpdateButton];
  let installPrompt: InstallPromptEvent | null = null;
  let updateAvailable = false;
  let applyingUpdate = false;
  let reloadPending = false;
  let reloadStarted = false;
  let updateSW: () => Promise<void> = async () => {};
  let swRegistration: ServiceWorkerRegistration | null = null;
  let approvedWorker: ServiceWorker | null = null;
  let watchedWorker: ServiceWorker | null = null;
  const serviceWorker = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  let controllerSeen = serviceWorker?.controller != null;

  const setUpdateAvailable = (available: boolean): void => {
    updateAvailable = available;
    for (const updateButton of updateButtons) updateButton.classList.toggle('hidden', !available);
  };

  const reloadOnce = (): void => {
    if (reloadStarted) return;
    reloadStarted = true;
    window.location.reload();
  };

  const applyBrowserUpdate = async (): Promise<void> => {
    if (standalone || applyingUpdate) return;
    applyingUpdate = true;
    try {
      await updateSW();
    } catch (error: unknown) {
      console.error('[Zeroed PWA] Could not apply the browser update.', error);
    } finally {
      applyingUpdate = false;
    }
  };

  // Workbox only tracks workers whose `updatefound` it observes; the browser's own
  // navigation update check can leave a worker already installing before register().
  const applyWhenInstalled = (registration: ServiceWorkerRegistration): void => {
    const worker = registration.installing;
    if (!worker || worker === watchedWorker) return;
    watchedWorker = worker;
    worker.addEventListener('statechange', () => {
      if (worker.state !== 'installed' || registration.waiting !== worker) return;
      setUpdateAvailable(true);
      void applyBrowserUpdate();
    });
  };

  const handleWorkerControl = (): void => {
    const controller = serviceWorker?.controller;
    if (!controller) return;
    if (!controllerSeen) {
      controllerSeen = true;
      return;
    }
    if (!standalone || controller === approvedWorker) {
      reloadOnce();
      return;
    }
    reloadPending = true;
    setUpdateAvailable(true);
  };

  serviceWorker?.addEventListener('controllerchange', handleWorkerControl);

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => {
      setUpdateAvailable(true);
      void applyBrowserUpdate();
    },
    onNeedReload: handleWorkerControl,
    onRegisteredSW: (_swScriptUrl, registration) => {
      swRegistration = registration ?? null;
      if (standalone || !registration) return;
      applyWhenInstalled(registration);
      void registration
        .update()
        .then(() => {
          if (registration.waiting) {
            setUpdateAvailable(true);
            void applyBrowserUpdate();
            return;
          }
          // update() resolves as soon as the new worker starts installing, not when it waits.
          applyWhenInstalled(registration);
        })
        .catch((error: unknown) =>
          console.error('[Zeroed PWA] Immediate update check failed; using the current version.', error),
        );
    },
    onOfflineReady: () => console.info('[Zeroed PWA] Offline app shell is ready.'),
    onRegisterError: (error) => console.error('[Zeroed PWA] Service worker registration failed.', error),
  });

  const applyUpdate = async (): Promise<void> => {
    if (!updateAvailable || applyingUpdate) return;

    const safeMenuVisible = !mapSelect.classList.contains('hidden') || !pauseMenu.classList.contains('hidden');
    if (!safeMenuVisible) return;
    if (
      !pauseMenu.classList.contains('hidden') &&
      !window.confirm('Actualizar reiniciara la partida actual. Continuar?')
    ) {
      return;
    }

    if (reloadPending) {
      reloadOnce();
      return;
    }

    approvedWorker = swRegistration?.waiting ?? null;
    applyingUpdate = true;
    for (const updateButton of updateButtons) updateButton.disabled = true;
    try {
      await updateSW();
    } catch (error: unknown) {
      console.error('[Zeroed PWA] Could not apply the waiting update.', error);
    } finally {
      applyingUpdate = false;
      for (const updateButton of updateButtons) updateButton.disabled = false;
    }
  };

  for (const updateButton of updateButtons) {
    updateButton.addEventListener('click', () => void applyUpdate());
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    if (!profile.isMobile) return;
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    installButton.classList.toggle('hidden', isStandalone() || !profile.isMobile);
  });

  installButton.addEventListener('click', async () => {
    if (!profile.isMobile || !installPrompt || isStandalone()) return;
    const prompt = installPrompt;
    installPrompt = null;
    installButton.classList.add('hidden');
    await prompt.prompt();
    await prompt.userChoice;
  });

  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.classList.add('hidden');
  });
}
