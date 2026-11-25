/**
 * Personnage low-poly (blocs) + armes tenues en main droite.
 * Les proportions correspondent aux hitbox partagées (tête à 1.6 m, hauteur 1.85 m).
 */
import * as THREE from 'three';
import { PLAYER } from '@shared/constants';
import { WEAPON_ORDER, type WeaponId } from '@shared/weapons';

const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
};

export class Avatar {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  /** Bras droit : pivote avec le pitch pour viser. */
  private arm = new THREE.Group();
  private items = new Map<WeaponId, { obj: THREE.Object3D; muzzle: THREE.Object3D }>();
  private active: WeaponId | null = 'pickaxe';
  private swingT = 0;

  constructor(color: number) {
    const skin = new THREE.MeshStandardMaterial({ color: 0xf1c27d });
    const cloth = new THREE.MeshStandardMaterial({ color });
    const pants = new THREE.MeshStandardMaterial({ color: 0x2b2f3a });

    this.body.add(box(0.26, 0.85, 0.3, pants, -0.16, 0.425));
    this.body.add(box(0.26, 0.85, 0.3, pants, 0.16, 0.425));
    this.body.add(box(0.7, 0.65, 0.4, cloth, 0, 1.175));
    this.body.add(box(0.18, 0.6, 0.2, cloth, -0.45, 1.15));
    const head = new THREE.Mesh(new THREE.SphereGeometry(PLAYER.headRadius, 16, 12), skin);
    head.position.y = PLAYER.height - PLAYER.headRadius;
    head.castShadow = true;
    this.body.add(head);

    this.arm.position.set(0.42, 1.42, 0);
    this.arm.add(box(0.18, 0.18, 0.55, cloth, 0, 0, -0.25));
    this.body.add(this.arm);
    this.group.add(this.body);

    for (const id of WEAPON_ORDER) {
      const { obj, muzzle } = makeWeapon(id);
      obj.position.set(0, -0.02, -0.5);
      obj.visible = id === this.active;
      this.arm.add(obj);
      this.items.set(id, { obj, muzzle });
    }
  }

  setWeapon(id: WeaponId | null) {
    if (id === this.active) return;
    this.active = id;
    for (const [wid, it] of this.items) it.obj.visible = wid === id;
  }

  setCrouch(crouch: boolean) {
    this.body.scale.y = crouch ? PLAYER.crouchHeight / PLAYER.height : 1;
  }

  /** pitch > 0 = regarde vers le haut (Rx positif relève l'axe -Z). */
  setPitch(pitch: number) {
    this.arm.rotation.x = pitch;
  }

  swing() {
    this.swingT = 0.3;
  }

  update(dt: number) {
    if (this.swingT <= 0) return;
    this.swingT = Math.max(0, this.swingT - dt);
    this.arm.rotation.x -= Math.sin((1 - this.swingT / 0.3) * Math.PI) * 1.3;
  }

  getMuzzleWorld(out: THREE.Vector3) {
    const it = this.active ? this.items.get(this.active) : undefined;
    return it ? it.muzzle.getWorldPosition(out) : this.arm.getWorldPosition(out);
  }
}

/** Modèles d'armes orientés vers -Z, avec un point "bouche" pour les traçantes. */
function makeWeapon(id: WeaponId) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x2d2f36, metalness: 0.6, roughness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b });
  const accent = new THREE.MeshStandardMaterial({ color: id === 'sniper' ? 0x3f6b3a : 0x6a6f7c });
  const obj = new THREE.Group();
  const muzzle = new THREE.Object3D();
  let length = 0.8;

  switch (id) {
    case 'pickaxe':
      obj.add(box(0.06, 0.06, 0.9, wood, 0, 0, -0.2));
      obj.add(box(0.7, 0.1, 0.12, new THREE.MeshStandardMaterial({ color: 0x9fd6ff, metalness: 0.5 }), 0, 0, -0.62));
      length = 0.7;
      break;
    case 'shotgun':
      obj.add(box(0.1, 0.14, 0.45, wood, 0, -0.02, 0.05));
      obj.add(box(0.08, 0.08, 0.85, metal, 0, 0.04, -0.35));
      length = 0.8;
      break;
    case 'ar':
      obj.add(box(0.1, 0.16, 0.7, accent, 0, 0, -0.2));
      obj.add(box(0.06, 0.06, 0.4, metal, 0, 0.02, -0.7));
      obj.add(box(0.07, 0.22, 0.1, metal, 0, -0.17, -0.25));
      length = 0.9;
      break;
    case 'sniper':
      obj.add(box(0.1, 0.14, 0.8, accent, 0, 0, -0.2));
      obj.add(box(0.05, 0.05, 0.7, metal, 0, 0.03, -0.9));
      obj.add(box(0.08, 0.08, 0.35, metal, 0, 0.14, -0.25));
      length = 1.25;
      break;
  }
  muzzle.position.set(0, 0.03, -length);
  obj.add(muzzle);
  return { obj, muzzle };
}
