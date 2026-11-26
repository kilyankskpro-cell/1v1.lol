/**
 * Intelligence artificielle d'un bot de duel (exécutée côté serveur, dans Room).
 *
 * Le bot utilise exactement les mêmes règles qu'un joueur : même moteur de
 * déplacement (CharacterMotor), même ciblage de grille pour construire
 * (computeBuildCandidate), mêmes tirs validés par Room. Il n'a pas de "triche" :
 * il ne voit le joueur que s'il a une ligne de vue, et sa visée suit la cible
 * avec un temps de réaction et une erreur qui dépendent de la difficulté.
 *
 * Comportements :
 *  - poursuite / maintien d'une distance préférée + strafe gauche-droite et sauts,
 *  - tir (fusil à pompe de près, fusil d'assaut sinon, pistolet en secours),
 *  - casse les constructions qui le séparent du joueur,
 *  - se met à couvert (mur) quand il prend des dégâts,
 *  - "ramp rush" (rampes + murs de protection) pour prendre la hauteur,
 *  - se débloque en sautant quand il est coincé.
 */
import { computeBuildCandidate, dirToYaw, STEP, yawToDir } from '@shared/buildTarget';
import { GRID, PLAYER } from '@shared/constants';
import type { Colliders, Rot } from '@shared/geometry';
import { clamp, type Vec3 } from '@shared/math';
import { CharacterMotor, NO_INPUT, type MoveInput } from '@shared/movement';
import type { BotDifficulty } from '@shared/protocol';
import type { Structure, StructureSpec } from '@shared/structures';
import { WEAPONS, type WeaponId } from '@shared/weapons';

interface BotProfile {
  /** Délai avant de tirer quand la cible apparaît (s). */
  reaction: number;
  /** Amplitude de l'erreur de visée (rad). */
  aimError: number;
  /** Vitesse de suivi de la visée (1/s). */
  aimSpeed: number;
  /** Délai supplémentaire aléatoire entre deux tirs (s). */
  fireDelay: number;
  buildCooldown: number;
  /** Probabilité de construire un mur de couvert quand il est touché. */
  coverChance: number;
  /** Probabilité (par seconde d'engagement) de lancer une montée en rampes. */
  rushRate: number;
  rushPieceDelay: number;
  jumpRate: number;
  preferredRange: number;
  headshotBias: number;
  strafeSwitch: number;
}

const PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: {
    reaction: 0.8, aimError: 0.11, aimSpeed: 3, fireDelay: 0.6, buildCooldown: 2.6, coverChance: 0.3,
    rushRate: 0.04, rushPieceDelay: 0.55, jumpRate: 0.15, preferredRange: 16, headshotBias: 0, strafeSwitch: 1.6,
  },
  normal: {
    reaction: 0.35, aimError: 0.045, aimSpeed: 6.5, fireDelay: 0.15, buildCooldown: 1.3, coverChance: 0.65,
    rushRate: 0.12, rushPieceDelay: 0.35, jumpRate: 0.3, preferredRange: 11, headshotBias: 0.25, strafeSwitch: 1.1,
  },
  hard: {
    reaction: 0.17, aimError: 0.022, aimSpeed: 12, fireDelay: 0.02, buildCooldown: 0.55, coverChance: 0.92,
    rushRate: 0.25, rushPieceDelay: 0.2, jumpRate: 0.5, preferredRange: 7, headshotBias: 0.55, strafeSwitch: 0.7,
  },
};

export interface BotTarget {
  id: string;
  pos: Vec3;
  crouch: boolean;
  alive: boolean;
}

export interface BotWorld {
  halfSize: number;
  colliders(): Colliders;
  /** Distance du premier obstacle sur le segment, et la construction touchée s'il y en a une. */
  lineOfSight(from: Vec3, to: Vec3): { clear: boolean; structureId?: string; t: number };
  getStructure(key: string): Structure | undefined;
  build(spec: StructureSpec): boolean;
  fire(weapon: WeaponId, origin: Vec3, dirs: Vec3[]): void;
  materials(): number;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const BOT_GUNS: WeaponId[] = ['ar', 'shotgun', 'pistol'];

export class BotBrain {
  readonly motor = new CharacterMotor();
  yaw = 0;
  pitch = 0;
  weapon: WeaponId = 'ar';
  building = false;
  private p: BotProfile;
  private mag = {} as Record<WeaponId, number>;
  private reloadLeft = 0;
  private cooldown = 0;
  private seeTime = 0;
  private strafeDir = 1;
  private strafeTimer = 0;
  private buildCd = 0;
  private buildingTimer = 0;
  private pendingCover: Vec3 | null = null;
  private rush: { dir: Rot; left: number } | null = null;
  private stuckTimer = 0;
  private aimHead = false;
  private aimRoll = 0;
  private time = 0;
  private phase = Math.random() * 100;

  constructor(readonly difficulty: BotDifficulty) {
    this.p = PROFILES[difficulty];
    this.reset({ x: 0, y: 0, z: 0, yaw: 0 });
  }

  get eyeHeight() {
    return this.motor.eyeHeight;
  }

  reset(spawn: { x: number; y: number; z: number; yaw: number }) {
    this.motor.teleport(spawn.x, spawn.y, spawn.z);
    this.yaw = this.motor.yaw = spawn.yaw;
    this.pitch = 0;
    for (const id of BOT_GUNS) this.mag[id] = WEAPONS[id].magSize;
    this.weapon = 'ar';
    this.reloadLeft = this.cooldown = this.seeTime = this.buildCd = 0;
    this.pendingCover = null;
    this.rush = null;
    this.building = false;
  }

  /** Touché : il cherchera à se couvrir face au tireur. */
  onDamaged(from: Vec3) {
    if (Math.random() < this.p.coverChance) this.pendingCover = { ...from };
  }

  update(dt: number, target: BotTarget | null, world: BotWorld) {
    this.time += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.buildCd = Math.max(0, this.buildCd - dt);
    this.buildingTimer = Math.max(0, this.buildingTimer - dt);
    this.building = this.buildingTimer > 0;
    this.updateReload(dt);

    if (!target || !target.alive) {
      this.motor.update(dt, NO_INPUT, world.colliders());
      this.rush = null;
      return;
    }

    const pos = this.motor.pos;
    const eye = { x: pos.x, y: pos.y + this.eyeHeight, z: pos.z };
    if ((this.aimRoll -= dt) <= 0) {
      this.aimRoll = 0.8 + Math.random() * 0.6;
      this.aimHead = Math.random() < this.p.headshotBias;
    }
    const h = target.crouch ? PLAYER.crouchHeight : PLAYER.height;
    const aimPoint = { x: target.pos.x, y: target.pos.y + (this.aimHead ? h - PLAYER.headRadius : h * 0.6), z: target.pos.z };
    const dx = aimPoint.x - eye.x;
    const dy = aimPoint.y - eye.y;
    const dz = aimPoint.z - eye.z;
    const flat = Math.hypot(dx, dz);
    const dist = Math.hypot(flat, dy);

    const los = world.lineOfSight(eye, aimPoint);
    this.seeTime = los.clear ? this.seeTime + dt : 0;

    // ---- Visée : suit la cible avec inertie + erreur qui ondule (dépend de la difficulté).
    const err = this.p.aimError * (1 + Math.min(1, dist / 40));
    const noiseYaw = err * (Math.sin(this.time * 1.7 + this.phase) * 0.7 + Math.sin(this.time * 4.3) * 0.3);
    const noisePitch = err * 0.6 * Math.sin(this.time * 2.3 + this.phase * 2);
    const wantYaw = Math.atan2(-dx, -dz) + noiseYaw;
    const wantPitch = Math.atan2(dy, flat) + noisePitch;
    const k = 1 - Math.exp(-this.p.aimSpeed * dt);
    this.yaw = wrapAngle(this.yaw + wrapAngle(wantYaw - this.yaw) * k);
    this.pitch = clamp(this.pitch + (wantPitch - this.pitch) * k, -1.4, 1.4);
    const aimErr = Math.abs(wrapAngle(Math.atan2(-dx, -dz) - this.yaw)) + Math.abs(Math.atan2(dy, flat) - this.pitch);

    // ---- Construction : couvert quand il est touché, montée en rampes pour la hauteur.
    if (!this.rush) this.considerBuilding(dt, target, dist, world);
    if (this.rush) this.updateRush(dt, world);

    // ---- Armes et tir.
    this.chooseWeapon(dist);
    const w = WEAPONS[this.weapon];
    const canShoot = this.reloadLeft <= 0 && this.cooldown <= 0 && !this.building;
    if (canShoot && los.clear && this.seeTime >= this.p.reaction && aimErr < 0.15 + 1.2 / Math.max(dist, 1) && dist < w.range) {
      this.shoot(world, eye);
    } else if (canShoot && !los.clear && los.structureId && dist < 30 && !this.rush) {
      // Une construction nous sépare de la cible : on la casse.
      this.shoot(world, eye);
    }

    // ---- Déplacement.
    this.motor.yaw = this.yaw;
    this.motor.update(dt, this.computeMove(dt, flat, los.clear, target), world.colliders());
  }

  // -------------------------------------------------------------------------

  private computeMove(dt: number, dist: number, visible: boolean, target: BotTarget): MoveInput {
    let wx = 0;
    let wz = 0;
    const pos = this.motor.pos;
    const toX = (target.pos.x - pos.x) / Math.max(dist, 0.01);
    const toZ = (target.pos.z - pos.z) / Math.max(dist, 0.01);

    if (this.rush) {
      const s = STEP[this.rush.dir];
      wx = s.dx;
      wz = s.dz;
    } else {
      // Approche / recul autour de la distance préférée, + strafe perpendiculaire.
      const range = this.p.preferredRange;
      const approach = !visible ? 1 : dist > range + 2 ? 1 : dist < range - 4 ? -0.7 : 0;
      if ((this.strafeTimer -= dt) <= 0) {
        this.strafeTimer = this.p.strafeSwitch * (0.6 + Math.random() * 0.8);
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      const strafe = visible ? 1 : 0.5;
      wx = toX * approach + -toZ * this.strafeDir * strafe;
      wz = toZ * approach + toX * this.strafeDir * strafe;
    }

    // Conversion monde → repère du bot (avant / droite selon son yaw).
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    const forward = wx * fx + wz * fz;
    const right = wx * rx + wz * rz;
    const wants = Math.hypot(wx, wz) > 0.1;

    // Coincé contre un obstacle : on saute et on change de côté.
    let jump = false;
    if (wants && this.motor.grounded && this.motor.horizontalSpeed < 1.2) this.stuckTimer += dt;
    else this.stuckTimer = 0;
    if (this.stuckTimer > 0.35) {
      jump = true;
      this.strafeDir *= -1;
      this.stuckTimer = 0;
    }
    if (visible && !this.rush && Math.random() < this.p.jumpRate * dt) jump = true;

    return { forward, right, jump, sprint: !visible || dist > 15 || !!this.rush, crouch: false };
  }

  private considerBuilding(dt: number, target: BotTarget, dist: number, world: BotWorld) {
    if (this.buildCd > 0 || world.materials() <= 0) return;
    const pos = this.motor.pos;

    if (this.pendingCover) {
      const from = this.pendingCover;
      this.pendingCover = null;
      const dir = yawToDir(Math.atan2(-(from.x - pos.x), -(from.z - pos.z)));
      const placed = this.place(world, computeBuildCandidate('wall', this.builder(dirToYaw(dir), 0), (k) => world.getStructure(k)));
      this.buildCd = this.p.buildCooldown;
      // Couvert posé : souvent suivi d'une rampe derrière le mur pour reprendre la hauteur.
      if (placed && Math.random() < this.p.coverChance * 0.7) this.startRush(dir, world);
      return;
    }

    const higher = target.pos.y > pos.y + 2.5;
    const rate = higher ? this.p.rushRate * 4 : this.p.rushRate;
    if (dist < 32 && Math.random() < rate * dt) {
      const dir = yawToDir(Math.atan2(-(target.pos.x - pos.x), -(target.pos.z - pos.z)));
      this.startRush(dir, world);
    }
  }

  /** Première rampe dans sa propre cellule (adossée au mur éventuel), puis prolongement. */
  private startRush(dir: Rot, world: BotWorld) {
    const pos = this.motor.pos;
    const spec: StructureSpec = {
      type: 'ramp',
      ix: Math.floor(pos.x / GRID),
      iy: Math.max(0, Math.floor((pos.y + 0.3) / GRID)),
      iz: Math.floor(pos.z / GRID),
      rot: dir,
    };
    this.place(world, spec);
    this.placeFrontWall(world, spec);
    this.rush = { dir, left: 1.6 + Math.random() * 1.6 + (this.difficulty === 'hard' ? 1.5 : 0) };
    this.buildCd = this.p.rushPieceDelay;
  }

  private updateRush(dt: number, world: BotWorld) {
    const rush = this.rush!;
    rush.left -= dt;
    if (rush.left <= 0 || world.materials() <= 0) {
      this.rush = null;
      this.buildCd = this.p.buildCooldown;
      return;
    }
    if (this.buildCd > 0) return;
    const spec = computeBuildCandidate('ramp', this.builder(dirToYaw(rush.dir), 0), (k) => world.getStructure(k));
    const lim = world.halfSize / GRID;
    if (Math.abs(spec.ix + 0.5) >= lim - 1 || Math.abs(spec.iz + 0.5) >= lim - 1) {
      this.rush = null; // bord de l'arène
      return;
    }
    this.place(world, spec);
    this.placeFrontWall(world, spec);
    this.buildCd = this.p.rushPieceDelay;
  }

  /** Mur de protection sur le bord haut de la rampe (ne bloque pas la rampe suivante). */
  private placeFrontWall(world: BotWorld, ramp: StructureSpec) {
    const { ix, iy, iz } = ramp;
    const r = ramp.rot as Rot;
    const wall: StructureSpec =
      r === 0 ? { type: 'wall', ix, iy, iz: iz + 1, rot: 0 }
      : r === 2 ? { type: 'wall', ix, iy, iz, rot: 0 }
      : r === 1 ? { type: 'wall', ix: ix + 1, iy, iz, rot: 1 }
      : { type: 'wall', ix, iy, iz, rot: 1 };
    this.place(world, wall);
  }

  private place(world: BotWorld, spec: StructureSpec) {
    const ok = world.build(spec);
    if (ok) this.buildingTimer = 0.25;
    return ok;
  }

  private builder(yaw: number, pitch: number) {
    return { pos: this.motor.pos, slopeDir: this.motor.slopeDir, yaw, pitch };
  }

  private chooseWeapon(dist: number) {
    let want: WeaponId = dist < 8 ? 'shotgun' : 'ar';
    if (this.mag[want] <= 0 && this.reloadLeft <= 0) want = this.mag.pistol > 0 ? 'pistol' : want;
    if (want !== this.weapon && this.reloadLeft <= 0) {
      this.weapon = want;
      this.cooldown = Math.max(this.cooldown, 0.25);
    }
    if (this.mag[this.weapon] <= 0 && this.reloadLeft <= 0) this.reloadLeft = WEAPONS[this.weapon].reloadTime;
  }

  private updateReload(dt: number) {
    if (this.reloadLeft <= 0) return;
    this.reloadLeft -= dt;
    if (this.reloadLeft <= 0) this.mag[this.weapon] = WEAPONS[this.weapon].magSize;
  }

  private shoot(world: BotWorld, eye: Vec3) {
    const w = WEAPONS[this.weapon];
    const spread = w.spreadHip * 0.85;
    const cp = Math.cos(this.pitch);
    const f = { x: -Math.sin(this.yaw) * cp, y: Math.sin(this.pitch), z: -Math.cos(this.yaw) * cp };
    const up = { x: 0, y: 1, z: 0 };
    const u = normalize(cross(f, up));
    const v = cross(u, f);
    const dirs: Vec3[] = [];
    for (let i = 0; i < w.pellets; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.tan(spread * Math.sqrt(Math.random()));
      dirs.push(
        normalize({
          x: f.x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * r,
          y: f.y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * r,
          z: f.z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * r,
        }),
      );
    }
    world.fire(this.weapon, eye, dirs);
    this.mag[this.weapon]--;
    this.cooldown = w.fireInterval * 1.05 + Math.random() * this.p.fireDelay;
  }
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}
