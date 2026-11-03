import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { BANNER_PATH, buildLoginEmail, LOGO_PATH, type EmailLanguage } from '../cloudflare/api/src/loginEmail';

const APP_URL = 'https://www.zeroed.test';
const LINK = `${APP_URL}/#login=abc_DEF-123`;

function build(language: EmailLanguage): ReturnType<typeof buildLoginEmail> {
  return buildLoginEmail({ to: 'player@example.com', link: LINK, expiryMinutes: 15, language, appUrl: APP_URL });
}

describe('login email', () => {
  it('shows the game logo, the animated banner and a sign-in button to the link', () => {
    const { html } = build('en');
    expect(html).toContain(`src="${APP_URL}${LOGO_PATH}"`);
    expect(html).toContain(`src="${APP_URL}${BANNER_PATH}"`);
    expect(html).toContain('alt="Zeroed"');
    expect(html).toContain(`<a href="${LINK}"`);
    expect(html).toContain('>Sign in<');
  });

  it('repeats the link as text for clients that block the button', () => {
    const { html, text } = build('en');
    expect(html.split(LINK).length - 1).toBeGreaterThanOrEqual(2);
    expect(text).toContain(LINK);
  });

  it('is written in the player language, including its document language and preview text', () => {
    const spanish = build('es');
    expect(spanish.subject).toBe('Tu enlace para entrar en Zeroed');
    expect(spanish.html).toContain('<html lang="es"');
    expect(spanish.html).toContain('Iniciar sesión');
    expect(spanish.html).toContain('caduca en 15 minutos');
    expect(spanish.text).toContain('caduca en 15 minutos');

    const catalan = build('ca');
    expect(catalan.html).toContain('<html lang="ca"');
    expect(catalan.html).toContain('Inicia sessió');
  });

  it('keeps its look inline and adds CSS animations only as an extra that respects reduced motion', () => {
    const { html } = build('es');
    expect(html).not.toMatch(/<script|<link|<svg/i);
    expect(html).toContain('role="presentation"');
    expect(html).toContain('style="background:#121110;');
    expect(html).toContain('@keyframes');
    expect(html).toContain('prefers-reduced-motion:reduce');
  });

  it('points at banner and logo files that ship with the site', () => {
    expect(existsSync(new URL(`../public${BANNER_PATH}`, import.meta.url))).toBe(true);
    expect(existsSync(new URL(`../public${LOGO_PATH}`, import.meta.url))).toBe(true);
  });
});
