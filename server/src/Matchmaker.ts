/**
 * Matchmaking :
 *  - Duel : rejoint la première salle duel qui n'a qu'un joueur humain, sinon en crée une.
 *  - Bot / Entraînement / Free Build : salle privée (un seul joueur humain).
 */
import { GAME_MODES, type GameMode } from '@shared/arena';
import { BOT_DIFFICULTIES, type BotDifficulty } from '@shared/protocol';
import { Room, type GameServer, type GameSocket } from './Room';

export class Matchmaker {
  private rooms = new Set<Room>();

  handleConnection(io: GameServer, socket: GameSocket) {
    let room: Room | null = null;

    socket.once('join', (msg) => {
      const mode: GameMode = GAME_MODES.includes(msg?.mode) ? msg.mode : 'duel';
      const difficulty: BotDifficulty = BOT_DIFFICULTIES.includes(msg?.difficulty as BotDifficulty)
        ? (msg.difficulty as BotDifficulty)
        : 'normal';
      room =
        (mode === 'duel' && [...this.rooms].find((r) => r.mode === 'duel' && r.humanCount < 2)) ||
        new Room(io, mode, difficulty);
      this.rooms.add(room);
      room.addPlayer(socket, String(msg?.name ?? ''));
      console.log(`[match] ${socket.id} → ${room.id} (${mode}, ${room.humanCount} joueur·s)`);
    });

    socket.on('disconnect', () => {
      if (!room) return;
      room.removePlayer(socket.id);
      if (room.humanCount === 0) {
        room.dispose();
        this.rooms.delete(room);
      }
    });
  }

  tick() {
    for (const room of this.rooms) room.tick();
  }
}
