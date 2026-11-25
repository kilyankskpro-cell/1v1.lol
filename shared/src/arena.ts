/**
 * Définition des cartes :
 *  - duel      : arène fermée 64x64, deux spawns opposés séparés par une rampe centrale.
 *  - justbuild : grand terrain plat pour s'entraîner à construire.
 */
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
    // Rampe centrale : un bloc plein avec une pente de chaque côté.
    c.boxes.push({ min: { x: -8, y: 0, z: -3 }, max: { x: 8, y: 4, z: 3 } });
    c.slopes.push({ minX: -8, maxX: 8, minZ: -7, maxZ: -3, y: 0, h: 4, dir: 0 });
    c.slopes.push({ minX: -8, maxX: 8, minZ: 3, maxZ: 7, y: 0, h: 4, dir: 2 });
    // Petits blocs de couverture près de chaque spawn.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cx = sx * 18;
        const cz = sz * 16;
        c.boxes.push({ min: { x: cx - 2, y: 0, z: cz - 1 }, max: { x: cx + 2, y: 2, z: cz + 1 } });
      }
    }
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
