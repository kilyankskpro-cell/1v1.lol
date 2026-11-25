/**
 * Matchmaking :
 *  - Duel : rejoint la première salle duel qui n'a qu'un joueur, sinon en crée une.
 *  - JustBuild : salle privée (un seul joueur, ressources illimitées).
 */
import type { GameMode } from '@shared/arena';
import { Room, type GameServer, type GameSocket } from './Room';

export class Matchmaker {
  private rooms = new Set<Room>();

  handleConnection(io: GameServer, socket: GameSocket) {
    let room: Room | null = null;

    socket.once('join', (msg) => {
      const mode: GameMode = msg?.mode === 'justbuild' ? 'justbuild' : 'duel';
      room =
        (mode === 'duel' && [...this.rooms].find((r) => r.mode === 'duel' && r.players.size < 2)) ||
        new Room(io, mode);
      this.rooms.add(room);
      room.addPlayer(socket, String(msg?.name ?? ''));
      console.log(`[match] ${socket.id} → ${room.id} (${mode}, ${room.players.size} joueur·s)`);
    });

    socket.on('disconnect', () => {
      if (!room) return;
      room.removePlayer(socket.id);
      if (room.players.size === 0) {
        room.dispose();
        this.rooms.delete(room);
      }
    });
  }

  tick() {
    for (const room of this.rooms) room.tick();
  }
}
