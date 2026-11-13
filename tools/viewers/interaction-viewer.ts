import '../../src/style.css';
import { applyDocumentTranslations, isLanguage, setLanguage, t, type Language } from '../../src/i18n/i18n';
import { HUD, type ZombieHudState } from '../../src/ui/HUD';
import { actionKey, doorPrompt, wallBuyPrompt } from '../../src/ui/InteractionPrompts';
import { PointDoor } from '../../src/zombies/doors/PointDoor';

// The viewer uses the game's current markup, including its shared interaction
// column, combat HUD and touch controls, rather than keeping a second copy.
const response = await fetch('/index.html');
if (!response.ok) throw new Error(`Could not load the HUD template: ${response.status}`);
const template = new DOMParser().parseFromString(await response.text(), 'text/html');
for (const child of template.body.children) {
  if (child.tagName !== 'SCRIPT') document.body.append(document.importNode(child, true));
}
setLanguage('es');
applyDocumentTranslations();
const hud = new HUD();
hud.hideStartScreen();
hud.setHudVisible(true);
hud.setZombiesPanelVisible(true);
const state: ZombieHudState = {
  round: 2, hp: 75, maxHp: 75, lethalHitDamage: 25, kills: 15, headshots: 5,
  points: 800, totalPoints: 800, totalDamage: 1500, lamps: [false, false, false],
};

const prompt = document.getElementById('interact-prompt')!;
const notice = document.getElementById('hud-notice')!;
const sample = document.getElementById('sample') as HTMLSelectElement;
const noticeSample = document.getElementById('notice-sample') as HTMLSelectElement;
const language = document.getElementById('language') as HTMLSelectElement;
const scene = document.getElementById('scene') as HTMLSelectElement;
const touch = document.getElementById('touch') as HTMLInputElement;
const showPrompt = document.getElementById('show-prompt') as HTMLInputElement;
const door = new PointDoor('bunker', 0, 0, 0, 1, { cost: 9999, prompt: 'door.openBunker' });
// Deliberately long fixture text to exercise wrapping and the eight-second cap.
const longSamples: Record<Language, { title: string; detail: string }> = {
  es: { title: 'COMPRA NO CONFIRMADA', detail: 'No se ha podido confirmar la compra con el anfitrión. Comprueba tus puntos y vuelve a intentarlo cuando se restablezca la conexión de la partida.' },
  en: { title: 'PURCHASE NOT CONFIRMED', detail: 'The purchase could not be confirmed with the host. Check your points and try again once the connection to the match has been restored.' },
  ca: { title: 'COMPRA NO CONFIRMADA', detail: 'No s’ha pogut confirmar la compra amb l’amfitrió. Comprova els teus punts i torna-ho a provar quan es restableixi la connexió de la partida.' },
};

function showNotice(): void {
  switch (noticeSample.value) {
    case 'points':
      hud.showNotice('denied', t('banner.notEnoughPoints'), t('banner.pointsNeeded', { cost: door.cost }));
      break;
    case 'short': hud.showNotice('denied', t('banner.ammoFull')); break;
    case 'long': {
      const text = longSamples[isLanguage(language.value) ? language.value : 'es'];
      hud.showNotice('denied', text.title, text.detail);
      break;
    }
    default: notice.classList.remove('active');
  }
}

function render(): void {
  if (isLanguage(language.value)) setLanguage(language.value);
  document.documentElement.classList.toggle('touch-controls-enabled', touch.checked);
  document.body.dataset.scene = scene.value;
  applyDocumentTranslations();
  hud.updateZombies(state);
  const key = actionKey(touch.checked);
  let text: string;
  switch (sample.value) {
    case 'buy': case 'ammo':
      text = wallBuyPrompt('M4A1', sample.value === 'ammo', { price: 1500, ammoPrice: 750 }, touch.checked);
      break;
    case 'door': text = doorPrompt(door, touch.checked); break;
    case 'locked': text = t('prompt.weaponCaseLocked', { label: 'ZEUS-77 — 10000', kills: 143, required: 300 }); break;
    case 'pickup': text = t('prompt.takeWeapon', { key, weapon: 'ZEUS-77' }); break;
    case 'mask': text = t('prompt.wearGasMask', { key }); break;
    default: text = t('prompt.repairBarricade', { key: actionKey(touch.checked, true) });
  }
  hud.setInteractionPrompt(showPrompt.checked ? text : null);
}

for (const control of [sample, language, scene, touch]) control.addEventListener('change', render);
showPrompt.addEventListener('change', render);
language.addEventListener('change', showNotice);
noticeSample.addEventListener('change', showNotice);
document.getElementById('replay-notice')!.addEventListener('click', showNotice);
document.getElementById('replay')!.addEventListener('click', () => {
  if (!showPrompt.checked) return;
  prompt.classList.add('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => prompt.classList.remove('hidden')));
});
render();
showNotice();
