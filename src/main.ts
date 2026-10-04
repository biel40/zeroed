import './style.css';
import { hasBetaAccess } from '../public/beta/access.js';
import { AssetManager, TEXTURE_MANIFEST, ZOMBIE_MANIFEST, type AssetManifest } from './assets/AssetManager';
import { MusicManager } from './audio/MusicManager';
import { isZombieMapId } from './config/zombieMaps';
import { WEAPON_DEFINITIONS, WEAPON_ORDER } from './config/weapons';
import { getDeviceProfile } from './core/DeviceProfile';
import { Game } from './core/Game';
import type { GameMode } from './modes/GameMode';
import { setupPWA } from './pwa';
import { ZombiesMode } from './modes/ZombiesMode';
import { CoopGuestMode } from './modes/coop/CoopGuestMode';
import { CoopHostMode } from './modes/coop/CoopHostMode';
import { CoopConnection } from './network/CoopConnection';
import { applyDocumentTranslations, t } from './i18n/i18n';
import { HUD } from './ui/HUD';

class ZeroedBoot {
  private readonly container: HTMLElement;
  private readonly profile: ReturnType<typeof getDeviceProfile>;
  private readonly hud: HUD;
  private readonly assets: AssetManager;
  private readonly music = new MusicManager();
  /** Lobby-owned socket; ownership moves to the co-op mode once a match starts. */
  private coopConnection: CoopConnection | null = null;
  private game: Game | null = null;

  public constructor() {
    const container = document.getElementById('app');
    if (!container) throw new Error('Missing #app container');

    this.container = container;
    this.profile = getDeviceProfile();
    this.hud = new HUD();
    this.assets = new AssetManager(this.profile.anisotropyLimit);
    this.music.setEnabled(true);
    this.music.startMenuLoop();

    // Browsers reject autoplay before the first interaction. Retrying in the
    // capture phase lets menu music begin on that gesture and still allows a
    // START click to switch it to gameplay music later in the same event.
    const unlockMenuMusic = (): void => {
      this.music.startMenuLoop();
      document.removeEventListener('pointerdown', unlockMenuMusic, true);
      document.removeEventListener('keydown', unlockMenuMusic, true);
    };
    document.addEventListener('pointerdown', unlockMenuMusic, { capture: true, once: true });
    document.addEventListener('keydown', unlockMenuMusic, { capture: true, once: true });
  }

  private static hasWebGL(): boolean {
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  }

  private async startGame(mode: GameMode): Promise<void> {
    this.hud.hideCoopLobby();
    this.game?.dispose();
    this.game = null;
    this.hud.showMapLoading();
    // Building the arena blocks the main thread, so the opaque overlay must
    // be painted first; its CSS animation keeps running on the compositor.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    try {
      const game: Game = new Game(this.container, this.hud, this.assets, this.profile, mode, this.music,
        () => this.onGameExited(game));
      this.game = game;
      await game.prepare();
      // A co-op partner may have ended the match while the GPU warmed up.
      if (this.game === game) this.hud.showStartScreen(false);
      this.hud.hideMapLoading();
    } catch (error: unknown) {
      this.hud.hideMapLoading(true);
      this.hud.setError(error instanceof Error ? t('start.initFailed', { message: error.message }) : t('start.initFailedGeneric'));
    }
  }

  private onGameExited(game: Game): void {
    if (this.game === game) this.game = null;
    this.showMapMenu();
  }

  private startCoopGame(role: 'host' | 'guest', connection: CoopConnection): void {
    if (this.coopConnection !== connection) return;
    // The mode now owns the socket and disposes it when the match is left.
    this.coopConnection = null;
    connection.onMessage = null;
    connection.onClose = null;
    void this.startGame(role === 'host' ? new CoopHostMode(connection) : new CoopGuestMode(connection));
  }

  private showMapMenu(): void {
    this.hud.showMapSelect((mapId) => void this.startGame(new ZombiesMode(mapId)));
  }

  private showCoopLobby(): void {
    const defaultServerUrl = import.meta.env.VITE_COOP_SERVER_URL?.trim()
      || (location.protocol === 'https:'
        ? `wss://${location.host}/multiplayer`
        : `ws://${location.hostname}:8787`);
    void this.assets.loadPlayerModel();
    this.hud.showCoopLobby(defaultServerUrl, {
      host: (url) => void this.connectCoop(url, 'host'),
      join: (url, code) => void this.connectCoop(url, 'guest', code),
      back: () => {
        this.coopConnection?.dispose();
        this.coopConnection = null;
        this.showMapMenu();
      },
    });
  }

  private async connectCoop(url: string, role: 'host' | 'guest', code = ''): Promise<void> {
    let connection: CoopConnection | null = null;
    let replacedConnection = false;
    try {
      this.hud.hideCoopRoomCode();
      const endpoint = new URL(url);
      if (endpoint.protocol !== 'ws:' && endpoint.protocol !== 'wss:') throw new Error(t('coop.invalidServer'));
      if (role === 'guest' && !/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error(t('coop.invalidCode'));
      this.coopConnection?.dispose();
      this.coopConnection = null;
      replacedConnection = true;
      endpoint.searchParams.set('role', role);
      if (role === 'guest') endpoint.searchParams.set('code', code);
      const activeConnection = new CoopConnection(endpoint.toString());
      connection = activeConnection;
      this.coopConnection = activeConnection;
      activeConnection.onClose = () => {
        if (this.coopConnection !== activeConnection) return;
        this.hud.hideCoopRoomCode();
        this.hud.setCoopStatus(t('coop.closed'));
      };
      activeConnection.onMessage = (message) => {
        // The relay's only error is an unavailable room; its text is not localized.
        if (message.type === 'error') this.hud.setCoopStatus(t('coop.roomUnavailable'));
        if (message.type === 'created') {
          this.hud.showCoopRoomCode(String(message.code));
          this.hud.setCoopStatus(t('coop.created'));
        }
        if (message.type === 'peerLeft' && role === 'host') {
          this.hud.setCoopStatus(t('coop.partnerLeft'));
          return;
        }
        const ready = (message.type === 'peerJoined' && role === 'host') || (message.type === 'joined' && role === 'guest');
        if (!ready) return;
        // The optional teammate model loads in the background; a slow asset
        // request must never hold the match or its first state packet.
        this.startCoopGame(role, activeConnection);
      };
      this.hud.setCoopStatus(t('coop.connecting'));
      await activeConnection.open();
      await activeConnection.checkRelay();
      if (this.coopConnection !== activeConnection) return;
      activeConnection.send(role === 'host' ? { type: 'create' } : { type: 'join', code });
    } catch (error) {
      if (connection && this.coopConnection !== connection) return;
      connection?.dispose();
      if (replacedConnection) this.coopConnection = null;
      this.hud.setCoopStatus(error instanceof Error ? error.message : t('coop.failed'));
    }
  }

  private async initialize(): Promise<void> {
    document.documentElement.classList.toggle('touch-controls-enabled', this.profile.useTouchControls);

    if (!ZeroedBoot.hasWebGL()) {
      this.hud.setError(t('start.noWebGL'));
      return;
    }

    const manifest: AssetManifest = {
      weapons: WEAPON_ORDER.flatMap((id) => {
        const url: string | undefined = WEAPON_DEFINITIONS[id].view.modelUrl;
        return url ? [{ id, url }] : [];
      }),
      textures: TEXTURE_MANIFEST,
      zombies: ZOMBIE_MANIFEST,
    };

    try {
      // Individual asset failures degrade to procedural/flat fallbacks inside the
      // AssetManager, so loading always completes.
      await this.assets.loadAll(manifest, (loaded, total) => this.hud.setLoadProgress(loaded / total));
      this.hud.setReady();
      this.hud.setCoopSelectHandler(() => this.showCoopLobby());

      const requestedMap = new URLSearchParams(window.location.search).get('map');
      if (isZombieMapId(requestedMap)) {
        void this.startGame(new ZombiesMode(requestedMap));
      } else {
        // Burned Mansion is the only Zombies arena.
        this.showMapMenu();
      }
    } catch (error: unknown) {
      this.hud.setError(error instanceof Error ? t('start.initFailed', { message: error.message }) : t('start.initFailedGeneric'));
    }
  }

  public async run(): Promise<void> {
    await this.initialize();
  }
}

applyDocumentTranslations();
async function boot(): Promise<void> {
  if (import.meta.env.VITE_BETA_ENABLED === 'true') {
    if (!hasBetaAccess()) {
      window.location.replace(`/beta/index.html${window.location.search}`);
      return;
    }
  } else {
    setupPWA();
  }
  await new ZeroedBoot().run();
}
void boot();
