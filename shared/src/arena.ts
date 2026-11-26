/**
 * Définition des cartes :
 *  - duel / bot : plateforme 64x64 dans l'espace (bords bloqués par des murs invisibles),
 *                 deux spawns opposés séparés par une double rampe en V.
 *  - training   : grand terrain avec plateformes, caisses et cibles (fixes et mobiles).
 *  - freebuild  : grand terrain plat pour construire librement.
 */
import { GRID } from './constants';
import { emptyColliders, type Colliders } from './geometry';

export type GameMode = 'duel' | 'bot' | 'training' | 'freebuild';
export const GAME_MODES: GameMode[] = ['duel', 'bot', 'training', 'freebuild'];

export const MODE_LABELS: Record<GameMode, string> = {
  duel: 'DUEL EN LIGNE',
  bot: '1V1 CONTRE BOT',
  training: 'ENTRAÎNEMENT',
  freebuild: 'FREE BUILD',
};

export interface Spawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

/** Cible d'entraînement : `move` = amplitude (m) d'un va-et-vient sur l'axe X (0 = fixe). */
export interface TargetDef extends Spawn {
  move: number;
}

export interface ArenaDef {
  mode: GameMode;
  /** Demi-côté de la zone jouable (multiple de GRID). */
  halfSize: number;
  wallHeight: number;
  spawns: Spawn[];
  targets: TargetDef[];
  /** Géométrie statique (sol, murs d'enceinte, décor). */
  colliders: Colliders;
}

export function createArena(mode: GameMode): ArenaDef {
  const duelMap = mode === 'duel' || mode === 'bot';
  const halfSize = duelMap ? 32 : 64;
  const wallHeight = duelMap ? 44 : 48;
  const h = halfSize;
  const c = emptyColliders();

  // Sol (dessus à y = 0) + 4 murs d'enceinte infranchissables.
  c.boxes.push({ min: { x: -h - 1, y: -1, z: -h - 1 }, max: { x: h + 1, y: 0, z: h + 1 } });
  c.boxes.push({ min: { x: -h - 1, y: 0, z: -h - 1 }, max: { x: h + 1, y: wallHeight, z: -h } });
  c.boxes.push({ min: { x: -h - 1, y: 0, z: h }, max: { x: h + 1, y: wallHeight, z: h + 1 } });
  c.boxes.push({ min: { x: -h - 1, y: 0, z: -h }, max: { x: -h, y: wallHeight, z: h } });
  c.boxes.push({ min: { x: h, y: 0, z: -h }, max: { x: h + 1, y: wallHeight, z: h } });

  if (duelMap) {
    // Double rampe en V au centre : deux rampes de la taille exacte d'une rampe construite
    // (une cellule GRID x GRID, montée de GRID), alignées sur la grille, qui montent vers ±X.
    c.slopes.push({ minX: -GRID, maxX: 0, minZ: -GRID, maxZ: 0, y: 0, h: GRID, dir: 3 });
    c.slopes.push({ minX: 0, maxX: GRID, minZ: -GRID, maxZ: 0, y: 0, h: GRID, dir: 1 });
    // Caisse métallique sur le côté, à égale distance des deux spawns.
    c.boxes.push({ min: { x: 21, y: 0, z: -1.5 }, max: { x: 24, y: 2.4, z: 1.5 } });
    return {
      mode,
      halfSize,
      wallHeight,
      colliders: c,
      targets: [],
      // yaw = π → regarde vers +Z ; yaw = 0 → regarde vers -Z (face à face).
      spawns: [
        { x: 0, y: 0, z: -26, yaw: Math.PI },
        { x: 0, y: 0, z: 26, yaw: 0 },
      ],
    };
  }

  if (mode === 'training') {
    // Plateformes surélevées (alignées sur la grille) et caisses servant de couvert.
    c.boxes.push({ min: { x: -24, y: 0, z: -36 }, max: { x: -16, y: GRID, z: -28 } });
    c.boxes.push({ min: { x: 16, y: 0, z: -52 }, max: { x: 24, y: 2 * GRID, z: -44 } });
    c.boxes.push({ min: { x: -7, y: 0, z: 14 }, max: { x: -4, y: 2.4, z: 17 } });
    c.boxes.push({ min: { x: 5, y: 0, z: -2 }, max: { x: 8, y: 2.4, z: 1 } });
    c.boxes.push({ min: { x: -12, y: 0, z: -14 }, max: { x: -9, y: 2.4, z: -11 } });
    // Rampe d'accès à la première plateforme.
    c.slopes.push({ minX: -24, maxX: -16, minZ: -28, maxZ: -24, y: 0, h: GRID, dir: 2 });
    return {
      mode,
      halfSize,
      wallHeight,
      colliders: c,
      spawns: [{ x: 0, y: 0, z: 40, yaw: 0 }],
      targets: [
        { x: -4, y: 0, z: 26, yaw: Math.PI, move: 0 },
        { x: 4, y: 0, z: 26, yaw: Math.PI, move: 0 },
        { x: 0, y: 0, z: 8, yaw: Math.PI, move: 6 },
        { x: 0, y: 0, z: -8, yaw: Math.PI, move: 10 },
        { x: -20, y: GRID, z: -32, yaw: Math.PI, move: 0 },
        { x: 20, y: 2 * GRID, z: -48, yaw: Math.PI, move: 0 },
        { x: 0, y: 0, z: -40, yaw: Math.PI, move: 14 },
        { x: 0, y: 0, z: -58, yaw: Math.PI, move: 0 },
      ],
    };
  }

  return { mode, halfSize, wallHeight, colliders: c, targets: [], spawns: [{ x: 2, y: 0, z: 2, yaw: 0 }] };
}
