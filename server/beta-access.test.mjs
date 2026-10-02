import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import nodemailer from 'nodemailer';
import { sendBetaEmail } from './beta-mail.mjs';
import { signToken, verifyToken, sessionEmail, SESSION_COOKIE, allowed, normalizeEmail } from './beta-access.mjs';
import middleware from '../middleware.js';
import handler from '../api/beta.mjs';

const originalEnv = { ...process.env };
beforeEach(() => {
  process.env.BETA_ENABLED = 'true';
  process.env.BETA_SESSION_SECRET = 'test-secret-with-at-least-thirty-two-characters';
  process.env.BETA_ALLOWED_EMAILS = 'tester@example.com; Other@example.com';
  process.env.BETA_SITE_URL = 'https://zeroed.example';
  process.env.BETA_GMAIL_APP_PASSWORD = 'test app password';
});
afterEach(() => { process.env = { ...originalEnv }; mock.restoreAll(); });

test('normalizes email and checks only exact entries in the private allowlist', () => {
  assert.equal(normalizeEmail(' TESTER@example.com '), 'tester@example.com');
  assert.equal(normalizeEmail('tester@example.com\nBcc: evil@example.com'), null);
  assert.equal(allowed('tester@example.com'), true);
  assert.equal(allowed('other@example.com'), true);
  assert.equal(allowed('fake-tester@example.com'), false);
});

test('rejects tampering, expiry, wrong purpose and revoked access', () => {
  const now = 100000;
  const token = signToken('tester@example.com', 'link', 60, now);
  assert.equal(verifyToken(token, 'link', now), 'tester@example.com');
  assert.equal(verifyToken(`${token}x`, 'link', now), null);
  assert.equal(verifyToken(token, 'session', now), null);
  assert.equal(verifyToken(token, 'link', now + 60000), null);
  process.env.BETA_ALLOWED_EMAILS = '';
  assert.equal(verifyToken(token, 'link', now), null);
});

test('middleware protects navigation, deep links and direct game assets', () => {
  for (const path of ['/', '/index.html?map=burned-mansion']) {
    const response = middleware(new Request(`https://zeroed.example${path}`));
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/beta.html');
  }
  for (const path of ['/assets/game.js', '/assets/zombies/zombie_walker.glb', '/sw.js']) {
    assert.equal(middleware(new Request(`https://zeroed.example${path}`)).status, 401);
  }
  assert.equal(middleware(new Request('https://zeroed.example/beta.html')).headers.get('x-middleware-next'), '1');
  process.env.BETA_ENABLED = 'false';
  assert.equal(middleware(new Request('https://zeroed.example/')).headers.get('x-middleware-next'), '1');
});

test('valid sessions authorize assets with private caching; links are not sessions', () => {
  const token = signToken('tester@example.com', 'session', 60);
  assert.equal(sessionEmail(`other=value; ${SESSION_COOKIE}=${token}`), 'tester@example.com');
  const response = middleware(new Request('https://zeroed.example/assets/game.js', { headers: { cookie: `${SESSION_COOKIE}=${token}` } }));
  assert.equal(response.headers.get('x-middleware-next'), '1');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(sessionEmail(`${SESSION_COOKIE}=${signToken('tester@example.com', 'link', 60)}`), null);
});

async function call(body, headers = {}, method = 'POST') {
  const res = { code: 200, headers: {}, data: null,
    setHeader(key, value) { this.headers[key] = value; },
    status(code) { this.code = code; return this; },
    json(data) { this.data = data; return this; } };
  await handler({ method, body, headers: { origin: 'https://zeroed.example', 'content-type': 'application/json', ...headers } }, res);
  return res;
}

test('unlisted email is denied without sending mail; requests go only to the owner', async () => {
  const sent = [];
  mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (message) => {
    sent.push(message);
    return { accepted: [message.to] };
  } }));
  assert.equal((await call({ action: 'login', email: 'visitor@example.com' })).data.status, 'denied');
  assert.equal(sent.length, 0);
  assert.equal((await call({ action: 'request', email: 'visitor@example.com' })).data.status, 'requested');
  assert.equal(sent[0].to, 'biel40aws@gmail.com');
  assert.equal(sent[0].replyTo, 'visitor@example.com');
  assert.equal((await call({}, { origin: 'https://evil.example' })).code, 403);
});

test('login sends a signed link; redemption creates a secure cookie and rejects bad tokens', async () => {
  let sent;
  mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (message) => {
    sent = message;
    return { accepted: [message.to] };
  } }));
  assert.equal((await call({ action: 'login', email: 'TESTER@example.com' })).data.status, 'sent');
  assert.equal(sent.to, 'tester@example.com');
  assert.equal(sent.from.address, 'biel40aws@gmail.com');
  assert.equal(sent.replyTo, 'biel40aws@gmail.com');
  const token = sent.text.match(/#access=([^\s]+)/)[1];
  const response = await call({ action: 'redeem', token });
  assert.equal(response.data.status, 'authorized');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(response.headers['Set-Cookie'].includes(flag));
  assert.equal((await call({ action: 'redeem', token: 'forged' })).code, 401);
});

test('missing credentials and delivery failures keep access closed', async () => {
  delete process.env.BETA_SESSION_SECRET;
  assert.equal((await call({ action: 'login', email: 'tester@example.com' })).code, 503);
  assert.equal(middleware(new Request('https://zeroed.example/assets/game.js')).status, 401);
  process.env.BETA_SESSION_SECRET = 'test-secret-with-at-least-thirty-two-characters';
  mock.method(nodemailer, 'createTransport', () => ({ sendMail: async () => { throw new Error('SMTP unavailable'); } }));
  assert.equal((await call({ action: 'login', email: 'tester@example.com' })).code, 503);
});

test('uses the landing Gmail SMTP settings and strips app-password whitespace', async () => {
  let settings;
  mock.method(nodemailer, 'createTransport', (options) => {
    settings = options;
    return { sendMail: async (message) => {
      assert.equal(message.disableFileAccess, true);
      assert.equal(message.disableUrlAccess, true);
      return { accepted: [message.to] };
    } };
  });
  await sendBetaEmail('login', 'tester@example.com', 'Test link');
  assert.equal(settings.host, 'smtp.gmail.com');
  assert.equal(settings.port, 465);
  assert.equal(settings.secure, true);
  assert.deepEqual(settings.auth, { user: 'biel40aws@gmail.com', pass: 'testapppassword' });
});

test('missing Gmail credentials and rejected recipients never report success', async () => {
  delete process.env.BETA_GMAIL_APP_PASSWORD;
  const transport = mock.method(nodemailer, 'createTransport', () => ({ sendMail: async () => ({ accepted: [] }) }));
  assert.equal((await call({ action: 'request', email: 'visitor@example.com' })).code, 503);
  assert.equal(transport.mock.callCount(), 0);
  process.env.BETA_GMAIL_APP_PASSWORD = 'test-password';
  assert.equal((await call({ action: 'request', email: 'visitor@example.com' })).code, 503);
  assert.equal((await call({ action: 'login', email: 'tester@example.com' })).code, 503);
});
