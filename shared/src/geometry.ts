/**
 * Primitives de collision / raycasting partagées.
 * Le monde entier (arène + constructions) est décrit par 3 primitives simples :
 *  - AABB    : murs, sols, blocs (alignés sur les axes)
 *  - Slope   : rampes (plan incliné borné par une empreinte rectangulaire)
 *  - Pyramid : toits (pyramide à base carrée)
 * Ces mêmes données servent à la physique du joueur, à la caméra et au tir.
 */
import { along, type Vec3 } from './math';

export interface AABB {
  min: Vec3;
  max: Vec3;
}

/** Direction de montée d'une pente : 0 = +Z, 1 = +X, 2 = -Z, 3 = -X */
export type Rot = 0 | 1 | 2 | 3;

export interface Slope {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Hauteur du bas de la pente */
  y: number;
  /** Dénivelé total */
  h: number;
  dir: Rot;
}

export interface Pyramid {
  cx: number;
  cz: number;
  half: number;
  y: number;
  h: number;
}

export interface Colliders {
  boxes: AABB[];
  slopes: Slope[];
  pyramids: Pyramid[];
}

export const emptyColliders = (): Colliders => ({ boxes: [], slopes: [], pyramids: [] });

export function mergeColliders(target: Colliders, src: Colliders): Colliders {
  target.boxes.push(...src.boxes);
  target.slopes.push(...src.slopes);
  target.pyramids.push(...src.pyramids);
  return target;
}

// ---------------------------------------------------------------------------
// Hauteurs de surface (utilisées par la physique : "sur quoi je marche ?")
// ---------------------------------------------------------------------------

/** Hauteur du plan de la pente, sans tenir compte de son empreinte. */
export function slopeLinearHeight(s: Slope, x: number, z: number): number {
  const lz = s.maxZ - s.minZ;
  const lx = s.maxX - s.minX;
  switch (s.dir) {
    case 0:
      return s.y + (s.h * (z - s.minZ)) / lz;
    case 1:
      return s.y + (s.h * (x - s.minX)) / lx;
    case 2:
      return s.y + (s.h * (s.maxZ - z)) / lz;
    default:
      return s.y + (s.h * (s.maxX - x)) / lx;
  }
}

export function slopeHeightAt(s: Slope, x: number, z: number): number | null {
  if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) return null;
  return slopeLinearHeight(s, x, z);
}

export function pyramidHeightAt(p: Pyramid, x: number, z: number): number | null {
  const m = Math.max(Math.abs(x - p.cx), Math.abs(z - p.cz));
  if (m > p.half) return null;
  return p.y + p.h * (1 - m / p.half);
}

// ---------------------------------------------------------------------------
// Raycasting (d doit être normalisé). Retourne la distance t ou null.
// ---------------------------------------------------------------------------

const AXES = ['x', 'y', 'z'] as const;

/** Méthode des "slabs" : intervalle [tEntrée, tSortie] du rayon dans la boîte. */
export function rayAABBRange(o: Vec3, d: Vec3, b: AABB, maxT: number): [number, number] | null {
  let tmin = 0;
  let tmax = maxT;
  for (const ax of AXES) {
    if (Math.abs(d[ax]) < 1e-9) {
      if (o[ax] < b.min[ax] || o[ax] > b.max[ax]) return null;
      continue;
    }
    const inv = 1 / d[ax];
    let t1 = (b.min[ax] - o[ax]) * inv;
    let t2 = (b.max[ax] - o[ax]) * inv;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return [tmin, tmax];
}

export function rayAABB(o: Vec3, d: Vec3, b: AABB, maxT: number): number | null {
  const r = rayAABBRange(o, d, b, maxT);
  return r ? r[0] : null;
}

/** Intersection rayon / plan incliné (double face), bornée par l'empreinte. */
export function raySlope(o: Vec3, d: Vec3, s: Slope, maxT: number): number | null {
  const f0 = o.y - slopeLinearHeight(s, o.x, o.z);
  const p1 = along(o, d, 1);
  const df = p1.y - slopeLinearHeight(s, p1.x, p1.z) - f0;
  if (Math.abs(df) < 1e-9) return null;
  const t = -f0 / df;
  if (t < 0 || t > maxT) return null;
  const p = along(o, d, t);
  const eps = 1e-4;
  if (p.x < s.minX - eps || p.x > s.maxX + eps || p.z < s.minZ - eps || p.z > s.maxZ + eps) return null;
  return t;
}

/** Pyramide : test AABB grossier puis marche le long du rayon (précision 5 cm). */
export function rayPyramid(o: Vec3, d: Vec3, p: Pyramid, maxT: number): number | null {
  const box: AABB = {
    min: { x: p.cx - p.half, y: p.y, z: p.cz - p.half },
    max: { x: p.cx + p.half, y: p.y + p.h, z: p.cz + p.half },
  };
  const range = rayAABBRange(o, d, box, maxT);
  if (!range) return null;
  const step = 0.05;
  for (let t = range[0]; t <= range[1]; t += step) {
    const q = along(o, d, t);
    const h = pyramidHeightAt(p, q.x, q.z);
    if (h !== null && q.y <= h) return t;
  }
  return null;
}

export function raySphere(o: Vec3, d: Vec3, c: Vec3, r: number, maxT: number): number | null {
  const ox = o.x - c.x;
  const oy = o.y - c.y;
  const oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = -b - sq;
  if (t < 0) t = -b + sq;
  return t >= 0 && t <= maxT ? t : null;
}

/** Impact le plus proche contre un ensemble de colliders. */
export function rayColliders(o: Vec3, d: Vec3, maxT: number, c: Colliders): number | null {
  let best: number | null = null;
  let limit = maxT;
  for (const b of c.boxes) {
    const t = rayAABB(o, d, b, limit);
    if (t !== null) (best = t), (limit = t);
  }
  for (const s of c.slopes) {
    const t = raySlope(o, d, s, limit);
    if (t !== null) (best = t), (limit = t);
  }
  for (const p of c.pyramids) {
    const t = rayPyramid(o, d, p, limit);
    if (t !== null) (best = t), (limit = t);
  }
  return best;
}
