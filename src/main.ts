import './style.css';
import { AssetManager, TEXTURE_MANIFEST, type AssetManifest } from './assets/AssetManager';
import { WEAPON_DEFINITIONS, WEAPON_ORDER } from './config/weapons';
import { Game } from './core/Game';
import { HUD } from './ui/HUD';

const container = document.getElementById('app');
if (!container) throw new Error('Missing #app container');

const hud = new HUD();
const assets = new AssetManager();

const manifest: AssetManifest = {
  weapons: WEAPON_ORDER.flatMap((id) => {
    const url = WEAPON_DEFINITIONS[id].view.modelUrl;
    return url ? [{ id, url }] : [];
  }),
  textures: TEXTURE_MANIFEST,
};

// Individual asset failures degrade to procedural/flat fallbacks inside the
// AssetManager, so loading always completes.
await assets.loadAll(manifest, (loaded, total) => hud.setLoadProgress(loaded / total));
hud.setReady();

new Game(container, hud, assets);
