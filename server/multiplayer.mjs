import { createServer } from 'node:http';
import { randomInt } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const port = Number(process.env.PORT ?? 8787);
const rooms = new Map();
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const relayProtocolVersion = 2;

function roomCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

// The relay only pairs peers; the host validates every gameplay payload.
// Peers may never forge the relay's own lobby/presence messages.
const reservedTypes = new Set(['hello', 'create', 'join', 'relayReady', 'created', 'joined', 'peerJoined', 'peerLeft', 'error']);

function leave(socket) {
  const code = socket.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.roomCode = null;
  if (!room) return;
  if (room.host === socket) {
    send(room.guest, { type: 'peerLeft' });
    if (room.guest) {
      room.guest.roomCode = null;
      room.guest.close(1000, 'Host left');
    }
    rooms.delete(code);
  } else if (room.guest === socket) {
    room.guest = null;
    send(room.host, { type: 'peerLeft' });
  }
}

const server = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  response.end('Zeroed multiplayer relay\n');
});
const sockets = new WebSocketServer({ server, maxPayload: 32 * 1024 });
sockets.on('connection', (socket) => {
  socket.isAlive = true;
  socket.on('pong', () => { socket.isAlive = true; });
  socket.on('message', (bytes) => {
    let message;
    try { message = JSON.parse(bytes.toString()); } catch { return; }
    if (!message || typeof message.type !== 'string') return;
    const room = rooms.get(socket.roomCode);
    if (message.type === 'hello') {
      send(socket, { type: 'relayReady', version: relayProtocolVersion });
    } else if (message.type === 'create' && !socket.roomCode) {
      const code = roomCode();
      rooms.set(code, { host: socket, guest: null });
      socket.roomCode = code;
      send(socket, { type: 'created', code });
    } else if (message.type === 'join' && !socket.roomCode) {
      const target = rooms.get(String(message.code ?? '').toUpperCase());
      if (!target || target.guest) {
        send(socket, { type: 'error', message: 'Sala no disponible.' });
        return;
      }
      target.guest = socket;
      socket.roomCode = String(message.code).toUpperCase();
      send(socket, { type: 'joined', code: socket.roomCode });
      send(target.host, { type: 'peerJoined' });
    } else if (room && !reservedTypes.has(message.type)) {
      const peer = room.host === socket ? room.guest : room.guest === socket ? room.host : null;
      if (peer?.readyState === WebSocket.OPEN) peer.send(bytes.toString());
    }
  });
  socket.on('close', () => leave(socket));
  socket.on('error', () => leave(socket));
});

const heartbeat = setInterval(() => {
  for (const socket of sockets.clients) {
    if (!socket.isAlive) { socket.terminate(); continue; }
    socket.isAlive = false;
    socket.ping();
  }
}, 30_000);

server.on('close', () => clearInterval(heartbeat));
server.listen(port, () => console.info(`Zeroed relay listening on :${server.address().port}`));
