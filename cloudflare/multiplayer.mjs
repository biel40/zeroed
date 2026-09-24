import { DurableObject } from 'cloudflare:workers';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codePattern = /^[A-HJ-NP-Z2-9]{6}$/;
const maxMessageBytes = 32 * 1024;
const relayProtocolVersion = 2;

function randomRoomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

function send(socket, message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

// The relay only pairs peers; the host validates every gameplay payload.
// Peers may never forge the relay's own lobby/presence messages.
const reservedTypes = new Set(['hello', 'create', 'join', 'relayReady', 'created', 'joined', 'peerJoined', 'peerLeft', 'error']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/multiplayer') {
      return new Response('Zeroed multiplayer relay\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket required', { status: 426 });
    }

    const role = url.searchParams.get('role');
    if (role === 'guest') {
      const code = url.searchParams.get('code')?.toUpperCase() ?? '';
      if (!codePattern.test(code)) return new Response('Invalid room code', { status: 400 });
      return env.ROOMS.getByName(code).fetch(request);
    }
    if (role !== 'host') return new Response('Invalid room role', { status: 400 });

    // A room code determines its object. Retry if a code is already in use.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomRoomCode();
      const roomUrl = new URL(request.url);
      roomUrl.searchParams.set('code', code);
      const response = await env.ROOMS.getByName(code).fetch(new Request(roomUrl.toString(), request));
      if (response.status !== 409) return response;
    }
    return new Response('Could not create room', { status: 503 });
  },
};

export class CoopRoom extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get('role');
    const host = this.ctx.getWebSockets('host')[0];
    if (role === 'host' && host) return new Response('Room code in use', { status: 409 });
    if (role === 'guest' && (!host || this.ctx.getWebSockets('guest').length)) {
      return new Response('Room unavailable', { status: 409 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ code: url.searchParams.get('code'), role, joined: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket, bytes) {
    if (typeof bytes !== 'string' || bytes.length > maxMessageBytes) return;
    let message;
    try { message = JSON.parse(bytes); } catch { return; }
    if (!message || typeof message.type !== 'string') return;

    const host = this.ctx.getWebSockets('host')[0];
    const guest = this.ctx.getWebSockets('guest')[0];
    const isHost = socket === host;
    const isGuest = socket === guest;
    const attachment = socket.deserializeAttachment();
    if (!attachment) return;

    if (message.type === 'hello') {
      send(socket, { type: 'relayReady', version: relayProtocolVersion });
    } else if (message.type === 'create' && isHost && !attachment.joined) {
      socket.serializeAttachment({ ...attachment, joined: true });
      send(socket, { type: 'created', code: attachment.code });
    } else if (message.type === 'join' && isGuest && !attachment.joined &&
      message.code?.toUpperCase() === attachment.code && host) {
      socket.serializeAttachment({ ...attachment, joined: true });
      send(socket, { type: 'joined', code: attachment.code });
      send(host, { type: 'peerJoined' });
    } else if (attachment.joined && !reservedTypes.has(message.type)) {
      const peer = isHost ? guest : isGuest ? host : null;
      const peerJoined = peer?.deserializeAttachment()?.joined;
      if (peer && peerJoined && peer.readyState === WebSocket.OPEN) peer.send(bytes);
    }
  }

  webSocketClose(socket) {
    this.leave(socket);
  }

  webSocketError(socket) {
    this.leave(socket);
  }

  leave(socket) {
    const role = socket.deserializeAttachment()?.role;
    if (role === 'host') {
      const guest = this.ctx.getWebSockets('guest')[0];
      send(guest, { type: 'peerLeft' });
      guest?.close(1000, 'Host left');
    } else if (role === 'guest') {
      send(this.ctx.getWebSockets('host')[0], { type: 'peerLeft' });
    }
    try { socket.close(1000, 'Disconnected'); } catch { /* Already closed. */ }
  }
}
