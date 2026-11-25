import { randomInt } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { Match } from '../shared/match.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const WAIT_MS = 10 * 60 * 1000;
const MAX_ROOMS = 100;

const send = (socket, message) => {
  if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 96 * 1024) socket.send(JSON.stringify(message));
};

export function attachRooms(server) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 2048 });
  const rooms = new Map();
  const upgrade = (request, socket, head) => {
    if (request.url !== '/duel') return;
    // Requiring a same-origin browser prevents another site from opening rooms on visitors' behalf.
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    const origin = request.headers.origin;
    if (origin) {
      let match = false;
      try { match = new URL(origin).host === host || new URL(origin).host === process.env.DUEL_PUBLIC_HOST; }
      catch { /* Reject a malformed origin. */ }
      if (!match) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    }
    if (sockets.clients.size >= MAX_ROOMS * 2 + 30) { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return; }
    sockets.handleUpgrade(request, socket, head, (connection) => sockets.emit('connection', connection));
  };
  server.on('upgrade', upgrade);

  const closeRoom = (room, message, except) => {
    rooms.delete(room.code);
    for (const member of room.members) {
      if (member !== except) send(member, message);
    }
  };
  let tick = 0;
  const loop = setInterval(() => {
    tick++;
    const now = Date.now();
    for (const room of rooms.values()) {
      if (!room.match) {
        if (now - room.created > WAIT_MS) closeRoom(room, { type: 'error', message: 'Ce salon a expiré.' });
        continue;
      }
      room.activity.forEach((last, id) => {
        if (last && now - last > 350) {
          const { yaw, pitch, tool } = room.match.inputs[id];
          room.match.setInput(id, { yaw, pitch, tool });
          room.activity[id] = 0;
        }
      });
      room.match.update(1 / 60);
      if (tick % 3 === 0) {
        const message = { type: 'state', state: room.match.snapshot() };
        room.members.forEach((member) => send(member, message));
      }
    }
  }, 1000 / 60);
  loop.unref();
  const heartbeat = setInterval(() => {
    for (const socket of sockets.clients) {
      if (!socket.alive) socket.terminate();
      else { socket.alive = false; socket.ping(); }
    }
  }, 30000);
  heartbeat.unref();

  sockets.on('connection', (socket) => {
    let code;
    let id;
    const membership = () => {
      const room = rooms.get(code);
      return room?.members[id] === socket ? room : undefined;
    };
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });
    socket.on('error', () => socket.terminate());
    socket.on('close', () => {
      const room = membership();
      if (room) closeRoom(room, { type: 'left' }, socket);
    });
    socket.on('message', (data) => {
      let message;
      try { message = JSON.parse(data); } catch { return; }
      if (!message || typeof message !== 'object') return;
      const room = membership();
      if (message.type === 'input' && room?.match) {
        const now = Date.now();
        if (now - room.activity[id] >= 6) {
          room.activity[id] = now;
          room.match.setInput(id, message.input);
        }
      } else if (message.type === 'rematch' && room?.match?.phase === 'finished') {
        room.rematch.add(id);
        if (room.rematch.size === 2) {
          room.match = new Match('online');
          room.activity.fill(0);
          room.rematch.clear();
          room.members.forEach((member) => send(member, { type: 'start', state: room.match.snapshot() }));
        }
      } else if (message.type === 'create' && !room) {
        if (rooms.size >= MAX_ROOMS) return send(socket, { type: 'error', message: 'Tous les salons sont occupés. Réessaie dans un instant.' });
        do { code = Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(''); } while (rooms.has(code));
        id = 0;
        rooms.set(code, { code, created: Date.now(), members: [socket], match: null, activity: [0, 0], rematch: new Set() });
        send(socket, { type: 'joined', code, player: id });
      } else if (message.type === 'join' && !room) {
        const requested = typeof message.code === 'string' ? rooms.get(message.code.trim().toUpperCase()) : null;
        if (!requested || requested.members.length !== 1) return send(socket, { type: 'error', message: 'Salon introuvable ou déjà complet.' });
        code = requested.code;
        id = 1;
        requested.members.push(socket);
        requested.match = new Match('online');
        send(socket, { type: 'joined', code, player: id });
        requested.members.forEach((member) => send(member, { type: 'start', state: requested.match.snapshot() }));
      }
    });
  });

  return () => {
    clearInterval(loop);
    clearInterval(heartbeat);
    server.off('upgrade', upgrade);
    for (const socket of sockets.clients) socket.terminate();
    sockets.close();
  };
}
