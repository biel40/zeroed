import '../../src/style.css';
import { applyDocumentTranslations, setLanguage } from '../../src/i18n/i18n';
import { HUD, type ZombieHudState } from '../../src/ui/HUD';

// Use the actual game markup and HUD controller; no second copy of the panel.
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
for (const child of document.getElementById('hud')!.children) {
  if (child instanceof HTMLElement && child.id !== 'hud-zombies') child.hidden = true;
}

let state: ZombieHudState = {
  round: 2, hp: 75, maxHp: 75, lethalHitDamage: 25, kills: 15, headshots: 5,
  points: 800, totalPoints: 800, totalDamage: 1500, lamps: [false, false, false],
};
const roundInput = document.getElementById('viewer-round') as HTMLInputElement;
const touchInput = document.getElementById('viewer-touch') as HTMLInputElement;

function showRound(round: number): void {
  if (!Number.isFinite(round)) return;
  state = { ...state, round: Math.max(0, Math.min(99999, Math.floor(round))) };
  roundInput.value = String(state.round);
  hud.updateZombies(state);
}

document.getElementById('viewer-apply')!.addEventListener('click', () => showRound(Number(roundInput.value)));
roundInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') showRound(Number(roundInput.value));
});
document.getElementById('viewer-next')!.addEventListener('click', () => showRound(state.round + 1));
document.getElementById('viewer-stats')!.addEventListener('click', () => {
  state = { ...state, points: state.points + 100, hp: state.hp === 75 ? 50 : 75 };
  hud.updateZombies(state);
});
touchInput.addEventListener('change', () => {
  document.documentElement.classList.toggle('touch-controls-enabled', touchInput.checked);
});
showRound(state.round);
