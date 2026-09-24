import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket } from 'ws';

const baseUrl = process.env.COOP_TEST_URL ?? 'ws://127.0.0.1:8787/multiplayer';

function nextMessage(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for Worker message')), 3000);
    socket.once('message', (bytes) => {
      clearTimeout(timer);
      resolve(JSON.parse(bytes.toString()));
    });
  });
}

test('Durable Object room creates, joins, relays and closes with the host', async (t) => {
  async function connect(role, code = '') {
    const url = new URL(baseUrl);
    url.searchParams.set('role', role);
    if (code) url.searchParams.set('code', code);
    const socket = new WebSocket(url);
    await once(socket, 'open');
    t.after(() => socket.terminate());
    return socket;
  }

  const host = await connect('host');
  host.send(JSON.stringify({ type: 'create' }));
  const { code } = await nextMessage(host);
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);

  const guest = await connect('guest', code);
  const joinedHost = nextMessage(host);
  guest.send(JSON.stringify({ type: 'join', code }));
  assert.deepEqual(await nextMessage(guest), { type: 'joined', code });
  assert.deepEqual(await joinedHost, { type: 'peerJoined' });

  await assert.rejects(connect('guest', code));
  const state = { t: 1, x: 1, y: 1.7, z: 4, yaw: 0, pitch: 0, floor: 0, weapon: 'm1911', ads: false, reloading: false };
  guest.send(JSON.stringify({ type: 'playerState', state }));
  assert.deepEqual(await nextMessage(host), { type: 'playerState', state });
  guest.send(JSON.stringify({ type: 'peerLeft' }));
  const matchState = { type: 'matchState', state: { round: 1, zombies: [] } };
  host.send(JSON.stringify(matchState));
  assert.deepEqual(await nextMessage(guest), matchState);

  const guestLeft = nextMessage(host);
  guest.close();
  assert.deepEqual(await guestLeft, { type: 'peerLeft' });

  const replacement = await connect('guest', code);
  const replacementJoinedHost = nextMessage(host);
  replacement.send(JSON.stringify({ type: 'join', code }));
  assert.deepEqual(await nextMessage(replacement), { type: 'joined', code });
  assert.deepEqual(await replacementJoinedHost, { type: 'peerJoined' });
  const replacementClosed = once(replacement, 'close');
  host.close();
  await replacementClosed;
});
