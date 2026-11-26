/**
 * Raycasting des armes, exécuté à l'identique :
 *  - côté client pour le retour visuel immédiat (traçantes, impacts),
 *  - côté serveur pour l'autorité (dégâts réellement appliqués).
 *
 * Hitbox joueur : une sphère pour la tête (dégâts critiques) + une boîte pour le corps.
 */
import { PLAYER } from './constants';
import { rayAABB, rayColliders, raySphere, type AABB, type Colliders } from './geometry';
import { along, type Vec3 } from './math';

export interface HitTarget {
  id: string;
  /** Position des pieds */
  feet: Vec3;
  crouch: boolean;
}

export interface StructureCollidable {
  id: string;
  colliders: Colliders;
}

export interface RayHit {
  t: number;
  point: Vec3;
  kind: 'static' | 'structure' | 'player';
  structureId?: string;
  playerId?: string;
  headshot?: boolean;
}

export function playerHitbox(feet: Vec3, crouch: boolean): { head: Vec3; body: AABB } {
  const h = crouch ? PLAYER.crouchHeight : PLAYER.height;
  const r = PLAYER.radius;
  return {
    head: { x: feet.x, y: feet.y + h - PLAYER.headRadius, z: feet.z },
    body: {
      min: { x: feet.x - r, y: feet.y, z: feet.z - r },
      max: { x: feet.x + r, y: feet.y + h - 2 * PLAYER.headRadius, z: feet.z + r },
    },
  };
}

/** Premier objet touché par le rayon (décor, structure ou joueur). */
export function raycastWorld(
  o: Vec3,
  d: Vec3,
  maxT: number,
  staticColliders: Colliders,
  structures: Iterable<StructureCollidable>,
  players: Iterable<HitTarget>,
): RayHit | null {
  let best: Omit<RayHit, 'point'> | null = null;
  let limit = maxT;

  const ts = rayColliders(o, d, limit, staticColliders);
  if (ts !== null) {
    best = { t: ts, kind: 'static' };
    limit = ts;
  }

  for (const s of structures) {
    const t = rayColliders(o, d, limit, s.colliders);
    if (t !== null) {
      best = { t, kind: 'structure', structureId: s.id };
      limit = t;
    }
  }

  for (const p of players) {
    const hb = playerHitbox(p.feet, p.crouch);
    const th = raySphere(o, d, hb.head, PLAYER.headRadius, limit);
    const tb = rayAABB(o, d, hb.body, limit);
    if (th !== null && (tb === null || th <= tb)) {
      best = { t: th, kind: 'player', playerId: p.id, headshot: true };
      limit = th;
    } else if (tb !== null) {
      best = { t: tb, kind: 'player', playerId: p.id, headshot: false };
      limit = tb;
    }
  }

  return best ? { ...best, point: along(o, d, best.t) } : null;
}
