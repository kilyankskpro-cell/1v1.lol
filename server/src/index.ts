/**
 * Serveur de jeu : HTTP minimal (healthcheck) + Socket.io.
 * Une boucle à SERVER_TICK_RATE Hz diffuse l'état de chaque salle.
 */
import http from 'node:http';
import { Server } from 'socket.io';
import { SERVER_TICK_RATE } from '@shared/constants';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';
import { Matchmaker } from './Matchmaker';

const PORT = Number(process.env.PORT ?? 3001);

const httpServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
const matchmaker = new Matchmaker();

io.on('connection', (socket) => matchmaker.handleConnection(io, socket));

setInterval(() => matchmaker.tick(), 1000 / SERVER_TICK_RATE);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] listening on :${PORT} (tick ${SERVER_TICK_RATE} Hz)`);
});
