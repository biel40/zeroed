import '../../src/style.css';
import { isLanguage, setLanguage, t } from '../../src/i18n/i18n';
import { actionKey, doorPrompt, wallBuyPrompt } from '../../src/ui/InteractionPrompts';
import { bindInteractionPromptVisibility, renderInteractionPrompt } from '../../src/ui/InteractionPromptView';
import { PointDoor } from '../../src/zombies/doors/PointDoor';

const prompt = document.getElementById('interact-prompt')!;
const stopVisibility = bindInteractionPromptVisibility(prompt);
window.addEventListener('pagehide', stopVisibility, { once: true });
const sample = document.getElementById('sample') as HTMLSelectElement;
const language = document.getElementById('language') as HTMLSelectElement;
const scene = document.getElementById('scene') as HTMLSelectElement;
const touch = document.getElementById('touch') as HTMLInputElement;
const door = new PointDoor('bunker', 0, 0, 0, 1, { cost: 9999, prompt: 'door.openBunker' });

function render(): void {
  if (isLanguage(language.value)) setLanguage(language.value);
  document.documentElement.classList.toggle('touch-controls-enabled', touch.checked);
  document.body.dataset.scene = scene.value;
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
  renderInteractionPrompt(prompt, text);
}

for (const control of [sample, language, scene, touch]) control.addEventListener('change', render);
document.getElementById('replay')!.addEventListener('click', () => {
  prompt.classList.add('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => prompt.classList.remove('hidden')));
});
render();
