/**
 * Système de construction sur grille.
 *
 * Le monde est découpé en cellules de GRID³ unités. Chaque pièce est identifiée
 * par une clé déterministe calculée depuis sa position sur la grille : deux
 * joueurs qui construisent "la même" pièce obtiennent la même clé, ce qui permet
 * au serveur de refuser les doublons et au client de prédire le placement.
 *
 *  - wall  : posé sur une arête de cellule. rot 0 → plan z = iz*GRID, rot 1 → plan x = ix*GRID
 *  - floor : dalle dont le dessus est à y = iy*GRID
 *  - ramp  : pente occupant toute la cellule, montant dans la direction `rot`
 *  - roof  : pyramide posée à y = iy*GRID
 */
import { BUILD_MAX_LEVEL, FLOOR_THICKNESS, GRID, ROOF_HEIGHT, WALL_THICKNESS } from './constants';
import { emptyColliders, type Colliders, type Rot } from './geometry';
import type { Vec3 } from './math';

export type StructureType = 'wall' | 'floor' | 'ramp' | 'roof';
/**
 * Édition d'un mur sur une grille 3×3 : masque de 9 bits, bit (row*3 + col) à 1 = case retirée.
 * row 0 = rangée du bas, col 0 = côté u minimal (x pour rot 0, z pour rot 1).
 * Ex. porte = cases 1 et 4 retirées (bas + milieu, colonne centrale).
 */
export type WallEdit = number;

export const STRUCTURE_TYPES: StructureType[] = ['wall', 'floor', 'ramp', 'roof'];
export const EDIT_GRID = 3;
export const FULL_EDIT_MASK = (1 << (EDIT_GRID * EDIT_GRID)) - 1;
export const STRUCTURE_LABELS: Record<StructureType, string> = { wall: 'Mur', floor: 'Sol', ramp: 'Rampe', roof: 'Toit' };

/** Un mur doit garder au moins une case. */
export const isValidEdit = (m: unknown): m is WallEdit =>
  typeof m === 'number' && Number.isInteger(m) && m >= 0 && m < FULL_EDIT_MASK;

export const STRUCTURE_MAX_HP: Record<StructureType, number> = {
  wall: 150,
  floor: 140,
  ramp: 140,
  roof: 140,
};

export interface StructureSpec {
  type: StructureType;
  ix: number;
  iy: number;
  iz: number;
  rot: Rot;
}

export interface Structure extends StructureSpec {
  id: string;
  hp: number;
  maxHp: number;
  owner: string;
  edit: WallEdit;
}

/** Ramène une spec à sa forme canonique (entiers, rotation utile seulement). */
export function normalizeSpec(spec: StructureSpec): StructureSpec {
  const r = ((Math.trunc(spec.rot) % 4) + 4) % 4;
  const rot = (spec.type === 'wall' ? r % 2 : spec.type === 'ramp' ? r : 0) as Rot;
  return {
    type: spec.type,
    ix: Math.trunc(spec.ix),
    iy: Math.trunc(spec.iy),
    iz: Math.trunc(spec.iz),
    rot,
  };
}

/** Une seule pièce par emplacement : un mur par arête, une rampe/sol/toit par cellule. */
export function structureKey(spec: StructureSpec): string {
  const { type, ix, iy, iz, rot } = spec;
  return type === 'wall' ? `wall:${ix}:${iy}:${iz}:${rot % 2}` : `${type}:${ix}:${iy}:${iz}`;
}

/**
 * Panneaux d'un mur en coordonnées locales [u0, u1, v0, v1] (u horizontal, v vertical, 0..GRID).
 * Les cases pleines contiguës d'une même rangée sont fusionnées en une seule boîte.
 */
function wallPanels(mask: WallEdit): [number, number, number, number][] {
  const t = GRID / EDIT_GRID;
  const out: [number, number, number, number][] = [];
  for (let row = 0; row < EDIT_GRID; row++) {
    let start = -1;
    for (let col = 0; col <= EDIT_GRID; col++) {
      const solid = col < EDIT_GRID && !(mask & (1 << (row * EDIT_GRID + col)));
      if (solid && start < 0) start = col;
      if (!solid && start >= 0) {
        out.push([start * t, col * t, row * t, (row + 1) * t]);
        start = -1;
      }
    }
  }
  return out;
}

/** Géométrie de collision d'une pièce (sert aussi à générer son mesh). */
export function structureColliders(s: StructureSpec & { edit?: WallEdit }): Colliders {
  const c = emptyColliders();
  const x0 = s.ix * GRID;
  const y0 = s.iy * GRID;
  const z0 = s.iz * GRID;
  const ht = WALL_THICKNESS / 2;

  switch (s.type) {
    case 'wall':
      for (const [u0, u1, v0, v1] of wallPanels(s.edit ?? 0)) {
        c.boxes.push(
          s.rot % 2 === 0
            ? { min: { x: x0 + u0, y: y0 + v0, z: z0 - ht }, max: { x: x0 + u1, y: y0 + v1, z: z0 + ht } }
            : { min: { x: x0 - ht, y: y0 + v0, z: z0 + u0 }, max: { x: x0 + ht, y: y0 + v1, z: z0 + u1 } },
        );
      }
      break;
    case 'floor':
      c.boxes.push({
        min: { x: x0, y: y0 - FLOOR_THICKNESS, z: z0 },
        max: { x: x0 + GRID, y: y0, z: z0 + GRID },
      });
      break;
    case 'ramp':
      c.slopes.push({ minX: x0, maxX: x0 + GRID, minZ: z0, maxZ: z0 + GRID, y: y0, h: GRID, dir: s.rot });
      break;
    case 'roof':
      c.pyramids.push({ cx: x0 + GRID / 2, cz: z0 + GRID / 2, half: GRID / 2, y: y0, h: ROOF_HEIGHT });
      break;
  }
  return c;
}

export function structureCenter(s: StructureSpec): Vec3 {
  const x0 = s.ix * GRID;
  const y0 = s.iy * GRID;
  const z0 = s.iz * GRID;
  const h = GRID / 2;
  if (s.type === 'wall') {
    return s.rot % 2 === 0 ? { x: x0 + h, y: y0 + h, z: z0 } : { x: x0, y: y0 + h, z: z0 + h };
  }
  return { x: x0 + h, y: y0 + h, z: z0 + h };
}

/** La pièce est-elle à l'intérieur de l'arène (carré de côté 2*halfSize) ? */
export function isSpecInBounds(spec: StructureSpec, halfSize: number): boolean {
  const minC = -halfSize / GRID;
  const maxC = halfSize / GRID - 1;
  // Un mur sur une arête peut occuper l'arête "après" la dernière cellule.
  const maxX = spec.type === 'wall' && spec.rot % 2 === 1 ? maxC + 1 : maxC;
  const maxZ = spec.type === 'wall' && spec.rot % 2 === 0 ? maxC + 1 : maxC;
  return (
    spec.iy >= 0 &&
    spec.iy <= BUILD_MAX_LEVEL &&
    spec.ix >= minC &&
    spec.ix <= maxX &&
    spec.iz >= minC &&
    spec.iz <= maxZ
  );
}

export function isValidSpecShape(v: unknown): v is StructureSpec {
  const s = v as StructureSpec;
  return (
    !!s &&
    STRUCTURE_TYPES.includes(s.type) &&
    [s.ix, s.iy, s.iz, s.rot].every((n) => Number.isInteger(n)) &&
    s.rot >= 0 &&
    s.rot <= 3
  );
}
