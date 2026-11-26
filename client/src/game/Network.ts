import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@shared/protocol';
import { createLocalConnection, type LocalControls } from './LocalServer';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface Connection {
  socket: GameSocket;
  /** Partie simulée dans le navigateur (pas de serveur). */
  offline: boolean;
  /** Présent uniquement pour une partie locale (pause possible). */
  local: LocalControls | null;
}

const CONNECT_TIMEOUT_MS = 2500;

/**
 * - `local = true` (contre bot, entraînement, free build) : simulation dans le navigateur, zéro latence.
 * - Sinon (duel en ligne) : connexion même origine (Vite relaie /socket.io vers le serveur de jeu) ;
 *   si le serveur est injoignable, on bascule sur la simulation locale.
 */
export function connect(local: boolean): Promise<Connection> {
  const makeLocal = (): Connection => {
    const { socket, controls } = createLocalConnection();
    return { socket, offline: true, local: controls };
  };
  if (local || !navigator.onLine) return Promise.resolve(makeLocal());

  return new Promise((resolve) => {
    const socket: GameSocket = io({ transports: ['websocket'], timeout: CONNECT_TIMEOUT_MS });
    const fail = () => {
      socket.close();
      resolve(makeLocal());
    };
    socket.once('connect', () => resolve({ socket, offline: false, local: null }));
    socket.once('connect_error', fail);
  });
}
