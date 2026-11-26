/**
 * Personnage low-poly articulé (jambes, bras coudés, tête) avec deux apparences,
 * animation de marche, armes tenues à deux mains et coup de pioche avec traînée.
 * Les proportions correspondent aux hitbox partagées (tête à ~1.6 m, hauteur 1.85 m).
 */
import * as THREE from 'three';
import { PLAYER } from '@shared/constants';
import { WEAPON_ORDER, type WeaponId } from '@shared/weapons';
import { box, flat, limb, v3 } from './MeshUtil';
import { SwingTrail } from './SwingTrail';
import { makeWeaponModel, type WeaponModel } from './WeaponModels';

export type AvatarLook = 'barbarian' | 'agent' | 'dummy';

interface Look {
  skin: number;
  hair: number;
  top: number;
  sleeve: number;
  bracer: number;
  pants: number;
  legs: number;
  shoes: number;
  belt: number;
  style: 'spikes' | 'short';
  shirt?: number;
}

const LOOKS: Record<AvatarLook, Look> = {
  barbarian: {
    skin: 0xc98a55,
    hair: 0xa3302a,
    top: 0x5a3426,
    sleeve: 0xc98a55,
    bracer: 0x9b2a24,
    pants: 0x7a4a2e,
    legs: 0xc98a55,
    shoes: 0x5a3426,
    belt: 0x9b2a24,
    style: 'spikes',
  },
  agent: {
    skin: 0xf0c49a,
    hair: 0x3b2a1f,
    top: 0x1e2533,
    sleeve: 0x1e2533,
    bracer: 0x1e2533,
    pants: 0x3c5d8f,
    legs: 0x3c5d8f,
    shoes: 0x1a1a1a,
    belt: 0x2a2a2a,
    style: 'short',
    shirt: 0xd8d8d8,
  },
  // Mannequin d'entraînement : orange et blanc, bien visible.
  dummy: {
    skin: 0xf2efe8,
    hair: 0xff7a1a,
    top: 0xff7a1a,
    sleeve: 0xf2efe8,
    bracer: 0xff7a1a,
    pants: 0x3a3f4a,
    legs: 0xf2efe8,
    shoes: 0x3a3f4a,
    belt: 0xff7a1a,
    style: 'short',
    shirt: 0xffffff,
  },
};

const CHEST_Y = 1.38;
const SWING_TIME = 0.36;

interface HeldItem {
  container: THREE.Group;
  model: WeaponModel | null;
}

export class Avatar {
  readonly group = new THREE.Group();
  private body = new THREE.Group();
  /** Haut du corps : pivote avec le pitch pour viser. */
  private rig = new THREE.Group();
  /** Pivot du coup de pioche (bras + arme). */
  private pivot = new THREE.Group();
  private legs: THREE.Group[] = [];
  private items = new Map<WeaponId | 'none', HeldItem>();
  private active: WeaponId | null = 'pickaxe';
  private trail = new SwingTrail();
  private swingT = 0;
  private walkPhase = 0;
  private walkK = 0;
  private runK = 0;
  private airK = 0;
  private air = false;
  private vy = 0;
  private squash = 0;
  private crouchScale = 1;
  private lastPos = new THREE.Vector3();
  private hasLastPos = false;
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();

  constructor(lookId: AvatarLook) {
    const look = LOOKS[lookId];
    const m = {
      skin: flat(look.skin),
      hair: flat(look.hair),
      top: flat(look.top),
      sleeve: flat(look.sleeve),
      bracer: flat(look.bracer),
      pants: flat(look.pants),
      legs: flat(look.legs),
      shoes: flat(look.shoes),
      belt: flat(look.belt),
      dark: flat(0x111111),
    };

    // Jambes articulées à la hanche.
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.12, 0.92, 0);
      leg.add(limb(v3(0, 0, 0), v3(0, -0.46, 0), 0.19, m.legs));
      leg.add(limb(v3(0, -0.46, 0), v3(0, -0.84, 0), 0.16, lookId === 'barbarian' ? m.shoes : m.legs));
      leg.add(box(0.18, 0.1, 0.28, m.shoes, 0, -0.87, -0.04));
      this.legs.push(leg);
      this.body.add(leg);
    }

    // Bassin, ceinture, torse.
    this.body.add(box(0.4, 0.2, 0.26, m.pants, 0, 0.95));
    this.body.add(box(0.42, 0.07, 0.28, m.belt, 0, 1.05));
    if (lookId === 'barbarian') {
      this.body.add(box(0.3, 0.32, 0.04, m.pants, 0, 0.8, -0.14));
      this.body.add(box(0.3, 0.32, 0.04, m.pants, 0, 0.8, 0.14));
      this.body.add(box(0.22, 0.1, 0.24, m.top, -0.3, 1.52));
    }
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.5, 6), m.top);
    torso.scale.z = 0.62;
    torso.position.y = 1.32;
    torso.castShadow = true;
    this.body.add(torso);
    if (look.shirt) this.body.add(box(0.12, 0.4, 0.02, flat(look.shirt), 0, 1.33, -0.165));

    // Tête et coiffure.
    this.body.add(box(0.12, 0.1, 0.12, m.skin, 0, 1.58));
    const headY = PLAYER.height - PLAYER.headRadius;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), m.skin);
    head.position.y = headY;
    head.scale.set(0.95, 1.05, 1);
    head.castShadow = true;
    this.body.add(head);
    if (look.style === 'spikes') {
      for (let i = 0; i < 7; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 4), m.hair);
        const a = (i / 6 - 0.5) * 1.6;
        spike.position.set(Math.sin(a) * 0.12, headY + 0.2, 0.04 + Math.cos(a) * 0.05);
        spike.rotation.set(0.5, 0, -a * 0.6);
        spike.castShadow = true;
        this.body.add(spike);
      }
      this.body.add(box(0.06, 0.04, 0.02, m.dark, -0.08, headY + 0.02, -0.235));
      this.body.add(box(0.06, 0.04, 0.02, m.dark, 0.08, headY + 0.02, -0.235));
    } else {
      this.body.add(box(0.46, 0.12, 0.44, m.hair, 0, headY + 0.19, 0.02));
      this.body.add(box(0.46, 0.2, 0.1, m.hair, 0, headY + 0.06, 0.2));
      this.body.add(box(0.38, 0.07, 0.04, m.dark, 0, headY + 0.03, -0.235));
    }

    // Haut du corps : bras + armes.
    this.rig.position.y = CHEST_Y;
    this.rig.add(this.pivot);
    this.body.add(this.rig);
    this.group.add(this.body, this.trail.mesh);

    const addArms = (c: THREE.Group, right: THREE.Vector3, left: THREE.Vector3) => {
      for (const [side, hand] of [
        [1, right],
        [-1, left],
      ] as const) {
        const shoulder = v3(side * 0.28, 0.1, 0);
        const elbow = shoulder.clone().lerp(hand, 0.5).add(v3(side * 0.12, -0.14, 0.08));
        c.add(box(0.16, 0.16, 0.18, m.top, shoulder.x, shoulder.y, shoulder.z));
        c.add(limb(shoulder, elbow, 0.13, m.sleeve));
        c.add(limb(elbow, hand, 0.11, m.sleeve));
        c.add(limb(elbow.clone().lerp(hand, 0.45), hand, 0.125, m.bracer));
        c.add(box(0.1, 0.1, 0.1, m.skin, hand.x, hand.y, hand.z));
      }
    };

    for (const id of WEAPON_ORDER) {
      const model = makeWeaponModel(id);
      const container = new THREE.Group();
      if (id === 'pickaxe') {
        model.obj.position.set(0.14, -0.42, -0.36);
        model.obj.rotation.set(-0.25, 0, 0.4);
      } else if (id === 'pistol') {
        model.obj.position.set(0.1, -0.1, -0.46);
      } else {
        model.obj.position.set(0.17, -0.2, -0.24);
      }
      model.obj.updateMatrix();
      const toRig = (p: THREE.Vector3) => p.clone().applyMatrix4(model.obj.matrix);
      container.add(model.obj);
      addArms(container, toRig(model.rightHand), toRig(model.leftHand));
      this.addItem(id, { container, model });
    }
    // Mode construction : mains vides, bras le long du corps.
    const empty = new THREE.Group();
    addArms(empty, v3(0.36, -0.62, 0.02), v3(-0.36, -0.62, 0.02));
    this.addItem('none', { container: empty, model: null });
    this.applyVisibility();
  }

  private addItem(id: WeaponId | 'none', item: HeldItem) {
    this.pivot.add(item.container);
    this.items.set(id, item);
  }

  private applyVisibility() {
    const key = this.active ?? 'none';
    for (const [id, it] of this.items) it.container.visible = id === key;
  }

  setWeapon(id: WeaponId | null) {
    if (id === this.active) return;
    this.active = id;
    this.swingT = 0;
    this.pivot.rotation.set(0, 0, 0);
    this.applyVisibility();
  }

  setCrouch(crouch: boolean) {
    this.crouchScale = crouch ? PLAYER.crouchHeight / PLAYER.height : 1;
  }

  /** En l'air (saut / chute) : pose dédiée ; à l'atterrissage, léger écrasement. */
  setAir(air: boolean) {
    if (this.air && !air) this.squash = 0.12;
    this.air = air;
  }

  /** Téléportation : pas d'animation de course à travers la carte. */
  resetMotion() {
    this.hasLastPos = false;
  }

  /** pitch > 0 = regarde vers le haut (Rx positif relève l'axe -Z). */
  setPitch(pitch: number) {
    this.rig.rotation.x = this.active === null ? 0 : pitch * 0.8;
  }

  swing() {
    if (this.active === 'pickaxe') this.swingT = SWING_TIME;
  }

  update(dt: number) {
    this.animateWalk(dt);
    this.animateSwing(dt);
    this.trail.update(dt);
  }

  /**
   * Marche / course / saut / chute. La vitesse est déduite du déplacement réel :
   * fonctionne pour le joueur local comme pour l'adversaire interpolé.
   */
  private animateWalk(dt: number) {
    const p = this.group.position;
    if (!this.hasLastPos) {
      this.lastPos.copy(p);
      this.hasLastPos = true;
    }
    const speed = dt > 0 ? Math.min(Math.hypot(p.x - this.lastPos.x, p.z - this.lastPos.z) / dt, 12) : 0;
    const vy = dt > 0 ? (p.y - this.lastPos.y) / dt : 0;
    this.vy += (vy - this.vy) * Math.min(1, dt * 12);
    this.lastPos.copy(p);
    const blend = Math.min(1, dt * 10);
    this.walkK += (Math.min(speed / PLAYER.walkSpeed, 1) - this.walkK) * blend;
    this.runK += ((speed > PLAYER.walkSpeed + 1 ? 1 : 0) - this.runK) * blend;
    this.airK += ((this.air ? 1 : 0) - this.airK) * Math.min(1, dt * 14);
    this.walkPhase += dt * (5 + speed * 0.95);

    // Foulée : plus ample en course.
    const amp = (0.65 + this.runK * 0.35) * this.walkK * (1 - this.airK);
    const stride = Math.sin(this.walkPhase) * amp;
    // En l'air : jambe avant repliée en montée, jambes écartées en chute.
    const falling = this.vy < -2 ? 1 : 0;
    const airFront = 0.75 - falling * 0.4;
    const airBack = -0.35 + falling * 0.05;
    this.legs[0].rotation.x = stride + airFront * this.airK;
    this.legs[1].rotation.x = -stride + airBack * this.airK;

    // Buste penché en avant en course, rebond vertical à chaque pas.
    this.body.rotation.x = -0.14 * this.runK * (1 - this.airK);
    this.body.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.05 * this.walkK * (1 - this.airK);
    this.squash = Math.max(0, this.squash - dt);
    this.body.scale.y = this.crouchScale * (1 - this.squash * 0.9);
  }

  private animateSwing(dt: number) {
    if (this.swingT <= 0) return;
    this.swingT = Math.max(0, this.swingT - dt);
    const p = 1 - this.swingT / SWING_TIME;
    let rx: number;
    let ry: number;
    if (p < 0.22) {
      // Armé au-dessus de l'épaule.
      const q = Math.sin((p / 0.22) * (Math.PI / 2));
      rx = 0.9 * q;
      ry = 0.35 * q;
    } else if (p < 0.55) {
      // Frappe en diagonale, de plus en plus rapide.
      const q = ((p - 0.22) / 0.33) ** 2;
      rx = 0.9 - 2.6 * q;
      ry = 0.35 - 0.95 * q;
      this.sampleTrail();
    } else {
      const q = (p - 0.55) / 0.45;
      const e = 1 - q * q * (3 - 2 * q);
      rx = -1.7 * e;
      ry = -0.6 * e;
    }
    this.pivot.rotation.set(rx, ry, 0);
  }

  private sampleTrail() {
    const trail = this.items.get('pickaxe')?.model?.trail;
    if (!trail) return;
    this.group.updateMatrixWorld(true);
    const inner = this.group.worldToLocal(trail[0].getWorldPosition(this.tmpA));
    const outer = this.group.worldToLocal(trail[1].getWorldPosition(this.tmpB));
    this.trail.push(inner, outer);
  }

  getMuzzleWorld(out: THREE.Vector3) {
    const model = this.active ? this.items.get(this.active)?.model : null;
    return model ? model.muzzle.getWorldPosition(out) : this.rig.getWorldPosition(out);
  }
}
