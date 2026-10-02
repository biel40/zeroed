import { ca } from './ca';
import { en, type TranslationKey } from './en';
import { es } from './es';

export type { TranslationKey } from './en';

export const LANGUAGES = ['es', 'en', 'ca'] as const;
export type Language = (typeof LANGUAGES)[number];

const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { es, en, ca };
const NUMBER_LOCALES: Record<Language, string> = { es: 'es-ES', en: 'en-US', ca: 'ca-ES' };
const STORAGE_KEY = 'zeroed.language';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export function isTranslationKey(value: string): value is TranslationKey {
  return Object.hasOwn(en, value);
}

function storedLanguage(): Language | null {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

/** First supported browser language; English for anything else. */
function browserLanguage(): Language {
  const tags = globalThis.navigator?.languages ?? [];
  for (const tag of tags) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return 'en';
}

let current: Language = storedLanguage() ?? browserLanguage();
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

/** Changes the language, remembers it for later visits and re-renders static texts. */
export function setLanguage(language: Language): void {
  if (language === current) return;
  current = language;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, language);
  } catch { /* The choice still applies to this session. */ }
  applyDocumentTranslations();
  for (const listener of listeners) listener();
}

export function onLanguageChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Translated text with `{name}` placeholders filled from `params`. */
export function t(key: TranslationKey, params?: Readonly<Record<string, string | number>>): string {
  const template = DICTIONARIES[current][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

export function formatNumber(value: number): string {
  return value.toLocaleString(NUMBER_LOCALES[current]);
}

/**
 * Static markup declares its texts with `data-i18n` (text content) and
 * `data-i18n-<attribute>` (e.g. `data-i18n-aria-label`).
 */
export function applyDocumentTranslations(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = current;
  for (const element of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n;
    if (key && isTranslationKey(key)) element.textContent = t(key);
  }
  for (const attribute of ['aria-label', 'title']) {
    for (const element of document.querySelectorAll(`[data-i18n-${attribute}]`)) {
      const key = element.getAttribute(`data-i18n-${attribute}`);
      if (key && isTranslationKey(key)) element.setAttribute(attribute, t(key));
    }
  }
}
