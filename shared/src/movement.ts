/**
 * Moteur de déplacement d'un personnage, partagé entre le joueur local (client)
 * et les bots (serveur) : les deux obéissent exactement à la même physique.
 *
 *  1. accélération vers la vitesse souhaitée (sol : réactif, air : contrôle réduit),
 *  2. déplacement horizontal axe par axe + repoussement hors des boîtes (cylindre vs AABB),
 *  3. déplacement vertical : gravité, plafonds, puis "sol" = surface la plus haute
 *     sous les pieds (boîtes, rampes, toits) atteignable via la hauteur de marche.
 * Les rampes ne bloquent pas horizontalement : on les monte grâce au step / snap.
 * Petits plus de confort : "coyote time" (saut juste après avoir quitté un rebord)
 * et mémoire de saut (appui un peu avant l'atterrissage).
 */
import { PLAYER } from './constants';
import { pyramidHeightAt, slopeHeightAt, type AABB, type Colliders, type Rot } from './geometry';
import type { Vec3 } from './math';

export interface MoveInput {
  forward: number;
  right: number;
  jump: boolean;
  sprint: boolean;
  crouch: boolean;
}

export const NO_INPUT: MoveInput = { forward: 0, right: 0, jump: false, sprint: false, crouch: false };

const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.12;
/** Chute ignorée en dessous de cette vitesse pour l'évènement d'atterrissage. */
const LAND_EVENT_SPEED = 4;

export class CharacterMotor {
  yaw = 0;
  grounded = false;
  crouching = false;
  /** Direction de la rampe sous nos pieds (null si pas sur une rampe). */
  slopeDir: Rot | null = null;
  /** Évènements de la dernière mise à jour (sons, animations). */
  jumped = false;
  landedSpeed = 0;
  private airTime = 0;
  private jumpBuffer = 0;
  private jumpHeld = false;

  constructor(
    readonly pos: Vec3 = { x: 0, y: 0, z: 0 },
    readonly vel: Vec3 = { x: 0, y: 0, z: 0 },
  ) {}

  get height() {
    return this.crouching ? PLAYER.crouchHeight : PLAYER.height;
  }

  get eyeHeight() {
    return this.crouching ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight;
  }

  get horizontalSpeed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  teleport(x: number, y: number, z: number) {
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.grounded = false;
    this.slopeDir = null;
  }

  update(dt: number, input: MoveInput, col: Colliders) {
    this.jumped = false;
    this.landedSpeed = 0;
    this.crouching = input.crouch;
    const sprinting = input.sprint && input.forward > 0 && !this.crouching;
    const speed = this.crouching ? PLAYER.crouchSpeed : sprinting ? PLAYER.sprintSpeed : PLAYER.walkSpeed;

    // Direction souhaitée dans le repère monde (yaw = 0 → regarde vers -Z).
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let wx = -sin * input.forward + cos * input.right;
    let wz = -cos * input.forward - sin * input.right;
    const len = Math.hypot(wx, wz);
    if (len > 0) {
      wx = (wx / len) * speed;
      wz = (wz / len) * speed;
    }

    // Accélération plus vive que la décélération au sol ; contrôle aérien réduit.
    const rate = this.grounded ? (len > 0 ? 14 : 10) : 4;
    const k = 1 - Math.exp(-rate * dt);
    this.vel.x += (wx - this.vel.x) * k;
    this.vel.z += (wz - this.vel.z) * k;

    // Saut : mémoire d'appui + coyote time. Maintenir Espace enchaîne les sauts.
    if (input.jump && !this.jumpHeld) this.jumpBuffer = JUMP_BUFFER;
    else if (input.jump && this.grounded) this.jumpBuffer = JUMP_BUFFER;
    this.jumpHeld = input.jump;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (this.jumpBuffer > 0 && (this.grounded || this.airTime < COYOTE_TIME) && this.vel.y <= 0.01) {
      this.vel.y = PLAYER.jumpSpeed;
      this.grounded = false;
      this.airTime = COYOTE_TIME;
      this.jumpBuffer = 0;
      this.jumped = true;
    }
    this.vel.y -= PLAYER.gravity * dt;

    // --- Horizontal (axe par axe pour glisser le long des murs) ---
    this.pos.x += this.vel.x * dt;
    this.resolveHorizontal(col.boxes);
    this.pos.z += this.vel.z * dt;
    this.resolveHorizontal(col.boxes);

    // --- Vertical ---
    const prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    if (this.vel.y > 0) this.resolveCeiling(col.boxes, prevY + this.height);

    const wasGrounded = this.grounded;
    const ground = this.groundHeight(col, Math.max(prevY, this.pos.y) + PLAYER.stepHeight);

    if (this.vel.y <= 0 && this.pos.y <= ground.h) {
      if (!wasGrounded && -this.vel.y > LAND_EVENT_SPEED) this.landedSpeed = -this.vel.y;
      this.land(ground);
    } else if (wasGrounded && this.vel.y <= 0 && this.pos.y - ground.h < 0.8) {
      // "Snap" vers le bas : on colle au sol en descendant une rampe au lieu de rebondir.
      this.land(ground);
    } else {
      this.grounded = false;
      this.slopeDir = null;
    }
  }

  private land(ground: { h: number; slope: Rot | null }) {
    this.pos.y = ground.h;
    this.vel.y = 0;
    this.grounded = true;
    this.slopeDir = ground.slope;
  }

  /** Cylindre (cercle en XZ) contre AABB : repousse le personnage hors des obstacles. */
  private resolveHorizontal(boxes: AABB[]) {
    const r = PLAYER.radius;
    const feet = this.pos.y;
    const head = feet + this.height;
    for (const b of boxes) {
      // Les obstacles assez bas sont "enjambés" (gérés comme du sol).
      if (b.max.y <= feet + PLAYER.stepHeight || b.min.y >= head) continue;
      const cx = Math.min(Math.max(this.pos.x, b.min.x), b.max.x);
      const cz = Math.min(Math.max(this.pos.z, b.min.z), b.max.z);
      const dx = this.pos.x - cx;
      const dz = this.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;

      let nx: number;
      let nz: number;
      let push: number;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        nx = dx / d;
        nz = dz / d;
        push = r - d;
      } else {
        // Centre à l'intérieur de la boîte : sortie par la face la plus proche.
        const exits = [
          { nx: -1, nz: 0, p: this.pos.x - b.min.x + r },
          { nx: 1, nz: 0, p: b.max.x - this.pos.x + r },
          { nx: 0, nz: -1, p: this.pos.z - b.min.z + r },
          { nx: 0, nz: 1, p: b.max.z - this.pos.z + r },
        ].sort((a, c) => a.p - c.p)[0];
        ({ nx, nz } = exits);
        push = exits.p;
      }
      this.pos.x += nx * push;
      this.pos.z += nz * push;
      const vn = this.vel.x * nx + this.vel.z * nz;
      if (vn < 0) {
        this.vel.x -= nx * vn;
        this.vel.z -= nz * vn;
      }
    }
  }

  /** Empêche de traverser un sol/plafond en sautant. */
  private resolveCeiling(boxes: AABB[], prevHead: number) {
    const r = PLAYER.radius * 0.9;
    for (const b of boxes) {
      if (b.min.y < prevHead - 0.01 || this.pos.y + this.height <= b.min.y) continue;
      if (!this.overlapsXZ(b, r)) continue;
      this.pos.y = b.min.y - this.height;
      this.vel.y = 0;
    }
  }

  private overlapsXZ(b: AABB, r: number) {
    const cx = Math.min(Math.max(this.pos.x, b.min.x), b.max.x);
    const cz = Math.min(Math.max(this.pos.z, b.min.z), b.max.z);
    return (this.pos.x - cx) ** 2 + (this.pos.z - cz) ** 2 < r * r;
  }

  /** Surface la plus haute sous le personnage, sans dépasser maxY. */
  private groundHeight(col: Colliders, maxY: number): { h: number; slope: Rot | null } {
    let h = -Infinity;
    let slope: Rot | null = null;
    const { x, z } = this.pos;
    for (const b of col.boxes) {
      if (b.max.y <= maxY && b.max.y > h && this.overlapsXZ(b, PLAYER.radius * 0.6)) {
        h = b.max.y;
        slope = null;
      }
    }
    for (const s of col.slopes) {
      const sh = slopeHeightAt(s, x, z);
      if (sh !== null && sh <= maxY && sh > h) {
        h = sh;
        slope = s.dir;
      }
    }
    for (const p of col.pyramids) {
      const ph = pyramidHeightAt(p, x, z);
      if (ph !== null && ph <= maxY && ph > h) {
        h = ph;
        slope = null;
      }
    }
    return { h, slope };
  }
}
