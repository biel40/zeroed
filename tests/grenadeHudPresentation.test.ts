import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { grenadeCookDial, grenadeIcon } from '../src/ui/GrenadeHudPresentation';

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

  it('no longer shows the fire mode row and has the dial around the crosshair', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).not.toContain('id="hud-mode"');
    expect(html).toContain('id="grenade-cook"');
  });
});
