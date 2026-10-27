import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDeveloperConsoleControls } from '../src/ui/DeveloperConsoleControls';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { RING_DEFINITIONS } from '../src/game/rings/RingCatalog';
import { t } from '../src/i18n/i18n';

/** Minimal DOM for validating visible controls against their gameplay commands. */
class Element extends EventTarget {
  children: Element[] = [];
  textContent = '';
  value = '';
  classList = { add: vi.fn() };
  setAttribute = vi.fn();
  reportValidity = vi.fn(() => true);

  constructor(readonly tag: string) { super(); }

  append(...children: Element[]): void {
    this.children.push(...children);
    if (this.tag === 'select' && !this.value) this.value = children[0]?.value ?? '';
  }

  get selectedOptions(): Element[] { return this.children.filter((child) => child.value === this.value); }
}

function setup() {
  vi.stubGlobal('document', { createElement: (tag: string) => new Element(tag) });
  const run = vi.fn();
  const grid = createDeveloperConsoleControls(run) as unknown as Element;
  function descendants(node: Element): Element[] {
    return node.children.flatMap((child) => [child, ...descendants(child)]);
  }
  const nodes = descendants(grid);
  const click = (label: string): void => {
    const button = nodes.find((node) => node.tag === 'button' && node.textContent === label);
    expect(button, label).toBeDefined();
    button!.dispatchEvent(new Event('click'));
  };
  return { run, nodes, click };
}

afterEach(() => vi.unstubAllGlobals());

describe('visual developer controls', () => {
  it('lists every weapon and perk and applies the chosen item through existing commands', () => {
    const { nodes, run, click } = setup();
    const [weapons, rings] = nodes.filter((node) => node.tag === 'select');
    expect(weapons.children.map((node) => node.value)).toEqual(Object.keys(WEAPON_DEFINITIONS));
    expect(rings.children.map((node) => node.value)).toEqual(Object.keys(RING_DEFINITIONS));
    weapons.value = 'barrett';
    click(t('dev.equip'));
    expect(run).toHaveBeenLastCalledWith('weapon barrett', expect.stringContaining(WEAPON_DEFINITIONS.barrett.name));
    rings.value = 'armor';
    rings.dispatchEvent(new Event('change'));
    expect(nodes.some((node) => node.textContent === t(RING_DEFINITIONS.armor.descriptionKey))).toBe(true);
    click(t('dev.grantPerk'));
    expect(run).toHaveBeenLastCalledWith('ring armor', expect.stringContaining(t('ring.armor')));
  });

  it('provides direct ammo, damage, restore and protection actions without typing', () => {
    const { nodes, run, click } = setup();
    click(t('dev.ammo.full'));
    expect(run).toHaveBeenLastCalledWith('ammo full', t('dev.ammo.full'));
    click(t('dev.ammo.infinite'));
    expect(run).toHaveBeenLastCalledWith('ammo infinite', t('dev.ammo.infinite'));
    const multiplier = nodes.find((node) => node.tag === 'input')!;
    multiplier.value = '5';
    click(t('dev.damage.apply'));
    expect(run).toHaveBeenLastCalledWith('damage 5', expect.stringContaining('×5'));
    multiplier.reportValidity.mockReturnValueOnce(false);
    run.mockClear();
    click(t('dev.damage.apply'));
    expect(run).not.toHaveBeenCalled();
    click(t('dev.damage.reset'));
    expect(multiplier.value).toBe('1');
    expect(run).toHaveBeenLastCalledWith('damage 1', t('dev.damage.reset'));
    click(t('dev.invincible.off'));
    expect(run).toHaveBeenLastCalledWith('invincible off', t('dev.invincible.off'));
    click(t('dev.invincible.on'));
    expect(run).toHaveBeenLastCalledWith('invincible on', t('dev.invincible.on'));
  });
});
