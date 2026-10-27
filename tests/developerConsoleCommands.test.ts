import { describe, expect, it, vi } from 'vitest';
import { DeveloperConsoleCommands, type DeveloperConsoleActions } from '../src/game/DeveloperConsoleCommands';
import { WEAPON_DEFINITIONS } from '../src/config/weapons';
import { t } from '../src/i18n/i18n';

function actions(): DeveloperConsoleActions {
  return {
    equip: vi.fn(() => true), ring: vi.fn(() => true), refill: vi.fn(() => true),
    infiniteAmmo: vi.fn(), equipped: () => 'm1911', invincible: vi.fn(),
  };
}

describe('developer console commands', () => {
  it('lists the actual catalogs and accepts case-insensitive identifiers', () => {
    const commands = new DeveloperConsoleCommands();
    const target = actions();
    for (const id of Object.keys(WEAPON_DEFINITIONS)) {
      expect(commands.execute('weapons', target)).toContain(id);
      commands.execute(` WEAPON ${id.toUpperCase()} `, target);
      expect(target.equip).toHaveBeenLastCalledWith(id);
    }
    commands.execute('drink sleightofhand', target);
    expect(target.ring).toHaveBeenCalledWith('sleightOfHand');
    commands.execute('ring armor', target);
    expect(target.ring).toHaveBeenCalledWith('armor');
  });

  it.each(['damage', 'damage 0', 'damage -1', 'damage Infinity', 'damage NaN',
    'damage 101', 'damage 2 extra', 'weapon constructor', 'ring __proto__',
    'weapon nope', 'invincible maybe', 'ammo', 'ammo infinite extra', 'help extra'])
  ('rejects invalid input without side effects: %s', (line) => {
    const commands = new DeveloperConsoleCommands();
    const target = actions();
    expect(commands.execute(line, target)).toBe(t('dev.invalid'));
    expect(target.equip).not.toHaveBeenCalled();
    expect(target.ring).not.toHaveBeenCalled();
    expect(target.invincible).not.toHaveBeenCalled();
    expect(target.infiniteAmmo).not.toHaveBeenCalled();
    expect(commands.damageScale('m1911')).toBe(1);
  });

  it('sets damage per weapon without stacking or altering shared definitions; reset restores it', () => {
    const commands = new DeveloperConsoleCommands();
    const target = actions();
    const base = WEAPON_DEFINITIONS.m1911.damage;
    commands.execute('damage 3', target);
    commands.execute('damage 5', target);
    expect(commands.damageScale('m1911')).toBe(5);
    expect(commands.damageScale('raygun')).toBe(1);
    expect(WEAPON_DEFINITIONS.m1911.damage).toBe(base);
    commands.reset();
    expect(commands.damageScale('m1911')).toBe(1);
  });

  it('delegates ammo and invincibility and reports failed grants', () => {
    const commands = new DeveloperConsoleCommands();
    const target = actions();
    commands.execute('ammo full', target);
    commands.execute('ammo infinite', target);
    commands.execute('invincible off', target);
    expect(target.refill).toHaveBeenCalledOnce();
    expect(target.infiniteAmmo).toHaveBeenCalledOnce();
    expect(target.invincible).toHaveBeenCalledWith(false);
    target.equip = () => false;
    expect(commands.execute('weapon m1911', target)).toBe(t('dev.unavailable'));
  });
});
