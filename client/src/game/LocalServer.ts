/**
 * Serveur de jeu exécuté dans le navigateur (mode hors ligne).
 * Réutilise tel quel le `Room` autoritaire du serveur ; seul le transport change :
 * une paire de sockets en mémoire remplace Socket.io.
 */
import { SERVER_TICK_RATE } from '@shared/constants';
import type { GameMode } from '@shared/arena';
import { Room, type GameServer, type GameSocket as ServerSocket } from '../../../server/src/Room';
import type { GameSocket } from './Network';

type Handler = (msg?: unknown) => void;

/** Émetteur minimal ; la livraison est asynchrone pour imiter le réseau. */
class Endpoint {
  private handlers = new Map<string, Handler[]>();
  peer!: Endpoint;

  constructor(readonly id: string) {}

  on(ev: string, fn: Handler) {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), fn]);
    return this;
  }

  once(ev: string, fn: Handler) {
    const wrapped: Handler = (msg) => {
      this.handlers.set(ev, (this.handlers.get(ev) ?? []).filter((h) => h !== wrapped));
      fn(msg);
    };
    return this.on(ev, wrapped);
  }

  emit(ev: string, msg?: unknown) {
    queueMicrotask(() => this.peer.dispatch(ev, msg));
    return true;
  }

  dispatch(ev: string, msg?: unknown) {
    for (const fn of this.handlers.get(ev) ?? []) fn(msg);
  }

  // API serveur utilisée par Room : un seul joueur, donc pas d'autres membres à qui diffuser.
  join() {}
  to() {
    return { emit: () => true };
  }
}

export function createLocalConnection(): GameSocket {
  const client = new Endpoint('local-player');
  const server = new Endpoint('local-player');
  client.peer = server;
  server.peer = client;

  // `io.to(room).emit` : la salle ne contient que le joueur local.
  const io = { to: () => ({ emit: (ev: string, msg?: unknown) => server.emit(ev, msg) }) };

  server.once('join', (msg) => {
    const m = msg as { mode?: GameMode; name?: string } | undefined;
    const room = new Room(io as unknown as GameServer, m?.mode === 'justbuild' ? 'justbuild' : 'duel');
    room.addPlayer(server as unknown as ServerSocket, String(m?.name ?? ''));
    setInterval(() => room.tick(), 1000 / SERVER_TICK_RATE);
  });

  return client as unknown as GameSocket;
}
