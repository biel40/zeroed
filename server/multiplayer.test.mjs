import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { WebSocket } from 'ws';

function nextMessage(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for relay message')), 3000);
    socket.once('message', (bytes) => {
      clearTimeout(timer);
      resolve(JSON.parse(bytes.toString()));
    });
  });
}

test('private room connects two players, forwards peer messages and rejects a third', async (t) => {
  const relay = spawn(process.execPath, ['server/multiplayer.mjs'], {
    cwd: process.cwd(), env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => relay.kill());
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Relay did not start')), 3000);
    relay.stdout.on('data', (bytes) => {
      const match = bytes.toString().match(/listening on :(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
    relay.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Relay exited: ${code}`)); });
  });
  const connect = async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    await once(socket, 'open');
    t.after(() => socket.close());
    return socket;
  };
  const host = await connect();
  host.send(JSON.stringify({ type: 'hello', version: 4 }));
  assert.deepEqual(await nextMessage(host), { type: 'relayReady', version: 4 });
  host.send(JSON.stringify({ type: 'create' }));
  const created = await nextMessage(host);
  assert.match(created.code, /^[A-HJ-NP-Z2-9]{6}$/);

  const guest = await connect();
  guest.send(JSON.stringify({ type: 'hello', version: 4 }));
  assert.deepEqual(await nextMessage(guest), { type: 'relayReady', version: 4 });
  const peerJoined = nextMessage(host);
  guest.send(JSON.stringify({ type: 'join', code: created.code }));
  assert.equal((await nextMessage(guest)).type, 'joined');
  assert.equal((await peerJoined).type, 'peerJoined');

  const third = await connect();
  third.send(JSON.stringify({ type: 'join', code: created.code }));
  assert.equal((await nextMessage(third)).type, 'error');

  const state = { t: 1, x: 1, y: 1.7, z: 4, yaw: 0, pitch: 0, floor: 0, weapon: 'm1911', ads: false, reloading: false };
  guest.send(JSON.stringify({ type: 'playerState', state }));
  assert.deepEqual(await nextMessage(host), { type: 'playerState', state });
  guest.send(JSON.stringify({ type: 'doorPurchase', doorId: 'to-dining' }));
  assert.deepEqual(await nextMessage(host), { type: 'doorPurchase', doorId: 'to-dining' });
  host.send(JSON.stringify({ type: 'doorOpened', doorId: 'to-dining', buyer: 'guest' }));
  assert.deepEqual(await nextMessage(guest), { type: 'doorOpened', doorId: 'to-dining', buyer: 'guest' });
  // Peers cannot forge relay presence messages; the next delivery is the real payload.
  guest.send(JSON.stringify({ type: 'peerLeft' }));
  const matchState = { type: 'matchState', state: { round: 1, zombies: [], openDoorIds: ['to-dining'] } };
  host.send(JSON.stringify(matchState));
  assert.deepEqual(await nextMessage(guest), matchState);
  guest.send(JSON.stringify({ type: 'ready' }));
  assert.deepEqual(await nextMessage(host), { type: 'ready' });

  const guestLeft = nextMessage(host);
  guest.close();
  assert.equal((await guestLeft).type, 'peerLeft');

  const replacement = await connect();
  replacement.send(JSON.stringify({ type: 'join', code: created.code }));
  assert.equal((await nextMessage(replacement)).type, 'joined');
  const replacementClosed = once(replacement, 'close');
  host.close();
  await replacementClosed;
});
