/**
 * Une salle = une partie. Le serveur fait autorité sur :
 *  - les points de vie / bouclier et les éliminations,
 *  - les tirs (re-raycast serveur avec les mêmes fonctions que le client),
 *  - les constructions (unicité de l'emplacement, limites, matériaux, distance),
 *  - les éditions (seulement ses propres murs).
 * Les positions sont envoyées par les clients puis validées (vitesse max, limites de l'arène).
 */
import type { Server, Socket } from 'socket.io';
import { createArena, type ArenaDef, type GameMode, type Spawn } from '@shared/arena';
import {
  BUILD_COST,
  BUILD_MAX_DISTANCE,
  MAX_HEALTH,
  MAX_SHIELD,
  PLAYER,
  ROUND_RESTART_DELAY_MS,
  STARTING_MATERIALS,
} from '@shared/constants';
import type { Colliders } from '@shared/geometry';
import { add, distance, isVec3, normalize, type Vec3 } from '@shared/math';
import type {
  ClientToServerEvents,
  EditMsg,
  FireMsg,
  PublicPlayer,
  ServerToClientEvents,
  StateMsg,
} from '@shared/protocol';
import { raycastWorld, type HitTarget } from '@shared/raycast';
import {
  STRUCTURE_MAX_HP,
  WALL_EDIT_CYCLE,
  isSpecInBounds,
  isValidSpecShape,
  normalizeSpec,
  structureCenter,
  structureColliders,
  structureKey,
  type Structure,
} from '@shared/structures';
import { WEAPONS, damageFalloff, type WeaponId } from '@shared/weapons';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface ServerPlayer {
  id: string;
  name: string;
  socket: GameSocket;
  spawnIndex: number;
  pos: Vec3;
  yaw: number;
  pitch: number;
  crouch: boolean;
  weapon: WeaponId;
  building: boolean;
  hp: number;
  shield: number;
  alive: boolean;
  materials: number;
  lastFire: Record<WeaponId, number>;
  lastStateAt: number;
}

interface ServerStructure {
  data: Structure;
  colliders: Colliders;
}

let roomCounter = 0;

export class Room {
  readonly id = `room-${++roomCounter}`;
  readonly arena: ArenaDef;
  readonly players = new Map<string, ServerPlayer>();
  private structures = new Map<string, ServerStructure>();
  private scores: Record<string, number> = {};
  private round = 0;
  private restartTimer: NodeJS.Timeout | null = null;

  constructor(
    private io: GameServer,
    readonly mode: GameMode,
  ) {
    this.arena = createArena(mode);
  }

  /** JustBuild : munitions et matériaux illimités. */
  get unlimited() {
    return this.mode === 'justbuild';
  }

  // -------------------------------------------------------------------------
  // Cycle de vie des joueurs
  // -------------------------------------------------------------------------

  addPlayer(socket: GameSocket, rawName: string) {
    const used = new Set([...this.players.values()].map((p) => p.spawnIndex));
    const player: ServerPlayer = {
      id: socket.id,
      name: rawName.replace(/[<>]/g, '').trim().slice(0, 16) || 'Joueur',
      socket,
      spawnIndex: used.has(0) ? 1 : 0,
      pos: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      crouch: false,
      weapon: 'pickaxe',
      building: false,
      hp: MAX_HEALTH,
      shield: MAX_SHIELD,
      alive: false,
      materials: STARTING_MATERIALS,
      lastFire: { pickaxe: 0, shotgun: 0, ar: 0, sniper: 0 },
      lastStateAt: Date.now(),
    };
    this.players.set(player.id, player);
    this.scores[player.id] = 0;
    socket.join(this.id);

    // Chaque handler est protégé : un message malformé ne doit jamais faire tomber la salle.
    const guard =
      <T>(fn: (p: ServerPlayer, msg: T) => void) =>
      (msg: T) => {
        try {
          fn.call(this, player, msg);
        } catch (err) {
          console.warn(`[${this.id}] message rejeté de ${player.id}:`, err);
        }
      };
    socket.on('state', guard(this.onState));
    socket.on('fire', guard(this.onFire));
    socket.on('build', guard(this.onBuild));
    socket.on('edit', guard(this.onEdit));

    socket.emit('joined', {
      selfId: player.id,
      mode: this.mode,
      unlimited: this.unlimited,
      players: [...this.players.values()].map(toPublic),
      structures: [...this.structures.values()].map((s) => s.data),
    });

    // Duel : la manche (re)démarre à l'arrivée de chaque joueur ; seul, on peut s'échauffer.
    this.startRound();
  }

  removePlayer(id: string) {
    if (!this.players.delete(id)) return;
    delete this.scores[id];
    if (this.players.size > 0) {
      for (const k of Object.keys(this.scores)) this.scores[k] = 0;
      this.io.to(this.id).emit('opponentLeft');
      this.startRound();
    }
  }

  dispose() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
  }

  private spawnFor(p: ServerPlayer): Spawn {
    return this.arena.spawns[p.spawnIndex % this.arena.spawns.length];
  }

  /** Nouvelle manche : arène vidée, joueurs replacés et soignés. */
  private startRound() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.round++;
    this.structures.clear();
    const spawns: Record<string, Spawn> = {};
    for (const p of this.players.values()) {
      const s = this.spawnFor(p);
      p.pos = { x: s.x, y: s.y, z: s.z };
      p.yaw = s.yaw;
      p.hp = MAX_HEALTH;
      p.shield = MAX_SHIELD;
      p.alive = true;
      p.materials = STARTING_MATERIALS;
      p.lastStateAt = Date.now();
      spawns[p.id] = s;
    }
    this.io.to(this.id).emit('roundStart', { round: this.round, spawns, scores: this.scores });
  }

  // -------------------------------------------------------------------------
  // Déplacements (validation légère anti-téléportation / speedhack)
  // -------------------------------------------------------------------------

  private onState(p: ServerPlayer, m: StateMsg) {
    if (!p.alive || m?.round !== this.round || !isVec3(m.p)) return;
    const now = Date.now();
    const dt = Math.min(1, (now - p.lastStateAt) / 1000);
    const horiz = Math.hypot(m.p.x - p.pos.x, m.p.z - p.pos.z);
    const maxHoriz = PLAYER.sprintSpeed * dt * 1.5 + 1.5;
    const lim = this.arena.halfSize + 0.5;
    const inside =
      Math.abs(m.p.x) <= lim && Math.abs(m.p.z) <= lim && m.p.y > -5 && m.p.y < this.arena.wallHeight + 20;

    p.lastStateAt = now;
    if (horiz > maxHoriz || !inside) {
      p.socket.emit('correct', { p: p.pos });
      return;
    }
    p.pos = { x: m.p.x, y: m.p.y, z: m.p.z };
    p.yaw = Number(m.yaw) || 0;
    p.pitch = Number(m.pitch) || 0;
    p.crouch = !!m.crouch;
    p.building = !!m.building;
    if (m.weapon in WEAPONS) p.weapon = m.weapon;
  }

  // -------------------------------------------------------------------------
  // Combat : raycast autoritaire
  // -------------------------------------------------------------------------

  private eye(p: ServerPlayer): Vec3 {
    return add(p.pos, { x: 0, y: p.crouch ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight, z: 0 });
  }

  private onFire(p: ServerPlayer, m: FireMsg) {
    const w = WEAPONS[m?.weapon];
    if (!p.alive || !w || !isVec3(m.origin) || !Array.isArray(m.dirs) || m.dirs.length === 0) return;

    // Cadence de tir (tolérance de 15 % pour la gigue réseau).
    const now = Date.now();
    if (now - p.lastFire[w.id] < w.fireInterval * 1000 * 0.85) return;
    p.lastFire[w.id] = now;

    // L'origine doit correspondre à la position connue du tireur.
    if (distance(m.origin, this.eye(p)) > 3) return;

    const targets: HitTarget[] = [...this.players.values()]
      .filter((o) => o.id !== p.id && o.alive)
      .map((o) => ({ id: o.id, feet: o.pos, crouch: o.crouch }));
    const structures = [...this.structures.values()].map((s) => ({ id: s.data.id, colliders: s.colliders }));

    const playerDamage = new Map<string, { amount: number; headshot: boolean; point: Vec3 }>();
    const structureDamage = new Map<string, number>();
    const ends: Vec3[] = [];

    for (const raw of m.dirs.slice(0, w.pellets)) {
      if (!isVec3(raw)) continue;
      const d = normalize(raw);
      const hit = raycastWorld(m.origin, d, w.range, this.arena.colliders, structures, targets);
      ends.push(hit ? hit.point : add(m.origin, { x: d.x * w.range, y: d.y * w.range, z: d.z * w.range }));
      if (!hit) continue;

      if (hit.kind === 'player' && hit.playerId) {
        const dmg = w.damage * damageFalloff(w, hit.t) * (hit.headshot ? w.headshotMult : 1);
        const acc = playerDamage.get(hit.playerId) ?? { amount: 0, headshot: false, point: hit.point };
        acc.amount += dmg;
        acc.headshot ||= !!hit.headshot;
        playerDamage.set(hit.playerId, acc);
      } else if (hit.kind === 'structure' && hit.structureId) {
        structureDamage.set(hit.structureId, (structureDamage.get(hit.structureId) ?? 0) + w.structureDamage);
      }
    }

    p.socket.to(this.id).emit('shot', { shooter: p.id, weapon: w.id, origin: m.origin, ends });
    for (const [id, amount] of structureDamage) this.damageStructure(id, amount);
    for (const [id, d] of playerDamage) {
      const target = this.players.get(id);
      if (target) this.damagePlayer(target, p, d.amount, d.headshot, d.point);
    }
  }

  /** Le bouclier absorbe les dégâts en premier, puis la vie. */
  private damagePlayer(target: ServerPlayer, attacker: ServerPlayer, amount: number, headshot: boolean, point: Vec3) {
    if (!target.alive) return;
    const dmg = Math.round(amount);
    const absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    target.hp = Math.max(0, target.hp - (dmg - absorbed));
    attacker.socket.emit('hit', { target: target.id, damage: dmg, headshot, point });

    if (target.hp <= 0) {
      target.alive = false;
      this.scores[attacker.id] = (this.scores[attacker.id] ?? 0) + 1;
      this.io.to(this.id).emit('died', { id: target.id, killer: attacker.id, scores: this.scores });
      this.restartTimer = setTimeout(() => this.startRound(), ROUND_RESTART_DELAY_MS);
    }
  }

  private damageStructure(id: string, amount: number) {
    const s = this.structures.get(id);
    if (!s) return;
    s.data.hp -= amount;
    if (s.data.hp <= 0) {
      this.structures.delete(id);
      this.io.to(this.id).emit('structureRemoved', { id });
    } else {
      this.io.to(this.id).emit('structureUpdated', { id, hp: s.data.hp, edit: s.data.edit });
    }
  }

  // -------------------------------------------------------------------------
  // Construction & édition
  // -------------------------------------------------------------------------

  private onBuild(p: ServerPlayer, raw: unknown) {
    if (!isValidSpecShape(raw)) return;
    const spec = normalizeSpec(raw);
    const key = structureKey(spec);
    const reject = () => p.socket.emit('buildRejected', { id: key });

    if (!p.alive || this.structures.has(key) || !isSpecInBounds(spec, this.arena.halfSize)) return reject();
    if (!this.unlimited && p.materials < BUILD_COST) return reject();
    if (distance(structureCenter(spec), this.eye(p)) > BUILD_MAX_DISTANCE) return reject();

    const maxHp = STRUCTURE_MAX_HP[spec.type];
    const data: Structure = { ...spec, id: key, hp: maxHp, maxHp, owner: p.id, edit: 'none' };
    this.structures.set(key, { data, colliders: structureColliders(data) });
    if (!this.unlimited) p.materials -= BUILD_COST;
    this.io.to(this.id).emit('structureAdded', data);
  }

  private onEdit(p: ServerPlayer, m: EditMsg) {
    const s = this.structures.get(m?.id);
    if (!s || s.data.type !== 'wall' || s.data.owner !== p.id || !WALL_EDIT_CYCLE.includes(m.edit)) return;
    s.data.edit = m.edit;
    s.colliders = structureColliders(s.data);
    this.io.to(this.id).emit('structureUpdated', { id: s.data.id, hp: s.data.hp, edit: s.data.edit });
  }

  // -------------------------------------------------------------------------

  tick() {
    if (this.players.size === 0) return;
    this.io.to(this.id).emit('snapshot', { players: [...this.players.values()].map(toPublic) });
  }
}

function toPublic(p: ServerPlayer): PublicPlayer {
  return {
    id: p.id,
    name: p.name,
    p: p.pos,
    yaw: p.yaw,
    pitch: p.pitch,
    crouch: p.crouch,
    weapon: p.weapon,
    building: p.building,
    hp: p.hp,
    shield: p.shield,
    alive: p.alive,
    materials: p.materials,
  };
}
