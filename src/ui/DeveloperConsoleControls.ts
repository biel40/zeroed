import { WEAPON_DEFINITIONS } from '../config/weapons';
import { RING_DEFINITIONS } from '../game/rings/RingCatalog';
import { t } from '../i18n/i18n';

type RunAction = (command: string, label: string) => void;

/** Visual shortcuts share the console's validated command path. */
export function createDeveloperConsoleControls(run: RunAction): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'dev-controls';

  function card(title: string, description: string): HTMLElement {
    const section = document.createElement('section');
    section.className = 'dev-card';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const text = document.createElement('p');
    text.textContent = description;
    section.append(heading, text);
    grid.append(section);
    return section;
  }

  function button(label: string, action: () => void): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.addEventListener('click', action);
    return element;
  }

  function selection(items: Array<{ id: string; name: string }>, label: string): HTMLSelectElement {
    const select = document.createElement('select');
    select.setAttribute('aria-label', label);
    for (const { id, name } of items) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = name;
      select.append(option);
    }
    return select;
  }

  const weapons = card(t('dev.weapons'), t('dev.weapons.description'));
  const weaponSelect = selection(Object.values(WEAPON_DEFINITIONS), t('dev.weapons'));
  weapons.append(weaponSelect, button(t('dev.equip'), () => {
    run(`weapon ${weaponSelect.value}`, `${t('dev.equip')}: ${weaponSelect.selectedOptions[0].textContent}`);
  }));

  const rings = card(t('dev.perks'), t('dev.perks.description'));
  const ringSelect = selection(Object.values(RING_DEFINITIONS).map(({ id, nameKey }) => ({ id, name: t(nameKey) })),
    t('dev.perks'));
  const effect = document.createElement('p');
  effect.className = 'dev-effect';
  const updateEffect = (): void => {
    const ring = Object.values(RING_DEFINITIONS).find(({ id }) => id === ringSelect.value);
    effect.textContent = ring ? t(ring.descriptionKey) : '';
  };
  ringSelect.addEventListener('change', updateEffect);
  updateEffect();
  rings.append(ringSelect, effect, button(t('dev.grantPerk'), () => {
    run(`ring ${ringSelect.value}`, `${t('dev.grantPerk')}: ${ringSelect.selectedOptions[0].textContent}`);
  }));

  const ammo = card(t('dev.ammo'), t('dev.ammo.description'));
  ammo.append(
    button(t('dev.ammo.full'), () => run('ammo full', t('dev.ammo.full'))),
    button(t('dev.ammo.infinite'), () => run('ammo infinite', t('dev.ammo.infinite'))),
  );

  const damage = card(t('dev.damage'), t('dev.damage.description'));
  const multiplier = document.createElement('input');
  multiplier.type = 'number';
  multiplier.min = '1';
  multiplier.max = '100';
  multiplier.step = 'any';
  multiplier.required = true;
  multiplier.value = '2';
  multiplier.setAttribute('aria-label', t('dev.multiplier'));
  const label = document.createElement('label');
  label.textContent = t('dev.multiplier');
  label.append(multiplier);
  damage.append(label, button(t('dev.damage.apply'), () => {
    if (multiplier.reportValidity() && multiplier.value) {
      run(`damage ${multiplier.value}`, `${t('dev.damage.apply')} ×${multiplier.value}`);
    }
  }), button(t('dev.damage.reset'), () => {
    multiplier.value = '1';
    run('damage 1', t('dev.damage.reset'));
  }));

  const health = card(t('dev.invincible'), t('dev.invincible.description'));
  health.classList.add('dev-card-wide');
  health.append(
    button(t('dev.invincible.on'), () => run('invincible on', t('dev.invincible.on'))),
    button(t('dev.invincible.off'), () => run('invincible off', t('dev.invincible.off'))),
  );
  return grid;
}
