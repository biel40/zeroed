import { afterEach, describe, expect, it } from 'vitest';
import { isTranslationKey, LANGUAGES, setLanguage, t } from '../src/i18n/i18n';
import { resetSettings, updateSettings } from '../src/core/PlayerSettings';
import { actionKey, doorPrompt, wallBuyPrompt } from '../src/ui/InteractionPrompts';
import { bindInteractionPromptVisibility, interactionPromptContent } from '../src/ui/InteractionPromptView';
import { PointDoor } from '../src/zombies/doors/PointDoor';
import { STATION33_DOORS } from '../src/zombies/maps/Station33Config';

describe('interaction prompt presentation', () => {
  afterEach(() => { setLanguage('en'); resetSettings(); });

  it('applies prompt visibility immediately, including a previously saved disabled preference', () => {
    updateSettings({ showInteractionPrompts: false });
    const element = { hidden: false, textContent: 'REPAIR BARRICADE' } as HTMLElement;
    const stop = bindInteractionPromptVisibility(element);
    expect(element.hidden).toBe(true);
    updateSettings({ showInteractionPrompts: true });
    expect(element.hidden).toBe(false);
    updateSettings({ showInteractionPrompts: false });
    expect(element.hidden).toBe(true);
    expect(element.textContent).toBe('REPAIR BARRICADE');
    stop();
    updateSettings({ showInteractionPrompts: true });
    expect(element.hidden).toBe(true);
  });

  it.each(LANGUAGES)('separates the action and binding in %s on both input profiles', (language) => {
    setLanguage(language);
    for (const touch of [false, true]) {
      for (const hold of [false, true]) {
        const hint = actionKey(touch, hold);
        const content = interactionPromptContent(t('prompt.repairBarricade', { key: hint }));
        expect(content.title).toBeTruthy();
        expect(content.detail).toBe('');
        expect(`${content.action?.label} ${content.action?.key}`).toBe(hint);
      }
    }
  });

  it('keeps weapon, ammunition and price visible beside the correct action', () => {
    for (const owned of [false, true]) {
      const content = interactionPromptContent(wallBuyPrompt('M4A1', owned, { price: 1500, ammoPrice: 750 }, false));
      expect(content.title).toBe(owned ? 'M4A1 AMMO' : 'BUY M4A1');
      expect(content.detail).toBe(owned ? '750 PTS' : '1500 PTS');
      expect(content.action).toEqual({ label: 'Press', key: 'E' });
    }
  });

  it('preserves locked requirements and arbitrary labels without inventing a key', () => {
    const title = '<RAY GUN> — 6000';
    const detail = 'LOCKED — 80/200 kills';
    expect(interactionPromptContent(`${title}\n${detail}`)).toEqual({ title, detail, action: null });
    expect(interactionPromptContent('Press E prototype')).toEqual({ title: 'Press E prototype', detail: '', action: null });
    expect(interactionPromptContent('LABEL\nPress EXTRA')).toEqual({ title: 'LABEL', detail: 'Press EXTRA', action: null });
  });

  it('shows the actual desktop or touch binding for custom door actions', () => {
    const door = new PointDoor('bunker', 0, 0, 0, 1, { cost: 9999, prompt: 'door.openBunker' });
    expect(interactionPromptContent(doorPrompt(door, false)).action?.key).toBe('E');
    expect(interactionPromptContent(doorPrompt(door, true)).action?.key).toBe('USE');
  });

  it.each(LANGUAGES)('shows translated Station 33 destinations in %s', (language) => {
    setLanguage(language);
    for (const config of STATION33_DOORS) {
      const nameKey = `door.${config.id}`;
      expect(isTranslationKey(nameKey)).toBe(true);
      if (!isTranslationKey(nameKey)) continue;
      const door = new PointDoor(config.id, config.x, config.z, config.outwardX, config.outwardZ, { cost: config.cost });
      expect(doorPrompt(door, false)).toContain(t(nameKey));
      expect(doorPrompt(door, false)).toContain(`${config.cost} PTS`);
    }
  });
});
