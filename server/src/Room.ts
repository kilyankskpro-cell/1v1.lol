/**
 * Une salle = une partie. Le serveur fait autorité sur :
 *  - les points de vie / bouclier, les éliminations, les manches et la fin de match,
 *  - les tirs (re-raycast serveur avec les mêmes fonctions que le client),
 *  - les constructions (unicité de l'emplacement, limites, matériaux, distance),
 *  - les éditions et destructions (ses propres pièces, toutes en mode illimité),
 *  - les bots (IA) et les cibles d'entraînement.
 * Les positions des humains sont envoyées par les clients puis validées (vitesse max, limites).
 *
 * La même classe tourne sur le serveur Node (Socket.io) et dans le navigateur
 * (mode local, voir client/src/game/LocalServer.ts).
 */
import type { Server, Socket } from 'socket.io';
import { createArena, type ArenaDef, type GameMode, type Spawn, type TargetDef } from '@shared/arena';
import {
  BUILD_COST,
  BUILD_MAX_DISTANCE,
  MAX_HEALTH,
  MAX_SHIELD,
  PLAYER,
  PLAYER_RESPAWN_MS,
  ROUNDS_TO_WIN,
  ROUND_RESTART_DELAY_MS,
  STARTING_MATERIALS,
  TARGET_RESPAWN_MS,
} from '@shared/constants';
import { emptyColliders, mergeColliders, type Colliders } from '@shared/geometry';
import { add, distance, isVec3, normalize, type Vec3 } from '@shared/math';
import type {
  BotDifficulty,
  ClientToServerEvents,
  EditMsg,
  FireMsg,
  PlayerKind,
  PublicPlayer,
  ServerToClientEvents,
  StateMsg,
} from '@shared/protocol';
import { raycastWorld, type HitTarget } from '@shared/raycast';
import {
  STRUCTURE_MAX_HP,
  isSpecInBounds,
  isValidEdit,
  isValidSpecShape,
  normalizeSpec,
  structureCenter,
  structureColliders,
  structureKey,
  type Structure,
  type StructureSpec,
} from '@shared/structures';
import { WEAPONS, WEAPON_ORDER, damageFalloff, isWeaponId, type WeaponId } from '@shared/weapons';
import { BotBrain, type BotWorld } from './Bot';

export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

interface ServerPlayer {
  id: string;
  name: string;
  kind: PlayerKind;
  /** null pour les bots et les cibles. */
  socket: GameSocket | null;
  spawnIndex: number;
  pos: Vec3;
  yaw: number;
  pitch: number;
  crouch: boolean;
  air: boolean;
  weapon: WeaponId;
  building: boolean;
  hp: number;
  shield: number;
  alive: boolean;
  materials: number;
  lastFire: Record<WeaponId, number>;
  lastStateAt: number;
  brain?: BotBrain;
  target?: TargetDef;
}

interface ServerStructure {
  data: Structure;
  colliders: Colliders;
}

interface ModeRules {
  unlimited: boolean;
  roundsToWin: number;
  bot: boolean;
  targets: boolean;
}

const RULES: Record<GameMode, ModeRules> = {
  duel: { unlimited: false, roundsToWin: ROUNDS_TO_WIN, bot: false, targets: false },
  bot: { unlimited: false, roundsToWin: ROUNDS_TO_WIN, bot: true, targets: false },
  training: { unlimited: true, roundsToWin: 0, bot: false, targets: true },
  freebuild: { unlimited: true, roundsToWin: 0, bot: false, targets: false },
};

const BOT_NAMES: Record<BotDifficulty, string> = { easy: 'Bot Recrue', normal: 'Bot Soldat', hard: 'Bot Élite' };
/** Pas de simulation des bots (s) : la physique reste stable quel que soit le tick réseau. */
const BOT_STEP = 1 / 60;

let roomCounter = 0;

export class Room {
  readonly id = `room-${++roomCounter}`;
  readonly arena: ArenaDef;
  readonly rules: ModeRules;
  readonly players = new Map<string, ServerPlayer>();
  private structures = new Map<string, ServerStructure>();
  private merged: Colliders | null = null;
  private scores: Record<string, number> = {};
  private kills: Record<string, number> = {};
  private round = 0;
  private matchOver = false;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private lastTick = Date.now();
  private botAcc = 0;
  private time = 0;

  constructor(
    private io: GameServer,
    readonly mode: GameMode,
    private difficulty: BotDifficulty = 'normal',
  ) {
    this.arena = createArena(mode);
    this.rules = RULES[mode];
  }

  get unlimited() {
    return this.rules.unlimited;
  }

  /** Nombre de joueurs humains connectés (les bots et cibles ne comptent pas). */
  get humanCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.kind === 'player') n++;
    return n;
  }

  private emitAll<E extends keyof ServerToClientEvents>(ev: E, ...args: Parameters<ServerToClientEvents[E]>) {
    const target = this.io.to(this.id) as unknown as { emit: (e: E, ...a: Parameters<ServerToClientEvents[E]>) => void };
    target.emit(ev, ...args);
  }

  // -------------------------------------------------------------------------
  // Cycle de vie des joueurs
  // -------------------------------------------------------------------------

  private createPlayer(id: string, name: string, kind: PlayerKind, socket: GameSocket | null, spawnIndex: number): ServerPlayer {
    return {
      id,
      name,
      kind,
      socket,
      spawnIndex,
      pos: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      crouch: false,
      air: false,
      weapon: 'ar',
      building: false,
      hp: MAX_HEALTH,
      shield: MAX_SHIELD,
      alive: false,
      materials: STARTING_MATERIALS,
      lastFire: Object.fromEntries(WEAPON_ORDER.map((w) => [w, 0])) as Record<WeaponId, number>,
      lastStateAt: Date.now(),
    };
  }

  addPlayer(socket: GameSocket, rawName: string) {
    const used = new Set([...this.players.values()].map((p) => p.spawnIndex));
    const name = rawName.replace(/[<>]/g, '').trim().slice(0, 16) || 'Joueur';
    const player = this.createPlayer(socket.id, name, 'player', socket, used.has(0) ? 1 : 0);
    this.players.set(player.id, player);
    this.scores[player.id] = 0;
    this.kills[player.id] = 0;
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
    socket.on('demolish', guard(this.onDemolish));
    socket.on('restart', () => guard(this.onRestart)(undefined));
    socket.on('latency', (ack) => typeof ack === 'function' && ack());

    if (this.rules.bot && ![...this.players.values()].some((p) => p.kind === 'bot')) this.addBot();
    if (this.rules.targets && ![...this.players.values()].some((p) => p.kind === 'target')) this.addTargets();

    socket.emit('joined', {
      selfId: player.id,
      mode: this.mode,
      unlimited: this.unlimited,
      roundsToWin: this.rules.roundsToWin,
      players: [...this.players.values()].map(toPublic),
      structures: [...this.structures.values()].map((s) => s.data),
    });

    // La manche (re)démarre à l'arrivée de chaque joueur ; seul en duel, on peut s'échauffer.
    this.startRound();
  }

  private addBot() {
    const bot = this.createPlayer(`bot-${this.id}`, BOT_NAMES[this.difficulty], 'bot', null, 1);
    bot.brain = new BotBrain(this.difficulty);
    bot.pos = bot.brain.motor.pos;
    this.players.set(bot.id, bot);
    this.scores[bot.id] = 0;
    this.kills[bot.id] = 0;
  }

  private addTargets() {
    this.arena.targets.forEach((t, i) => {
      const target = this.createPlayer(`target-${i}`, t.move ? 'Cible mobile' : 'Cible', 'target', null, -1);
      target.target = t;
      target.shield = 0;
      this.players.set(target.id, target);
    });
  }

  removePlayer(id: string) {
    if (!this.players.delete(id)) return;
    delete this.scores[id];
    delete this.kills[id];
    if (this.humanCount > 0) {
      for (const k of Object.keys(this.scores)) this.scores[k] = 0;
      this.emitAll('opponentLeft');
      this.matchOver = false;
      this.startRound();
    }
  }

  dispose() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private later(ms: number, fn: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }

  private spawnFor(p: ServerPlayer): Spawn {
    if (p.target) return p.target;
    return this.arena.spawns[p.spawnIndex % this.arena.spawns.length];
  }

  private resetPlayer(p: ServerPlayer) {
    const s = this.spawnFor(p);
    if (p.brain) {
      p.brain.reset(s);
      p.pos = p.brain.motor.pos;
    } else {
      p.pos = { x: s.x, y: s.y, z: s.z };
    }
    p.yaw = s.yaw;
    p.hp = MAX_HEALTH;
    p.shield = p.kind === 'target' ? 0 : MAX_SHIELD;
    p.alive = true;
    p.materials = STARTING_MATERIALS;
    p.lastStateAt = Date.now();
    return s;
  }

  /** Nouvelle manche : arène vidée, joueurs replacés et soignés. */
  private startRound() {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    this.round++;
    this.structures.clear();
    this.merged = null;
    const spawns: Record<string, Spawn> = {};
    for (const p of this.players.values()) spawns[p.id] = this.resetPlayer(p);
    this.emitAll('roundStart', { round: this.round, spawns, scores: this.scores, kills: this.kills });
  }

  private onRestart() {
    for (const k of Object.keys(this.scores)) this.scores[k] = 0;
    for (const k of Object.keys(this.kills)) this.kills[k] = 0;
    this.matchOver = false;
    this.startRound();
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
      p.socket?.emit('correct', { p: p.pos });
      return;
    }
    p.pos = { x: m.p.x, y: m.p.y, z: m.p.z };
    p.yaw = Number(m.yaw) || 0;
    p.pitch = Number(m.pitch) || 0;
    p.crouch = !!m.crouch;
    p.air = !!m.air;
    p.building = !!m.building;
    if (isWeaponId(m.weapon)) p.weapon = m.weapon;
  }

  // -------------------------------------------------------------------------
  // Combat : raycast autoritaire
  // -------------------------------------------------------------------------

  private eye(p: ServerPlayer): Vec3 {
    return add(p.pos, { x: 0, y: p.crouch ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight, z: 0 });
  }

  private structureCollidables() {
    return [...this.structures.values()].map((s) => ({ id: s.data.id, colliders: s.colliders }));
  }

  private onFire(p: ServerPlayer, m: FireMsg) {
    const w = isWeaponId(m?.weapon) ? WEAPONS[m.weapon] : null;
    if (this.matchOver || !p.alive || !w || !isVec3(m.origin) || !Array.isArray(m.dirs) || m.dirs.length === 0) return;

    // Cadence de tir (tolérance de 15 % pour la gigue réseau).
    const now = Date.now();
    if (now - p.lastFire[w.id] < w.fireInterval * 1000 * 0.85) return;
    p.lastFire[w.id] = now;

    // L'origine doit correspondre à la position connue du tireur.
    if (distance(m.origin, this.eye(p)) > 3) return;

    const targets: HitTarget[] = [...this.players.values()]
      .filter((o) => o.id !== p.id && o.alive)
      .map((o) => ({ id: o.id, feet: o.pos, crouch: o.crouch }));
    const structures = this.structureCollidables();

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

    const shot = { shooter: p.id, weapon: w.id, origin: m.origin, ends };
    // Le tireur humain a déjà affiché ses propres effets ; un bot n'a pas de client.
    if (p.socket) p.socket.to(this.id).emit('shot', shot);
    else this.emitAll('shot', shot);
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
    attacker.socket?.emit('hit', { target: target.id, damage: dmg, headshot, point });
    target.socket?.emit('hurt', { from: { ...attacker.pos }, damage: dmg });
    target.brain?.onDamaged(attacker.pos);
    if (target.hp > 0) return;

    target.alive = false;
    this.kills[attacker.id] = (this.kills[attacker.id] ?? 0) + 1;

    if (target.kind === 'target') {
      this.emitAll('died', { id: target.id, killer: attacker.id, scores: this.scores, kills: this.kills });
      this.later(TARGET_RESPAWN_MS, () => this.respawn(target));
      return;
    }
    if (this.rules.roundsToWin > 0) {
      this.scores[attacker.id] = (this.scores[attacker.id] ?? 0) + 1;
      this.emitAll('died', { id: target.id, killer: attacker.id, scores: this.scores, kills: this.kills });
      if (this.scores[attacker.id] >= this.rules.roundsToWin) {
        this.matchOver = true;
        this.emitAll('matchOver', { winner: attacker.id, scores: this.scores });
      } else {
        this.restartTimer = setTimeout(() => this.startRound(), ROUND_RESTART_DELAY_MS);
      }
      return;
    }
    this.emitAll('died', { id: target.id, killer: attacker.id, scores: this.scores, kills: this.kills });
    this.later(PLAYER_RESPAWN_MS, () => this.respawn(target));
  }

  /** Réapparition individuelle (cibles, modes sans manches) : les constructions restent. */
  private respawn(p: ServerPlayer) {
    if (!this.players.has(p.id)) return;
    const spawn = this.resetPlayer(p);
    this.emitAll('respawn', { id: p.id, spawn });
  }

  private damageStructure(id: string, amount: number) {
    const s = this.structures.get(id);
    if (!s) return;
    s.data.hp -= amount;
    if (s.data.hp <= 0) this.removeStructure(id, true);
    else this.emitAll('structureUpdated', { id, hp: s.data.hp, edit: s.data.edit });
  }

  private removeStructure(id: string, destroyed: boolean) {
    if (!this.structures.delete(id)) return;
    this.merged = null;
    this.emitAll('structureRemoved', { id, destroyed });
  }

  // -------------------------------------------------------------------------
  // Construction, édition, destruction
  // -------------------------------------------------------------------------

  /** Validation commune aux joueurs et aux bots. */
  private placeStructure(p: ServerPlayer, raw: unknown): boolean {
    if (!isValidSpecShape(raw)) return false;
    const spec = normalizeSpec(raw);
    const key = structureKey(spec);
    if (this.matchOver || !p.alive || this.structures.has(key) || !isSpecInBounds(spec, this.arena.halfSize)) return false;
    if (!this.unlimited && p.materials < BUILD_COST) return false;
    if (distance(structureCenter(spec), this.eye(p)) > BUILD_MAX_DISTANCE) return false;

    const maxHp = STRUCTURE_MAX_HP[spec.type];
    const data: Structure = { ...spec, id: key, hp: maxHp, maxHp, owner: p.id, edit: 0 };
    this.structures.set(key, { data, colliders: structureColliders(data) });
    this.merged = null;
    if (!this.unlimited) p.materials -= BUILD_COST;
    this.emitAll('structureAdded', data);
    return true;
  }

  private onBuild(p: ServerPlayer, raw: unknown) {
    if (!this.placeStructure(p, raw)) {
      const key = isValidSpecShape(raw) ? structureKey(normalizeSpec(raw)) : '';
      p.socket?.emit('buildRejected', { id: key });
    }
  }

  private canModify(p: ServerPlayer, s: ServerStructure) {
    return s.data.owner === p.id || this.unlimited;
  }

  private onEdit(p: ServerPlayer, m: EditMsg) {
    const s = this.structures.get(m?.id);
    if (!s || s.data.type !== 'wall' || !this.canModify(p, s) || !isValidEdit(m.edit)) return;
    s.data.edit = m.edit;
    s.colliders = structureColliders(s.data);
    this.merged = null;
    this.emitAll('structureUpdated', { id: s.data.id, hp: s.data.hp, edit: s.data.edit });
  }

  private onDemolish(p: ServerPlayer, m: { id: string }) {
    const s = this.structures.get(m?.id);
    if (!s || !p.alive || !this.canModify(p, s)) return;
    this.removeStructure(s.data.id, true);
  }

  // -------------------------------------------------------------------------
  // Simulation : bots, cibles mobiles, diffusion de l'état
  // -------------------------------------------------------------------------

  private colliders(): Colliders {
    if (!this.merged) {
      this.merged = mergeColliders(emptyColliders(), this.arena.colliders);
      for (const s of this.structures.values()) mergeColliders(this.merged, s.colliders);
    }
    return this.merged;
  }

  private botWorld(bot: ServerPlayer): BotWorld {
    return {
      halfSize: this.arena.halfSize,
      colliders: () => this.colliders(),
      lineOfSight: (from, to) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dz = to.z - from.z;
        const len = Math.hypot(dx, dy, dz) || 1;
        const hit = raycastWorld(from, { x: dx / len, y: dy / len, z: dz / len }, len, this.arena.colliders, this.structureCollidables(), []);
        return hit && hit.t < len - 0.2 ? { clear: false, structureId: hit.structureId, t: hit.t } : { clear: true, t: len };
      },
      getStructure: (key) => this.structures.get(key)?.data,
      build: (spec: StructureSpec) => this.placeStructure(bot, spec),
      fire: (weapon, origin, dirs) => this.onFire(bot, { weapon, origin, dirs }),
      materials: () => (this.unlimited ? Infinity : bot.materials),
    };
  }

  private updateBots(dt: number) {
    this.botAcc = Math.min(this.botAcc + dt, 0.25);
    while (this.botAcc >= BOT_STEP) {
      this.botAcc -= BOT_STEP;
      for (const p of this.players.values()) {
        if (!p.brain || !p.alive) continue;
        const enemy = [...this.players.values()].find((o) => o.kind === 'player' && o.alive && !this.matchOver);
        p.brain.update(BOT_STEP, enemy ? { id: enemy.id, pos: enemy.pos, crouch: enemy.crouch, alive: enemy.alive } : null, this.botWorld(p));
        p.yaw = p.brain.yaw;
        p.pitch = p.brain.pitch;
        p.weapon = p.brain.weapon;
        p.building = p.brain.building;
        p.air = !p.brain.motor.grounded;
        p.crouch = p.brain.motor.crouching;
      }
    }
  }

  private updateTargets() {
    for (const p of this.players.values()) {
      const t = p.target;
      if (!t || !p.alive || !t.move) continue;
      p.pos.x = t.x + Math.sin(this.time * (5 / t.move) + t.z) * t.move;
    }
  }

  /** Après une pause (mode local) : pas de rattrapage du temps écoulé. */
  resetClock() {
    this.lastTick = Date.now();
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.25, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.time += dt;
    if (this.humanCount === 0) return;
    this.updateBots(dt);
    this.updateTargets();
    this.emitAll('snapshot', { players: [...this.players.values()].map(toPublic) });
  }
}

function toPublic(p: ServerPlayer): PublicPlayer {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    p: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
    yaw: p.yaw,
    pitch: p.pitch,
    crouch: p.crouch,
    air: p.air,
    weapon: p.weapon,
    building: p.building,
    hp: p.hp,
    shield: p.shield,
    alive: p.alive,
    materials: p.materials,
  };
}
