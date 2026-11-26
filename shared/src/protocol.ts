/**
 * Protocole réseau (Socket.io) — typé des deux côtés.
 *
 * Modèle "autoritaire léger" :
 *  - Le client simule son propre déplacement (zéro latence ressentie) et envoie
 *    son état 30x/s ; le serveur le valide (vitesse max, limites) et corrige si besoin.
 *  - Tirs, constructions, éditions, dégâts, bots et cibles sont décidés par le serveur.
 *    Le client prédit les constructions et les effets visuels, le serveur confirme ou annule.
 */
import type { GameMode, Spawn } from './arena';
import type { Vec3 } from './math';
import type { Structure, StructureSpec, WallEdit } from './structures';
import type { WeaponId } from './weapons';

export type BotDifficulty = 'easy' | 'normal' | 'hard';
export const BOT_DIFFICULTIES: BotDifficulty[] = ['easy', 'normal', 'hard'];
export const DIFFICULTY_LABELS: Record<BotDifficulty, string> = { easy: 'Facile', normal: 'Normal', hard: 'Difficile' };

/** player = humain, bot = adversaire IA, target = cible d'entraînement. */
export type PlayerKind = 'player' | 'bot' | 'target';

export interface JoinMsg {
  mode: GameMode;
  name: string;
  difficulty?: BotDifficulty;
}

export interface StateMsg {
  /** Numéro de manche : les états d'une manche précédente sont ignorés. */
  round: number;
  p: Vec3;
  yaw: number;
  pitch: number;
  crouch: boolean;
  /** En l'air (saut / chute) : sert à l'animation. */
  air: boolean;
  weapon: WeaponId;
  building: boolean;
}

export interface FireMsg {
  weapon: WeaponId;
  /** Origine du rayon (axe caméra projeté au niveau des yeux du tireur). */
  origin: Vec3;
  /** Une direction par plomb / balle. */
  dirs: Vec3[];
}

export interface EditMsg {
  id: string;
  edit: WallEdit;
}

export interface PublicPlayer {
  id: string;
  name: string;
  kind: PlayerKind;
  p: Vec3;
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
}

export interface JoinedMsg {
  selfId: string;
  mode: GameMode;
  unlimited: boolean;
  /** 0 = pas de match en manches (entraînement, free build). */
  roundsToWin: number;
  players: PublicPlayer[];
  structures: Structure[];
}

export interface RoundStartMsg {
  round: number;
  spawns: Record<string, Spawn>;
  scores: Record<string, number>;
  kills: Record<string, number>;
}

export interface ShotMsg {
  shooter: string;
  weapon: WeaponId;
  origin: Vec3;
  ends: Vec3[];
}

export interface HitMsg {
  target: string;
  damage: number;
  headshot: boolean;
  point: Vec3;
}

export interface HurtMsg {
  /** Position du tireur (indicateur de direction des dégâts). */
  from: Vec3;
  damage: number;
}

export interface DiedMsg {
  id: string;
  killer: string;
  scores: Record<string, number>;
  kills: Record<string, number>;
}

export interface MatchOverMsg {
  winner: string;
  scores: Record<string, number>;
}

export interface StructureUpdatedMsg {
  id: string;
  hp: number;
  edit: WallEdit;
}

export interface ClientToServerEvents {
  join: (msg: JoinMsg) => void;
  state: (msg: StateMsg) => void;
  fire: (msg: FireMsg) => void;
  build: (msg: StructureSpec) => void;
  edit: (msg: EditMsg) => void;
  /** Destruction instantanée d'une construction (la sienne, ou toutes en mode illimité). */
  demolish: (msg: { id: string }) => void;
  /** Recommencer : scores remis à zéro et nouvelle manche. */
  restart: () => void;
  /** Mesure du ping : le serveur rappelle immédiatement l'accusé de réception. */
  latency: (ack: () => void) => void;
}

export interface ServerToClientEvents {
  joined: (msg: JoinedMsg) => void;
  roundStart: (msg: RoundStartMsg) => void;
  snapshot: (msg: { players: PublicPlayer[] }) => void;
  structureAdded: (s: Structure) => void;
  /** destroyed = détruite (effet de destruction), sinon simple retrait. */
  structureRemoved: (msg: { id: string; destroyed: boolean }) => void;
  structureUpdated: (msg: StructureUpdatedMsg) => void;
  buildRejected: (msg: { id: string }) => void;
  shot: (msg: ShotMsg) => void;
  hit: (msg: HitMsg) => void;
  hurt: (msg: HurtMsg) => void;
  died: (msg: DiedMsg) => void;
  respawn: (msg: { id: string; spawn: Spawn }) => void;
  matchOver: (msg: MatchOverMsg) => void;
  correct: (msg: { p: Vec3 }) => void;
  opponentLeft: () => void;
}
