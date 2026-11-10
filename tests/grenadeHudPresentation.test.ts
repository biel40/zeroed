import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { grenadeCookDial, grenadeIcon, lethalPouchIcons } from '../src/ui/GrenadeHudPresentation';

describe('grenade HUD presentation', () => {
  it('empties the cooking dial with the fuse and warns in the last second', () => {
    expect(grenadeCookDial(3.6, 3.6)).toEqual({ remaining: 1, label: '3.6', urgent: false });
    expect(grenadeCookDial(1.8, 3.6).remaining).toBe(0.5);
    expect(grenadeCookDial(0.9, 3.6)).toMatchObject({ label: '0.9', urgent: true });
    expect(grenadeCookDial(-1, 3.6)).toEqual({ remaining: 0, label: '0.0', urgent: true });
  });

  it('draws the F-1 filled while carried and hollow once thrown', () => {
    expect(grenadeIcon(true)).toContain('class="lethal-pip full"');
    expect(grenadeIcon(false)).toContain('class="lethal-pip"');
    expect(grenadeIcon(true)).toContain('f1-groove');
  });

  it('marks only the grenades just recovered so the pouch can animate them', () => {
    const gained = (html: string): number => html.split('lethal-pip full gained').length - 1;
    expect(gained(lethalPouchIcons(3, 4, 2))).toBe(1);
    expect(lethalPouchIcons(3, 4, 2).indexOf('gained')).toBeGreaterThan(lethalPouchIcons(3, 4, 2).indexOf('full'));
    expect(gained(lethalPouchIcons(4, 4, 1))).toBe(3);
    expect(gained(lethalPouchIcons(1, 4, 2))).toBe(0);
    expect(gained(lethalPouchIcons(2, 4, null))).toBe(0);
    expect(lethalPouchIcons(2, 4, null).split('<svg').length - 1).toBe(4);
  });

  it('no longer shows the fire mode row and has the dial around the crosshair', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).not.toContain('id="hud-mode"');
    expect(html).toContain('id="grenade-cook"');
  });
});
