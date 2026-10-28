import { describe, expect, it } from 'vitest';
import { HUD } from '../src/ui/HUD';

class HudElement {
  public textContent = '';
  public readonly style = { opacity: '0' };
  public readonly offsetWidth = 0;
  private readonly classes = new Set<string>();
  public readonly classList = {
    add: (name: string): void => { this.classes.add(name); },
    remove: (name: string): void => { this.classes.delete(name); },
    contains: (name: string): boolean => this.classes.has(name),
    toggle: (name: string, enabled: boolean): void => {
      if (enabled) this.classes.add(name);
      else this.classes.delete(name);
    },
  };
}

function hudHarness(): { hud: HUD; element: (name: string) => HudElement } {
  const nodes = new Map<string, HudElement>();
  const element = (name: string): HudElement => {
    let node = nodes.get(name);
    if (!node) { node = new HudElement(); nodes.set(name, node); }
    return node;
  };
  const hud = Object.create(HUD.prototype) as HUD;
  for (const name of ['root', 'roundBanner', 'bannerTitle', 'bannerSub', 'ringFlash', 'protectionOverlay', 'damageOverlay', 'zPoints']) {
    Object.assign(hud, { [name]: element(name) });
  }
  Object.assign(hud, { lastProtection: 0 });
  return { hud, element };
}

describe('HUD between runs', () => {
  it.each(['recharged', 'activated'])('does not replay a ring %s announcement or flash when another map starts', (event) => {
    const { hud, element } = hudHarness();
    hud.setHudVisible(true);
    hud.showRoundBanner('RESURRECTION', event);
    if (event === 'activated') {
      hud.flashRing();
      hud.setProtection(0.8);
    }
    hud.flashDamage();
    hud.flashNotEnoughPoints();

    // The same HUD survives Game disposal and is revealed by the next map.
    hud.setHudVisible(false);
    hud.setHudVisible(true);
    expect(element('root').classList.contains('hidden')).toBe(false);
    for (const name of ['roundBanner', 'ringFlash', 'damageOverlay']) {
      expect(element(name).classList.contains('active')).toBe(false);
    }
    expect(element('zPoints').classList.contains('denied')).toBe(false);
    expect(element('bannerTitle').textContent).toBe('');
    expect(element('bannerSub').textContent).toBe('');
    expect(element('protectionOverlay').style.opacity).toBe('0');
    expect(element('damageOverlay').classList.contains('protected')).toBe(false);

    // A genuine activation in the next run still uses the same effects.
    hud.showRoundBanner('RESURRECTION', 'activated');
    hud.flashRing();
    hud.setProtection(0.8);
    expect(element('roundBanner').classList.contains('active')).toBe(true);
    expect(element('ringFlash').classList.contains('active')).toBe(true);
    expect(element('protectionOverlay').style.opacity).toBe('0.8');
  });

  it('keeps the current ring effects when the visible HUD is refreshed within the same run', () => {
    const { hud, element } = hudHarness();
    hud.flashRing();
    hud.setProtection(0.6);
    hud.setHudVisible(true);
    expect(element('ringFlash').classList.contains('active')).toBe(true);
    expect(element('protectionOverlay').style.opacity).toBe('0.6');
  });
});
