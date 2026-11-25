/** Caractéristiques des 4 équipements. Le serveur s'en sert pour valider les tirs. */
export type WeaponId = 'pickaxe' | 'shotgun' | 'ar' | 'sniper';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** Dégâts par plomb / balle sur un joueur (corps). */
  damage: number;
  /** Dégâts par plomb / balle sur une structure. */
  structureDamage: number;
  headshotMult: number;
  /** Secondes entre deux tirs. */
  fireInterval: number;
  automatic: boolean;
  pellets: number;
  /** Demi-angle de dispersion (radians) au jugé / en visée. */
  spreadHip: number;
  spreadAim: number;
  /** Dispersion ajoutée à chaque tir (tir soutenu) et récupération par seconde. */
  bloomPerShot: number;
  bloomMax: number;
  bloomRecover: number;
  range: number;
  /** Distance à partir de laquelle les dégâts diminuent. */
  falloffStart: number;
  minFalloff: number;
  /** 0 = pas de munitions (corps-à-corps). */
  magSize: number;
  reserve: number;
  reloadTime: number;
  /** Recul vertical (radians) appliqué à la caméra par tir. */
  recoil: number;
  /** Champ de vision en visée (clic droit). */
  aimFov: number;
  melee: boolean;
}

export const WEAPON_ORDER: WeaponId[] = ['pickaxe', 'shotgun', 'ar', 'sniper'];

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pickaxe: {
    id: 'pickaxe', name: 'Pioche', damage: 20, structureDamage: 75, headshotMult: 1,
    fireInterval: 0.45, automatic: true, pellets: 1, spreadHip: 0, spreadAim: 0,
    bloomPerShot: 0, bloomMax: 0, bloomRecover: 1, range: 3.2, falloffStart: 999, minFalloff: 1,
    magSize: 0, reserve: 0, reloadTime: 0, recoil: 0, aimFov: 75, melee: true,
  },
  shotgun: {
    id: 'shotgun', name: 'Fusil à pompe', damage: 9.5, structureDamage: 7, headshotMult: 2,
    fireInterval: 0.9, automatic: false, pellets: 10, spreadHip: 0.075, spreadAim: 0.06,
    bloomPerShot: 0, bloomMax: 0, bloomRecover: 1, range: 40, falloffStart: 8, minFalloff: 0.3,
    magSize: 5, reserve: 30, reloadTime: 2.5, recoil: 0.06, aimFov: 62, melee: false,
  },
  ar: {
    id: 'ar', name: "Fusil d'assaut", damage: 30, structureDamage: 40, headshotMult: 2,
    fireInterval: 0.18, automatic: true, pellets: 1, spreadHip: 0.035, spreadAim: 0.01,
    bloomPerShot: 0.006, bloomMax: 0.04, bloomRecover: 0.1, range: 150, falloffStart: 50, minFalloff: 0.6,
    magSize: 30, reserve: 150, reloadTime: 2.2, recoil: 0.012, aimFov: 55, melee: false,
  },
  sniper: {
    id: 'sniper', name: 'Sniper', damage: 105, structureDamage: 100, headshotMult: 2,
    fireInterval: 1.6, automatic: false, pellets: 1, spreadHip: 0.09, spreadAim: 0,
    bloomPerShot: 0, bloomMax: 0, bloomRecover: 1, range: 600, falloffStart: 999, minFalloff: 1,
    magSize: 1, reserve: 15, reloadTime: 1.4, recoil: 0.06, aimFov: 18, melee: false,
  },
};

/** Coefficient de dégâts selon la distance (1 = plein dégâts). */
export function damageFalloff(w: WeaponDef, dist: number): number {
  if (dist <= w.falloffStart) return 1;
  const t = (dist - w.falloffStart) / Math.max(1, w.range - w.falloffStart);
  return Math.max(w.minFalloff, 1 - t * (1 - w.minFalloff));
}
