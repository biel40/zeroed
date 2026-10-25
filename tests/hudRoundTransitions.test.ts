import { afterEach, describe, expect, it, vi } from 'vitest';
import { HUD, type ZombieHudState } from '../src/ui/HUD';
import { roundMarks } from '../src/ui/SurvivalPresentation';

/** Only the DOM operations used by updateZombies, without the menu/renderer shell. */
class HudElement {
  textContent = '';
  style = { width: '' };
  classList = { toggle: vi.fn() };
  attributes = new Map<string, string>();
  htmlWrites = 0;
  private markup = '';

  get innerHTML(): string { return this.markup; }
  set innerHTML(value: string) { this.markup = value; this.htmlWrites++; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

function hudHarness(): { hud: HUD; round: HudElement; element: (id: string) => HudElement } {
  const nodes = new Map<string, HudElement>();
  const element = (id: string): HudElement => {
    let node = nodes.get(id);
    if (!node) { node = new HudElement(); nodes.set(id, node); }
    return node;
  };
  vi.stubGlobal('document', { getElementById: element });
  const hud = Object.create(HUD.prototype) as HUD;
  Object.assign(hud, {
    lastRound: -1, lastZombies: '', lastLamps: '',
    zRound: element('z-round'), zPoints: element('z-points'), zHpFill: element('z-hp-fill'),
    zKills: element('z-kills'), zHeadshots: element('z-headshots'), damageOverlay: element('damage-overlay'),
  });
  return { hud, round: element('z-round'), element };
}

function state(round: number, patch: Partial<ZombieHudState> = {}): ZombieHudState {
  return {
    round, hp: 75, maxHp: 75, lethalHitDamage: 25, kills: 15, headshots: 5,
    points: 800, totalPoints: 1000, totalDamage: 600, lamps: [false, false, false], ...patch,
  };
}

describe('HUD round transitions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([[0, 1], [9, 10], [10, 11], [49, 50]])('animates the advance from %i to %i with the correct count', (before, after) => {
    const { hud, round, element } = hudHarness();
    hud.updateZombies(state(before));
    expect(round.innerHTML).not.toContain('round-advancing');
    hud.updateZombies(state(after));
    expect(round.innerHTML).toContain('round-advancing');
    expect(round.innerHTML.match(/<i\b/g)).toHaveLength(after <= 10 ? after : 3);
    expect(round.innerHTML.match(/class="round-scratch-new"/g)).toHaveLength(after <= 10 ? 1 : 3);
    expect(round.attributes.get('aria-label')).toBe(`Round ${after}`);
    expect(element('pause-round').textContent).toBe(String(after));
    if (after > 10) expect(round.innerHTML).toContain(`>${after}</span>`);
  });

  it('does not recreate the round indicator when points, health or kills change', () => {
    const { hud, round, element } = hudHarness();
    hud.updateZombies(state(1));
    hud.updateZombies(state(2));
    const writes = round.htmlWrites;
    const markup = round.innerHTML;
    hud.updateZombies(state(2, { points: 950 }));
    hud.updateZombies(state(2, { hp: 50 }));
    hud.updateZombies(state(2, { kills: 16 }));
    expect(round.htmlWrites).toBe(writes);
    expect(round.innerHTML).toBe(markup);
    expect(element('z-kills').textContent).toBe('16');
  });

  it('clears the indicator on restart and animates the new first round', () => {
    const { hud, round } = hudHarness();
    hud.updateZombies(state(50));
    hud.updateZombies(state(0));
    expect(round.innerHTML).not.toContain('round-advancing');
    expect(round.innerHTML).not.toContain('round-number');
    expect(round.innerHTML).not.toContain('<i');
    hud.updateZombies(state(1));
    expect(round.innerHTML).toContain('round-advancing');
    expect(round.innerHTML.match(/<i\b/g)).toHaveLength(1);
  });

  it('renders an invalidated language cache without inventing a round advance', () => {
    const { hud, round } = hudHarness();
    hud.updateZombies(state(5));
    // Same invalidation performed by the HUD's language-change callback.
    Object.assign(hud, { lastRound: -1, lastZombies: '' });
    hud.updateZombies(state(5));
    expect(round.innerHTML).not.toContain('round-advancing');
    expect(round.innerHTML.match(/<i\b/g)).toHaveLength(5);
    hud.updateZombies(state(6));
    expect(round.innerHTML).toContain('round-advancing');
  });

  it('reveals only the newest tally and keeps high-round numerals exact', () => {
    expect(roundMarks(10, true)).toMatch(/<i class="round-scratch-new"><\/i><\/span>$/);
    expect(roundMarks(10, true).match(/class="round-scratch-new"/g)).toHaveLength(1);
    const high = roundMarks(12345, true);
    expect(high.match(/<i\b/g)).toHaveLength(3);
    expect(high).toContain('>12345</span>');
    expect(roundMarks(12345)).not.toContain('round-advancing');
  });
});
