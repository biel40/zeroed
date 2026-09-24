import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket } from 'ws';

const baseUrl = process.env.COOP_TEST_URL ?? 'ws://127.0.0.1:8787/multiplayer';

function nextMessage(socket, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), 3000);
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
  host.send(JSON.stringify({ type: 'hello', version: 4 }));
  assert.deepEqual(await nextMessage(host, 'relayReady'), { type: 'relayReady', version: 4 });
  host.send(JSON.stringify({ type: 'create' }));
  const { code } = await nextMessage(host, 'created');
  assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);

  const guest = await connect('guest', code);
  guest.send(JSON.stringify({ type: 'hello', version: 4 }));
  assert.deepEqual(await nextMessage(guest, 'relayReady'), { type: 'relayReady', version: 4 });
  const joinedHost = nextMessage(host, 'peerJoined');
  guest.send(JSON.stringify({ type: 'join', code }));
  assert.deepEqual(await nextMessage(guest, 'joined'), { type: 'joined', code });
  assert.deepEqual(await joinedHost, { type: 'peerJoined' });

  await assert.rejects(connect('guest', code));
  const state = { t: 1, x: 1, y: 1.7, z: 4, yaw: 0, pitch: 0, floor: 0, weapon: 'm1911', ads: false, reloading: false };
  guest.send(JSON.stringify({ type: 'playerState', state }));
  assert.deepEqual(await nextMessage(host, 'playerState'), { type: 'playerState', state });
  guest.send(JSON.stringify({ type: 'peerLeft' }));
  const matchState = { type: 'matchState', state: { round: 1, zombies: [] } };
  host.send(JSON.stringify(matchState));
  assert.deepEqual(await nextMessage(guest, 'matchState'), matchState);

  const guestLeft = nextMessage(host, 'peerLeft');
  guest.close();
  assert.deepEqual(await guestLeft, { type: 'peerLeft' });

  const replacement = await connect('guest', code);
  const replacementJoinedHost = nextMessage(host, 'replacement peerJoined');
  replacement.send(JSON.stringify({ type: 'join', code }));
  assert.deepEqual(await nextMessage(replacement, 'replacement joined'), { type: 'joined', code });
  assert.deepEqual(await replacementJoinedHost, { type: 'peerJoined' });
  const replacementClosed = once(replacement, 'close');
  host.close();
  await replacementClosed;
});
