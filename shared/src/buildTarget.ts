/**
 * Choix de la pièce visée sur la grille, partagé entre le joueur (BuildSystem)
 * et les bots : orientation accrochée à l'axe dominant N/E/S/O, pitch caméra
 * (regarder en haut = étage +1), prolongement automatique des rampes.
 */
import { GRID } from './constants';
import type { Rot } from './geometry';
import type { Vec3 } from './math';
import { normalizeSpec, structureKey, type Structure, type StructureSpec, type StructureType } from './structures';

export interface BuilderState {
  pos: Vec3;
  slopeDir: Rot | null;
  yaw: number;
  pitch: number;
}

/** Pas de grille associé à chaque direction (0:+Z, 1:+X, 2:-Z, 3:-X). */
export const STEP: Record<Rot, { dx: number; dz: number }> = {
  0: { dx: 0, dz: 1 },
  1: { dx: 1, dz: 0 },
  2: { dx: 0, dz: -1 },
  3: { dx: -1, dz: 0 },
};

/** Axe dominant du regard (yaw = 0 → -Z). */
export function yawToDir(yaw: number): Rot {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : fz > 0 ? 0 : 2;
}

/** Yaw qui regarde exactement dans la direction `dir`. */
export function dirToYaw(dir: Rot): number {
  return [Math.PI, -Math.PI / 2, 0, Math.PI / 2][dir];
}

export function computeBuildCandidate(
  piece: StructureType,
  b: BuilderState,
  getStructure: (key: string) => Structure | undefined,
): StructureSpec {
  const p = b.pos;
  const dir = yawToDir(b.yaw);
  const step = STEP[dir];
  const cx = Math.floor(p.x / GRID);
  const cz = Math.floor(p.z / GRID);
  const level = Math.max(0, Math.floor((p.y + 0.5) / GRID));
  const pitch = b.pitch;
  const front = (dist: number) => ({
    ix: Math.floor((p.x + step.dx * dist) / GRID),
    iz: Math.floor((p.z + step.dz * dist) / GRID),
  });

  switch (piece) {
    case 'wall': {
      // Mur sur l'arête de la cellule courante, du côté où l'on regarde.
      const iy = level + (pitch > 0.55 ? 1 : 0);
      const ix = cx + (dir === 1 ? 1 : 0);
      const iz = cz + (dir === 0 ? 1 : 0);
      return normalizeSpec({ type: 'wall', ix, iy, iz, rot: (dir % 2) as Rot });
    }
    case 'floor': {
      const below = pitch < -0.6;
      const cell = below ? { ix: cx, iz: cz } : front(3);
      const iy = level + (pitch > 0.35 ? 1 : 0);
      return normalizeSpec({ type: 'floor', ...cell, iy, rot: 0 });
    }
    case 'ramp': {
      let { ix, iz } = front(2.5);
      let iy: number;
      if (b.slopeDir === dir) {
        // En montant une rampe (pente 45°), on prolonge la pente : la hauteur au bord
        // d'entrée de la cellule cible = hauteur actuelle + distance jusqu'à ce bord.
        const entry =
          dir === 0 ? iz * GRID - p.z : dir === 2 ? p.z - (iz + 1) * GRID : dir === 1 ? ix * GRID - p.x : p.x - (ix + 1) * GRID;
        iy = Math.max(0, Math.round((p.y + entry) / GRID));
      } else {
        iy = Math.max(0, Math.floor((p.y + 0.3) / GRID));
      }
      // Rampe déjà posée dans la même direction : on vise la suivante dans le prolongement.
      for (let i = 0; i < 3; i++) {
        const existing = getStructure(structureKey({ type: 'ramp', ix, iy, iz, rot: dir }));
        if (!existing || existing.rot !== dir) break;
        ix += step.dx;
        iz += step.dz;
        iy += 1;
      }
      return normalizeSpec({ type: 'ramp', ix, iy, iz, rot: dir });
    }
    case 'roof': {
      // Par défaut au-dessus de la tête ; en regardant vers le bas, devant soi.
      const down = pitch < -0.4;
      const cell = down ? front(3) : { ix: cx, iz: cz };
      return normalizeSpec({ type: 'roof', ...cell, iy: down ? level : level + 1, rot: 0 });
    }
  }
}
