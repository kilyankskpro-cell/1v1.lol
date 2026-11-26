/**
 * Définition des cartes :
 *  - duel      : plateforme 64x64 dans l'espace (bords bloqués par des murs invisibles),
 *                deux spawns opposés séparés par une double rampe en V.
 *  - justbuild : grand terrain plat pour s'entraîner à construire.
 */
import { GRID } from './constants';
import { emptyColliders, type Colliders } from './geometry';

export type GameMode = 'duel' | 'justbuild';

export interface Spawn {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface ArenaDef {
  mode: GameMode;
  /** Demi-côté de la zone jouable (multiple de GRID). */
  halfSize: number;
  wallHeight: number;
  spawns: Spawn[];
  /** Géométrie statique (sol, murs d'enceinte, décor). */
  colliders: Colliders;
}

export function createArena(mode: GameMode): ArenaDef {
  const halfSize = mode === 'duel' ? 32 : 64;
  const wallHeight = mode === 'duel' ? 44 : 48;
  const h = halfSize;
  const c = emptyColliders();

  // Sol (dessus à y = 0) + 4 murs d'enceinte infranchissables.
  c.boxes.push({ min: { x: -h - 1, y: -1, z: -h - 1 }, max: { x: h + 1, y: 0, z: h + 1 } });
  c.boxes.push({ min: { x: -h - 1, y: 0, z: -h - 1 }, max: { x: h + 1, y: wallHeight, z: -h } });
  c.boxes.push({ min: { x: -h - 1, y: 0, z: h }, max: { x: h + 1, y: wallHeight, z: h + 1 } });
  c.boxes.push({ min: { x: -h - 1, y: 0, z: -h }, max: { x: -h, y: wallHeight, z: h } });
  c.boxes.push({ min: { x: h, y: 0, z: -h }, max: { x: h + 1, y: wallHeight, z: h } });

  if (mode === 'duel') {
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
      // yaw = π → regarde vers +Z ; yaw = 0 → regarde vers -Z (face à face).
      spawns: [
        { x: 0, y: 0, z: -26, yaw: Math.PI },
        { x: 0, y: 0, z: 26, yaw: 0 },
      ],
    };
  }

  return { mode, halfSize, wallHeight, colliders: c, spawns: [{ x: 2, y: 0, z: 2, yaw: 0 }] };
}
