import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { ca } from '../src/i18n/ca';
import { en } from '../src/i18n/en';
import { es } from '../src/i18n/es';
import { formatNumber, getLanguage, isTranslationKey, LANGUAGES, onLanguageChange, setLanguage, t } from '../src/i18n/i18n';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe('translations', () => {
  afterEach(() => setLanguage('en'));

  it.each([['es', es], ['ca', ca]] as const)('%s defines every English text with the same placeholders', (_, dictionary) => {
    for (const [key, text] of Object.entries(en)) {
      const translated = dictionary[key as keyof typeof en];
      expect(translated, key).toBeTruthy();
      expect(placeholders(translated), key).toEqual(placeholders(text));
    }
  });

  it('only references existing keys from the static markup', () => {
    const keys = [...html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((match) => match[1]);
    expect(keys.length).toBeGreaterThan(50);
    expect(keys.filter((key) => !isTranslationKey(key))).toEqual([]);
  });

  it('offers Spanish, English and Catalan from the main menu only', () => {
    expect(LANGUAGES).toEqual(['es', 'en', 'ca']);
    const mainMenu = html.slice(html.indexOf('<div id="map-select"'), html.indexOf('<dialog id="privacy-dialog"'));
    for (const language of LANGUAGES) expect(mainMenu).toContain(`data-language="${language}"`);
    expect(html.match(/data-language=/g)).toHaveLength(LANGUAGES.length);
  });

  it('switches language, fills placeholders and notifies listeners', () => {
    let changes = 0;
    const stop = onLanguageChange(() => changes++);
    setLanguage('ca');
    expect(getLanguage()).toBe('ca');
    expect(t('banner.round', { round: 7 })).toBe('RONDA 7');
    setLanguage('es');
    expect(t('prompt.repairBarricade', { key: t('prompt.hold') })).toBe('REPARAR BARRICADA\nMantén E');
    expect(formatNumber(1740)).toBe('1740');
    expect(formatNumber(12500)).toBe('12.500');
    setLanguage('es');
    stop();
    setLanguage('en');
    expect(changes).toBe(2);
    expect(t('banner.pointsNeeded', { cost: 950 })).toBe('950 PTS NEEDED');
  });
});
