import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { APP_ENTRY_URL, isAppUrl, isExternalWebUrl, resolveAppFile } from './appProtocol.mjs';

const root = path.resolve('dist');

test('serves the entry page and build files from the root', () => {
  assert.equal(resolveAppFile(root, APP_ENTRY_URL), path.join(root, 'index.html'));
  assert.equal(resolveAppFile(root, 'app://zeroed/'), path.join(root, 'index.html'));
  assert.equal(resolveAppFile(root, 'app://zeroed/assets/audio/menu_theme.mp3?v=2'),
    path.join(root, 'assets', 'audio', 'menu_theme.mp3'));
  assert.equal(resolveAppFile(root, 'app://zeroed/assets/a%20b.png'), path.join(root, 'assets', 'a b.png'));
});

test('rejects other origins and paths that escape the root', () => {
  assert.equal(resolveAppFile(root, 'app://other/index.html'), null);
  assert.equal(resolveAppFile(root, 'https://zeroed/index.html'), null);
  // The URL parser collapses encoded dot segments at the origin root, so this stays inside.
  assert.equal(resolveAppFile(root, 'app://zeroed/%2e%2e/package.json'), path.join(root, 'package.json'));
  assert.equal(resolveAppFile(root, 'app://zeroed/..%2fpackage.json'), null);
  assert.equal(resolveAppFile(root, 'app://zeroed/..%5cpackage.json'), null);
  assert.equal(resolveAppFile(root, 'app://zeroed/index.html%00.png'), null);
  assert.equal(resolveAppFile(root, 'app://zeroed/%E0%A4%A'), null);
});

test('classifies in-app and external links', () => {
  assert.equal(isAppUrl('app://zeroed/index.html?map=station-33'), true);
  assert.equal(isAppUrl('https://zeroed.es/'), false);
  assert.equal(isExternalWebUrl('https://zeroed.es/privacy.html'), true);
  assert.equal(isExternalWebUrl('file:///C:/Windows/System32/calc.exe'), false);
  assert.equal(isExternalWebUrl('not a url'), false);
});
