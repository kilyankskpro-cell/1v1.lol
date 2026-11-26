/**
 * Inventaire + tir hitscan.
 *
 * Le rayon part de la caméra (centre du réticule) mais son origine est avancée
 * jusqu'au plan des yeux du joueur : on ne touche donc jamais un objet situé
 * entre la caméra et le personnage, et le serveur peut vérifier que l'origine
 * correspond bien à la position du tireur.
 */
import * as THREE from 'three';
import { PLAYER } from '@shared/constants';
import type { FireMsg } from '@shared/protocol';
import type { HitTarget } from '@shared/raycast';
import { WEAPONS, WEAPON_ORDER, type WeaponDef, type WeaponId } from '@shared/weapons';
import { audio, type SoundId } from './Audio';
import type { Avatar } from './Avatar';
import type { Effects } from './Effects';
import type { PlayerController } from './PlayerController';
import type { ThirdPersonCamera } from './ThirdPersonCamera';
import type { World } from './World';

export interface WeaponContext {
  world: World;
  effects: Effects;
  avatar: Avatar;
  getTargets: () => HitTarget[];
  sendFire: (msg: FireMsg) => void;
}

export interface TriggerState {
  held: boolean;
  pressed: boolean;
  aiming: boolean;
}

interface Ammo {
  mag: number;
  reserve: number;
}

const IMPACT_COLORS = { player: 0xff3030, structure: 0xffb347, static: 0xdddddd } as const;

export class WeaponSystem {
  current: WeaponId = 'ar';
  /** Dispersion courante (radians) — sert au réticule dynamique. */
  spread = 0;
  private ammo = {} as Record<WeaponId, Ammo>;
  private cooldown = 0;
  private reloadLeft = 0;
  private bloom = 0;
  private unlimited = false;
  private tmp = new THREE.Vector3();

  constructor(private ctx: WeaponContext) {
    this.resetAmmo(false);
  }

  get def(): WeaponDef {
    return WEAPONS[this.current];
  }

  get isReloading() {
    return this.reloadLeft > 0;
  }

  /** Progression du rechargement (0..1), null s'il n'y en a pas. */
  get reloadProgress(): number | null {
    return this.reloadLeft > 0 ? 1 - this.reloadLeft / this.def.reloadTime : null;
  }

  resetAmmo(unlimited: boolean) {
    this.unlimited = unlimited;
    for (const id of WEAPON_ORDER) this.ammo[id] = { mag: WEAPONS[id].magSize, reserve: WEAPONS[id].reserve };
    this.reloadLeft = this.cooldown = this.bloom = 0;
  }

  select(id: WeaponId) {
    if (id === this.current) return;
    this.current = id;
    this.reloadLeft = 0;
    this.cooldown = Math.max(this.cooldown, 0.2); // délai de sortie d'arme
  }

  cycle(delta: number) {
    const i = WEAPON_ORDER.indexOf(this.current);
    this.select(WEAPON_ORDER[(i + delta + WEAPON_ORDER.length) % WEAPON_ORDER.length]);
  }

  reload() {
    const w = this.def;
    const a = this.ammo[this.current];
    if (w.magSize === 0 || this.reloadLeft > 0 || a.mag >= w.magSize) return;
    if (!this.unlimited && a.reserve <= 0) return;
    this.reloadLeft = w.reloadTime;
    audio.play('reload');
  }

  ammoText(id: WeaponId) {
    const w = WEAPONS[id];
    if (w.magSize === 0) return '∞';
    const a = this.ammo[id];
    return `${a.mag}/${this.unlimited ? '∞' : a.reserve}`;
  }

  update(dt: number, trigger: TriggerState, cam: ThirdPersonCamera, player: PlayerController) {
    const w = this.def;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.bloom = Math.max(0, this.bloom - w.bloomRecover * dt);

    // Dispersion : visée, mouvement, saut et accroupissement l'influencent.
    const moving = 1 + Math.min(1, player.horizontalSpeed / PLAYER.sprintSpeed) * 0.8;
    const base = trigger.aiming ? w.spreadAim : w.spreadHip;
    this.spread = base * moving * (player.grounded ? 1 : 1.6) * (player.crouching ? 0.75 : 1) + this.bloom;

    if (this.reloadLeft > 0) {
      this.reloadLeft -= dt;
      if (this.reloadLeft <= 0) this.finishReload();
      return;
    }
    const a = this.ammo[this.current];
    if (w.magSize > 0 && a.mag <= 0) {
      if (!this.unlimited && a.reserve <= 0) {
        if (trigger.pressed) audio.play('empty');
        return;
      }
      this.reload();
      return;
    }
    const pull = w.automatic ? trigger.held : trigger.pressed;
    if (pull && this.cooldown <= 0) this.fire(w, a, cam, player, trigger.aiming);
  }

  private finishReload() {
    const w = this.def;
    const a = this.ammo[this.current];
    const take = this.unlimited ? w.magSize - a.mag : Math.min(w.magSize - a.mag, a.reserve);
    a.mag += take;
    if (!this.unlimited) a.reserve -= take;
    this.reloadLeft = 0;
  }

  private fire(w: WeaponDef, a: Ammo, cam: ThirdPersonCamera, player: PlayerController, aiming: boolean) {
    this.cooldown = w.fireInterval;
    if (w.magSize > 0) a.mag--;

    const camPos = cam.camera.position;
    const fwd = cam.forward;
    const eye = this.tmp.set(player.pos.x, player.pos.y + player.eyeHeight, player.pos.z);
    const t0 = Math.max(0, eye.sub(camPos).dot(fwd));
    const origin = camPos.clone().addScaledVector(fwd, t0);

    // Base orthonormée autour de l'axe de visée pour disperser les plombs dans un cône.
    const up = Math.abs(fwd.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const u = new THREE.Vector3().crossVectors(fwd, up).normalize();
    const v = new THREE.Vector3().crossVectors(u, fwd).normalize();
    const dirs: THREE.Vector3[] = [];
    for (let i = 0; i < w.pellets; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.tan(this.spread * Math.sqrt(Math.random()));
      dirs.push(fwd.clone().addScaledVector(u, Math.cos(ang) * r).addScaledVector(v, Math.sin(ang) * r).normalize());
    }

    // Retour visuel immédiat (le serveur décidera des dégâts réels).
    const muzzle = this.ctx.avatar.getMuzzleWorld(new THREE.Vector3());
    const targets = this.ctx.getTargets();
    for (const d of dirs) {
      const hit = this.ctx.world.raycast(origin, d, w.range, targets);
      const end = hit ? new THREE.Vector3(hit.point.x, hit.point.y, hit.point.z) : origin.clone().addScaledVector(d, w.range);
      if (!w.melee) this.ctx.effects.tracer(muzzle, end);
      if (hit) this.ctx.effects.impact(end, IMPACT_COLORS[hit.kind]);
    }
    if (w.melee) this.ctx.avatar.swing();
    else this.ctx.effects.muzzleFlash(muzzle);
    audio.play(w.id as SoundId);

    this.ctx.sendFire({
      weapon: w.id,
      origin: { x: origin.x, y: origin.y, z: origin.z },
      dirs: dirs.map((d) => ({ x: d.x, y: d.y, z: d.z })),
    });

    // Recul : surtout vertical, légère composante horizontale aléatoire.
    const kick = w.recoil * (aiming ? 0.6 : 1);
    cam.addRecoil(kick, (Math.random() - 0.5) * kick * 0.5);
    this.bloom = Math.min(w.bloomMax, this.bloom + w.bloomPerShot);
  }
}
