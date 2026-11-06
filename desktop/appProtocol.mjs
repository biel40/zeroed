// Rules for the desktop app's own origin. Pure functions so they can be tested without Electron.
import path from 'node:path';

/** Privileged scheme that serves the Vite build; a stable secure origin keeps localStorage and fetch working. */
export const APP_SCHEME = 'app';
export const APP_HOST = 'zeroed';
export const APP_ENTRY_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

/** True for URLs served by the game itself. */
export function isAppUrl(url) {
  const parsed = parseUrl(url);
  return parsed !== null && parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST;
}

/** Links the game may hand to the system browser (credits, website, privacy). */
export function isExternalWebUrl(url) {
  const parsed = parseUrl(url);
  return parsed !== null && (parsed.protocol === 'https:' || parsed.protocol === 'http:');
}

/**
 * Maps a request on the app origin to a file inside `rootDir`. Returns null for other
 * origins, malformed paths or anything that would resolve outside `rootDir`.
 */
export function resolveAppFile(rootDir, requestUrl) {
  if (!isAppUrl(requestUrl)) return null;
  let relativePath;
  try {
    relativePath = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    return null;
  }
  if (relativePath.includes('\0')) return null;
  if (relativePath === '/' || relativePath === '') relativePath = '/index.html';
  const root = path.resolve(rootDir);
  const file = path.resolve(root, `.${relativePath}`);
  return file.startsWith(root + path.sep) ? file : null;
}

function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
