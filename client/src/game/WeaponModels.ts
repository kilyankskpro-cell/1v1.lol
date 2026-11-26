/**
 * Modèles d'armes low-poly, couleur d'accent selon la rareté.
 * Repère local : armes à feu orientées vers -Z avec la poignée à l'origine ;
 * pioche : manche le long de +Y, lame vers -Z.
 */
import * as THREE from 'three';
import type { WeaponId } from '@shared/weapons';
import { box, flat, limb, tube, v3 } from './MeshUtil';

/** Rareté façon Fortnite : gris, bleu, violet, or. */
export const RARITY: Record<WeaponId, number> = {
  pickaxe: 0x8f96a3,
  shotgun: 0x3c8dff,
  ar: 0x9b59ff,
  sniper: 0xf0a830,
};

export interface WeaponModel {
  obj: THREE.Group;
  muzzle: THREE.Object3D;
  /** Positions des mains en repère local de l'arme. */
  rightHand: THREE.Vector3;
  leftHand: THREE.Vector3;
  /** Pioche : points intérieur / extérieur de la lame pour la traînée. */
  trail?: [THREE.Object3D, THREE.Object3D];
}

const DARK = flat(0x24272e, { metalness: 0.5, roughness: 0.5 });
const WOOD = flat(0x7a4a2a);

const marker = (parent: THREE.Object3D, p: THREE.Vector3) => {
  const o = new THREE.Object3D();
  o.position.copy(p);
  parent.add(o);
  return o;
};

export function makeWeaponModel(id: WeaponId): WeaponModel {
  const obj = new THREE.Group();
  const accent = flat(RARITY[id], { metalness: 0.35, roughness: 0.45 });

  if (id === 'pickaxe') {
    const blade = flat(0x8c9be0, { metalness: 0.6, roughness: 0.3 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 1.1, 6), flat(0x3d2516));
    handle.position.y = 0.55;
    handle.castShadow = true;
    obj.add(handle);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.32, 6), flat(0x7a1f1f));
    grip.position.y = 0.24;
    obj.add(grip);
    obj.add(box(0.12, 0.15, 0.15, DARK, 0, 1.03, 0));
    // Lame recourbée vers l'avant (3 segments qui s'affinent) + pointe arrière.
    const p = [v3(0, 1.04, -0.05), v3(0, 1.0, -0.3), v3(0, 0.89, -0.52), v3(0, 0.7, -0.66)];
    obj.add(limb(p[0], p[1], 0.07, blade, 0.13));
    obj.add(limb(p[1], p[2], 0.06, blade, 0.1));
    obj.add(limb(p[2], p[3], 0.05, blade, 0.06));
    obj.add(limb(v3(0, 1.03, 0.06), v3(0, 0.97, 0.24), 0.06, blade, 0.07));
    return {
      obj,
      muzzle: marker(obj, p[3]),
      rightHand: v3(0, 0.14, 0),
      leftHand: v3(0, 0.4, 0),
      trail: [marker(obj, v3(0, 1.0, -0.22)), marker(obj, p[3])],
    };
  }

  let left = v3(0, -0.04, -0.42);
  let muzzleZ = -0.8;
  obj.add(box(0.06, 0.16, 0.08, DARK, 0, -0.08, 0.02)); // poignée

  if (id === 'shotgun') {
    obj.add(box(0.08, 0.11, 0.32, accent, 0, 0.02, -0.08));
    obj.add(box(0.07, 0.1, 0.3, WOOD, 0, -0.01, 0.28));
    obj.add(tube(0.026, 0.6, DARK, 0, 0.05, -0.52));
    obj.add(box(0.085, 0.07, 0.18, WOOD, 0, -0.02, -0.42));
    muzzleZ = -0.83;
  } else if (id === 'ar') {
    obj.add(box(0.08, 0.12, 0.45, accent, 0, 0.02, -0.12));
    obj.add(box(0.07, 0.08, 0.22, DARK, 0, 0.02, -0.44));
    obj.add(tube(0.02, 0.3, DARK, 0, 0.03, -0.68));
    const mag = box(0.06, 0.18, 0.08, DARK, 0, -0.12, -0.22);
    mag.rotation.x = -0.25;
    obj.add(mag);
    obj.add(box(0.06, 0.1, 0.26, accent, 0, 0, 0.22));
    obj.add(tube(0.028, 0.16, DARK, 0, 0.12, -0.1));
    muzzleZ = -0.83;
  } else {
    obj.add(box(0.08, 0.11, 0.5, accent, 0, 0.02, -0.1));
    obj.add(tube(0.019, 0.75, DARK, 0, 0.03, -0.72));
    obj.add(tube(0.036, 0.32, DARK, 0, 0.12, -0.12, 8));
    obj.add(box(0.07, 0.12, 0.32, accent, 0, -0.01, 0.28));
    left = v3(0, -0.04, -0.46);
    muzzleZ = -1.1;
  }

  return { obj, muzzle: marker(obj, v3(0, 0.03, muzzleZ)), rightHand: v3(0, -0.07, 0.02), leftHand: left };
}
