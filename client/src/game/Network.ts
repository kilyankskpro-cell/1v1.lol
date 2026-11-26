import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';
import { createLocalConnection } from './LocalServer';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const CONNECT_TIMEOUT_MS = 2500;

/**
 * Connexion même origine (en dev, Vite relaie /socket.io vers le serveur de jeu).
 * Sans internet ou si le serveur est injoignable, on bascule sur un serveur local
 * exécuté dans le navigateur.
 */
export function connect(forceOffline = false): Promise<{ socket: GameSocket; offline: boolean }> {
  const local = () => ({ socket: createLocalConnection(), offline: true });
  if (forceOffline || !navigator.onLine) return Promise.resolve(local());

  return new Promise((resolve) => {
    const socket: GameSocket = io({ transports: ['websocket'], timeout: CONNECT_TIMEOUT_MS });
    const fail = () => {
      socket.close();
      resolve(local());
    };
    socket.once('connect', () => resolve({ socket, offline: false }));
    socket.once('connect_error', fail);
  });
}
