/**
 * Placement sur grille :
 *  1. on choisit une cellule cible à partir de la position du joueur, de son orientation
 *     (accrochée à l'axe dominant N/E/S/O) et du pitch caméra (regarder en haut = étage +1),
 *  2. on affiche une prévisualisation translucide (bleue = valide, rouge = invalide),
 *  3. clic gauche (maintenu = construction en rafale) : placement prédit localement
 *     puis confirmé / annulé par le serveur.
 * Édition (G) : bascule mur plein → porte → fenêtre sur ses propres murs.
 */
import * as THREE from 'three';
import { GRID } from '@shared/constants';
import type { Rot } from '@shared/geometry';
import type { EditMsg } from '@shared/protocol';
import {
  STRUCTURE_MAX_HP,
  WALL_EDIT_CYCLE,
  isSpecInBounds,
  normalizeSpec,
  structureKey,
  type StructureSpec,
  type StructureType,
} from '@shared/structures';
import type { PlayerController } from './PlayerController';
import { buildStructureObject, disposeObject } from './StructureMesh';
import type { ThirdPersonCamera } from './ThirdPersonCamera';
import type { World } from './World';

export interface BuildContext {
  scene: THREE.Scene;
  world: World;
  selfId: () => string;
  canAfford: () => boolean;
  sendBuild: (spec: StructureSpec) => void;
  sendEdit: (msg: EditMsg) => void;
}

/** Pas de grille associé à chaque direction (0:+Z, 1:+X, 2:-Z, 3:-X). */
const STEP: Record<Rot, { dx: number; dz: number }> = {
  0: { dx: 0, dz: 1 },
  1: { dx: 1, dz: 0 },
  2: { dx: 0, dz: -1 },
  3: { dx: -1, dz: 0 },
};

/** Délai minimal entre deux pièces en construction continue (secondes). */
const TURBO_BUILD_DELAY = 0.15;

export const EDIT_LABELS = { none: 'Mur plein', door: 'Porte', window: 'Fenêtre' } as const;

export class BuildSystem {
  piece: StructureType | null = null;
  private preview: THREE.Group | null = null;
  private previewId = '';
  private lastPlacedKey = '';
  private cooldown = 0;
  private matValid = new THREE.MeshBasicMaterial({ color: 0x3aa0ff, transparent: true, opacity: 0.38, depthWrite: false });
  private matInvalid = new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.38, depthWrite: false });

  constructor(private ctx: BuildContext) {}

  setPiece(piece: StructureType | null) {
    this.piece = piece;
    if (!piece) this.hidePreview();
  }

  update(dt: number, player: PlayerController, cam: ThirdPersonCamera, buttonHeld: boolean) {
    if (!this.piece) return;
    const spec = this.computeCandidate(this.piece, player, cam);
    const key = structureKey(spec);
    const valid =
      isSpecInBounds(spec, this.ctx.world.arena.halfSize) && !this.ctx.world.hasStructure(key) && this.ctx.canAfford();
    this.showPreview(spec, key, valid);

    // Construction en rafale : bouton maintenu → on pose chaque nouvel emplacement visé,
    // avec un court délai pour qu'un simple clic ne pose qu'une pièce.
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!buttonHeld) this.lastPlacedKey = '';
    else if (valid && key !== this.lastPlacedKey && this.cooldown <= 0) this.place(spec, key);
  }

  private place(spec: StructureSpec, key: string) {
    const maxHp = STRUCTURE_MAX_HP[spec.type];
    this.ctx.world.addStructure({ ...spec, id: key, hp: maxHp, maxHp, owner: this.ctx.selfId(), edit: 'none' }, true);
    this.ctx.sendBuild(spec);
    this.lastPlacedKey = key;
    this.cooldown = TURBO_BUILD_DELAY;
  }

  /** Détermine la pièce visée sur la grille. */
  computeCandidate(piece: StructureType, player: PlayerController, cam: ThirdPersonCamera): StructureSpec {
    const p = player.pos;
    const fx = -Math.sin(cam.yaw);
    const fz = -Math.cos(cam.yaw);
    const dir: Rot = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : fz > 0 ? 0 : 2;
    const step = STEP[dir];
    const cx = Math.floor(p.x / GRID);
    const cz = Math.floor(p.z / GRID);
    const level = Math.max(0, Math.floor((p.y + 0.5) / GRID));
    const pitch = cam.pitch;
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
        if (player.slopeDir === dir) {
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
          const existing = this.ctx.world.getStructure(structureKey({ type: 'ramp', ix, iy, iz, rot: dir }));
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

  private showPreview(spec: StructureSpec, key: string, valid: boolean) {
    const id = `${key}:${spec.rot}:${valid}`;
    if (id === this.previewId) return;
    this.hidePreview();
    this.preview = buildStructureObject(spec, valid ? this.matValid : this.matInvalid, false);
    this.preview.traverse((o) => (o.castShadow = false));
    this.preview.renderOrder = 10;
    this.ctx.scene.add(this.preview);
    this.previewId = id;
  }

  hidePreview() {
    if (!this.preview) return;
    this.ctx.scene.remove(this.preview);
    disposeObject(this.preview);
    this.preview = null;
    this.previewId = '';
  }

  /** Édition : retourne un message à afficher au joueur. */
  tryEdit(cam: ThirdPersonCamera): string {
    const hit = this.ctx.world.raycast(cam.camera.position, cam.forward, 14);
    const s = hit?.structureId ? this.ctx.world.getStructure(hit.structureId) : undefined;
    if (!s || s.type !== 'wall') return 'Visez un mur pour l’éditer';
    if (s.owner !== this.ctx.selfId()) return 'Vous ne pouvez éditer que vos propres murs';
    const next = WALL_EDIT_CYCLE[(WALL_EDIT_CYCLE.indexOf(s.edit) + 1) % WALL_EDIT_CYCLE.length];
    this.ctx.world.updateStructure(s.id, s.hp, next);
    this.ctx.sendEdit({ id: s.id, edit: next });
    return `Édition : ${EDIT_LABELS[next]}`;
  }
}
