/**
 * Serveur de jeu exécuté dans le navigateur (modes contre bot, entraînement,
 * free build, et duel hors ligne). Réutilise tel quel le `Room` autoritaire du
 * serveur ; seul le transport change : une paire de sockets en mémoire remplace Socket.io.
 * Contrairement au réseau, la partie locale peut être mise en pause.
 */
import { SERVER_TICK_RATE } from '@shared/constants';
import { GAME_MODES, type GameMode } from '@shared/arena';
import { BOT_DIFFICULTIES, type BotDifficulty } from '@shared/protocol';
import { Room, type GameServer, type GameSocket as ServerSocket } from '../../../server/src/Room';
import type { GameSocket } from './Network';

type Handler = (msg?: unknown) => void;

/** Émetteur minimal ; la livraison est asynchrone pour imiter le réseau. */
class Endpoint {
  private handlers = new Map<string, Handler[]>();
  peer!: Endpoint;
  closed = false;

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
    if (this.closed) return false;
    queueMicrotask(() => !this.peer.closed && this.peer.dispatch(ev, msg));
    return true;
  }

  dispatch(ev: string, msg?: unknown) {
    for (const fn of this.handlers.get(ev) ?? []) fn(msg);
  }

  // API serveur utilisée par Room : un seul humain, donc pas d'autres membres à qui diffuser.
  join() {}
  to() {
    return { emit: () => true };
  }
}

export interface LocalControls {
  setPaused(paused: boolean): void;
}

export function createLocalConnection(): { socket: GameSocket; controls: LocalControls } {
  const client = new Endpoint('local-player');
  const server = new Endpoint('local-player');
  client.peer = server;
  server.peer = client;
  let room: Room | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let paused = false;

  // `io.to(room).emit` : la salle ne contient que le joueur local.
  const io = { to: () => ({ emit: (ev: string, msg?: unknown) => server.emit(ev, msg) }) };

  server.once('join', (msg) => {
    const m = msg as { mode?: GameMode; name?: string; difficulty?: BotDifficulty } | undefined;
    const mode = m?.mode && GAME_MODES.includes(m.mode) ? m.mode : 'duel';
    const difficulty = m?.difficulty && BOT_DIFFICULTIES.includes(m.difficulty) ? m.difficulty : 'normal';
    room = new Room(io as unknown as GameServer, mode, difficulty);
    room.addPlayer(server as unknown as ServerSocket, String(m?.name ?? ''));
    interval = setInterval(() => {
      if (!paused) room?.tick();
    }, 1000 / SERVER_TICK_RATE);
  });

  // `disconnect()` comme sur un vrai socket : arrête la simulation locale.
  Object.assign(client, {
    disconnect() {
      if (interval) clearInterval(interval);
      room?.dispose();
      client.closed = server.closed = true;
    },
  });

  return {
    socket: client as unknown as GameSocket,
    controls: {
      setPaused(p: boolean) {
        paused = p;
        // Au retour de pause, on évite un énorme pas de temps.
        if (!p) room?.resetClock();
      },
    },
  };
}
