import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** Connexion même origine : en dev, Vite relaie /socket.io vers le serveur de jeu. */
export function connect(): GameSocket {
  return io({ transports: ['websocket'] });
}
