import './style.css';
import { AssetManager, TEXTURE_MANIFEST, type AssetManifest } from './assets/AssetManager';
import { WEAPON_DEFINITIONS, WEAPON_ORDER } from './config/weapons';
import { getDeviceProfile } from './core/DeviceProfile';
import { Game } from './core/Game';
import { HUD } from './ui/HUD';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

const profile = getDeviceProfile();
console.info('[Zeroed boot] Device profile', profile.log);

const canvas = document.createElement('canvas');
const hasWebGL = !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
if (!hasWebGL) {
  const hud = new HUD();
  hud.setError('WebGL no está disponible en este navegador.');
  throw new Error('[Zeroed boot] WebGL is unavailable in this browser.');
}

const hud = new HUD();
const assets = new AssetManager(profile.anisotropyLimit);

const manifest: AssetManifest = {
  weapons: WEAPON_ORDER.flatMap((id) => {
    const url = WEAPON_DEFINITIONS[id].view.modelUrl;
    return url ? [{ id, url }] : [];
  }),
  textures: TEXTURE_MANIFEST,
};

try {
  // Individual asset failures degrade to procedural/flat fallbacks inside the
  // AssetManager, so loading always completes.
  await assets.loadAll(manifest, (loaded, total) => hud.setLoadProgress(loaded / total));
  hud.setReady();
  const game = new Game(container, hud, assets, profile);
  console.info('[Zeroed boot] Game initialized successfully.', {
    mobile: profile.isMobile,
    touch: profile.useTouchControls,
    pixelRatioLimit: profile.pixelRatioLimit,
  });
  void game;
} catch (error) {
  console.error('[Zeroed boot] Initialization failed.', error);
  hud.setError('La inicialización falló. Revisa la consola del navegador para más detalles.');
  throw error;
}
