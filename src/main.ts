import './style.css';
import { AssetManager, TEXTURE_MANIFEST, ZOMBIE_MANIFEST, type AssetManifest } from './assets/AssetManager';
import { isZombieMapId } from './config/zombieMaps';
import { WEAPON_DEFINITIONS, WEAPON_ORDER } from './config/weapons';
import { getDeviceProfile } from './core/DeviceProfile';
import { Game } from './core/Game';
import type { GameMode } from './modes/GameMode';
import { setupPWA } from './pwa';
import { ZombiesMode } from './modes/ZombiesMode';
import { HUD } from './ui/HUD';

class ZeroedBoot {
  private readonly container: HTMLElement;
  private readonly profile: ReturnType<typeof getDeviceProfile>;
  private readonly hud: HUD;
  private readonly assets: AssetManager;

  public constructor() {
    const container = document.getElementById('app');
    if (!container) throw new Error('Missing #app container');

    this.container = container;
    this.profile = getDeviceProfile();
    this.hud = new HUD();
    this.assets = new AssetManager(this.profile.anisotropyLimit);
  }

  private static hasWebGL(): boolean {
    const canvas: HTMLCanvasElement = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  }

  private startGame(mode: GameMode): void {
    const game: Game = new Game(this.container, this.hud, this.assets, this.profile, mode);
    console.info('[Zeroed boot] Game initialized successfully.', {
      mode: mode.id,
      mobile: this.profile.isMobile,
      touch: this.profile.useTouchControls,
      pixelRatioLimit: this.profile.pixelRatioLimit,
    });
    this.hud.showStartScreen(false);
    void game;
  }

  private async initialize(): Promise<void> {
    document.documentElement.classList.toggle('touch-controls-enabled', this.profile.useTouchControls);
    console.info('[Zeroed boot] Device profile', this.profile.log);

    if (!ZeroedBoot.hasWebGL()) {
      this.hud.setError('WebGL no está disponible en este navegador.');
      throw new Error('[Zeroed boot] WebGL is unavailable in this browser.');
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

      const requestedMap = new URLSearchParams(window.location.search).get('map');
      if (isZombieMapId(requestedMap)) {
        this.startGame(new ZombiesMode(requestedMap));
      } else {
        // Zombies is the only game mode; the player chooses its arena directly.
        this.hud.showMapSelect((mapId) => this.startGame(new ZombiesMode(mapId)));
      }
    } catch (error: unknown) {
      console.error('[Zeroed boot] Initialization failed.', error);
      this.hud.setError('La inicialización falló. Revisa la consola del navegador para más detalles.');
      throw error;
    }
  }

  public async run(): Promise<void> {
    await this.initialize();
  }
}

setupPWA();
void new ZeroedBoot().run();
