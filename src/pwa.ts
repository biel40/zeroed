import { registerSW } from 'virtual:pwa-register';

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
  return window.matchMedia('(display-mode: standalone)').matches;
}

/** Browser-only PWA lifecycle. Gameplay state remains owned by Game. */
export function setupPWA(): void {
  const installButton = button('pwa-install');
  const menuUpdateButton = button('pwa-update-menu');
  const pauseUpdateButton = button('pwa-update-pause');
  const mapSelect = document.getElementById('map-select');
  const pauseMenu = document.getElementById('pause-menu');
  if (!mapSelect || !pauseMenu) throw new Error('Missing safe PWA update menus');
  const updateButtons = [menuUpdateButton, pauseUpdateButton];
  let installPrompt: InstallPromptEvent | null = null;
  let updateAvailable = false;
  let applyingUpdate = false;
  let reloadApproved = false;
  let reloadPending = false;

  const setUpdateAvailable = (available: boolean): void => {
    updateAvailable = available;
    for (const updateButton of updateButtons) updateButton.classList.toggle('hidden', !available);
  };

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => setUpdateAvailable(true),
    onNeedReload: () => {
      if (reloadApproved || !mapSelect.classList.contains('hidden')) window.location.reload();
      else {
        reloadPending = true;
        setUpdateAvailable(true);
      }
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

    reloadApproved = true;
    if (reloadPending) {
      window.location.reload();
      return;
    }

    applyingUpdate = true;
    for (const updateButton of updateButtons) updateButton.disabled = true;
    try {
      await updateSW();
    } catch (error: unknown) {
      applyingUpdate = false;
      for (const updateButton of updateButtons) updateButton.disabled = false;
      console.error('[Zeroed PWA] Could not apply the waiting update.', error);
    }
  };

  for (const updateButton of updateButtons) {
    updateButton.addEventListener('click', () => void applyUpdate());
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt = event as InstallPromptEvent;
    installButton.classList.toggle('hidden', isStandalone());
  });

  installButton.addEventListener('click', async () => {
    if (!installPrompt || isStandalone()) return;
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
