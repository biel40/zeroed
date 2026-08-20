import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const pwa = readFileSync(new URL('../src/pwa.ts', import.meta.url), 'utf8');

function pngSize(fileName: string): readonly [number, number] {
  const png = readFileSync(new URL(`../public/${fileName}`, import.meta.url));
  expect(png.toString('ascii', 1, 4)).toBe('PNG');
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

describe('PWA contract', () => {
  it('declares an installable landscape manifest for the production root', () => {
    expect(config).toContain("name: 'Zeroed'");
    expect(config).toContain("short_name: 'Zeroed'");
    expect(config).toContain("start_url: '/'");
    expect(config).toContain("scope: '/'");
    expect(config).toContain("display: 'standalone'");
    expect(config).toContain("orientation: 'landscape'");
  });

  it('ships correctly sized PNG and maskable icons', () => {
    expect(pngSize('pwa-192x192.png')).toEqual([192, 192]);
    expect(pngSize('pwa-512x512.png')).toEqual([512, 512]);
    expect(pngSize('maskable-icon-512x512.png')).toEqual([512, 512]);
    expect(config).toContain("purpose: 'maskable'");
  });

  it('keeps large game assets out of precache and handles them at runtime', () => {
    expect(config).toContain("globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}']");
    expect(config).not.toContain('maximumFileSizeToCacheInBytes');
    expect(config).toContain("cacheName: 'zeroed-textures'");
    expect(config).toContain("cacheName: 'zeroed-models'");
    expect(config).toContain("cacheName: 'zeroed-audio'");
    expect(config).toContain('rangeRequests: true');
  });

  it('requires a visible safe menu before applying a waiting update', () => {
    expect(config).toContain("registerType: 'prompt'");
    expect(config).toContain('skipWaiting: false');
    expect(pwa).toContain("onNeedRefresh: () => setUpdateAvailable(true)");
    expect(pwa).toContain('onNeedReload: () =>');
    expect(pwa).toContain("!mapSelect.classList.contains('hidden')");
    expect(pwa).toContain("!pauseMenu.classList.contains('hidden')");
    expect(pwa).toContain("window.confirm('Actualizar reiniciara la partida actual. Continuar?')");
    expect(pwa).toContain('await updateSW()');
  });

  it('keeps install and update actions hidden until supported or needed', () => {
    expect(html).toMatch(/id="pwa-install" class="pwa-action hidden"/);
    expect(html).toMatch(/id="pwa-update-menu" class="pwa-action hidden"/);
    expect(html).toMatch(/id="pwa-update-pause" class="hidden"/);
    expect(pwa).toContain("window.addEventListener('beforeinstallprompt'");
    expect(pwa).toContain("window.addEventListener('appinstalled'");
  });
});
