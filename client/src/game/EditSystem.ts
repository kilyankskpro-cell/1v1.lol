/**
 * Édition des murs sur une grille 3×3 (façon 1v1.LOL) :
 *  - G en visant un mur : ouvre l'édition, une grille de 9 cases apparaît sur la face visible,
 *  - clic gauche : sélectionne / désélectionne une case (maintenir pour "peindre" plusieurs cases),
 *  - G (ou Entrée) : valide → la géométrie et les collisions du mur sont reconstruites,
 *  - clic droit : annule ; R : remet le mur plein.
 * Les cases sélectionnées (bleues) sont retirées du mur : bas + milieu = porte, milieu = fenêtre…
 */
import * as THREE from 'three';
import { GRID, WALL_THICKNESS } from '@shared/constants';
import { EDIT_GRID, FULL_EDIT_MASK, type Structure, type WallEdit } from '@shared/structures';
import type { ThirdPersonCamera } from './ThirdPersonCamera';
import type { World } from './World';

const TILE = GRID / EDIT_GRID;
const TILE_GEOM = new THREE.PlaneGeometry(TILE - 0.08, TILE - 0.08);
const mat = (color: number, opacity: number) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide });
const MATS = {
  solid: mat(0xffffff, 0.22),
  solidHover: mat(0xffe680, 0.45),
  removed: mat(0x2f8cff, 0.6),
  removedHover: mat(0x7fc0ff, 0.75),
};

interface ActiveEdit {
  id: string;
  wall: Structure;
  mask: WallEdit;
  original: WallEdit;
  side: number;
}

export class EditSystem {
  active: ActiveEdit | null = null;
  private overlay = new THREE.Group();
  private tiles: THREE.Mesh[] = [];
  private hover = -1;
  /** Pendant un glisser : état appliqué aux cases survolées (true = retirer). */
  private paint: boolean | null = null;

  constructor(
    private scene: THREE.Scene,
    private world: World,
  ) {
    for (let i = 0; i < EDIT_GRID * EDIT_GRID; i++) {
      const m = new THREE.Mesh(TILE_GEOM, MATS.solid);
      m.renderOrder = 20;
      this.tiles.push(m);
      this.overlay.add(m);
    }
    this.overlay.visible = false;
    scene.add(this.overlay);
  }

  get editing() {
    return this.active !== null;
  }

  /** Renvoie un message d'erreur, ou null si l'édition a commencé. */
  begin(cam: ThirdPersonCamera, canModify: (s: Structure) => boolean): string | null {
    const hit = this.world.raycast(cam.camera.position, cam.forward, 16);
    const s = hit?.structureId ? this.world.getStructure(hit.structureId) : undefined;
    if (!s || s.type !== 'wall') return 'Visez un mur pour le modifier';
    if (!canModify(s)) return 'Vous ne pouvez modifier que vos propres constructions';

    const x0 = s.ix * GRID;
    const y0 = s.iy * GRID;
    const z0 = s.iz * GRID;
    const camP = cam.camera.position;
    const side = s.rot % 2 === 0 ? Math.sign(camP.z - z0) || 1 : Math.sign(camP.x - x0) || 1;
    const off = WALL_THICKNESS / 2 + 0.03;
    this.tiles.forEach((m, i) => {
      const col = i % EDIT_GRID;
      const row = Math.floor(i / EDIT_GRID);
      const u = (col + 0.5) * TILE;
      const v = y0 + (row + 0.5) * TILE;
      if (s.rot % 2 === 0) {
        m.position.set(x0 + u, v, z0 + side * off);
        m.rotation.set(0, 0, 0);
      } else {
        m.position.set(x0 + side * off, v, z0 + u);
        m.rotation.set(0, Math.PI / 2, 0);
      }
    });
    this.active = { id: s.id, wall: s, mask: s.edit, original: s.edit, side };
    this.overlay.visible = true;
    this.paint = null;
    this.refresh();
    return null;
  }

  /** Clic gauche : pressed = début du clic, held = bouton maintenu. */
  update(cam: ThirdPersonCamera, pressed: boolean, held: boolean): boolean {
    const a = this.active;
    if (!a) return false;
    if (!this.world.getStructure(a.id)) {
      this.cancel();
      return false;
    }
    this.hover = this.tileUnderCrosshair(cam, a.wall);
    let changed = false;
    if (!held) this.paint = null;
    if (this.hover >= 0) {
      const bit = 1 << this.hover;
      if (pressed) this.paint = !(a.mask & bit);
      if (held && this.paint !== null) {
        const next = this.paint ? a.mask | bit : a.mask & ~bit;
        changed = next !== a.mask;
        a.mask = next;
      }
    }
    this.refresh();
    return changed;
  }

  private tileUnderCrosshair(cam: ThirdPersonCamera, s: Structure) {
    const o = cam.camera.position;
    const d = cam.forward;
    const x0 = s.ix * GRID;
    const y0 = s.iy * GRID;
    const z0 = s.iz * GRID;
    const alongZ = s.rot % 2 === 0;
    const dn = alongZ ? d.z : d.x;
    if (Math.abs(dn) < 1e-6) return -1;
    const t = ((alongZ ? z0 : x0) - (alongZ ? o.z : o.x)) / dn;
    if (t <= 0 || t > 20) return -1;
    const u = (alongZ ? o.x + d.x * t : o.z + d.z * t) - (alongZ ? x0 : z0);
    const v = o.y + d.y * t - y0;
    if (u < 0 || u >= GRID || v < 0 || v >= GRID) return -1;
    return Math.floor(v / TILE) * EDIT_GRID + Math.floor(u / TILE);
  }

  private refresh() {
    const a = this.active;
    if (!a) return;
    this.tiles.forEach((m, i) => {
      const removed = !!(a.mask & (1 << i));
      const hovered = i === this.hover;
      m.material = removed ? (hovered ? MATS.removedHover : MATS.removed) : hovered ? MATS.solidHover : MATS.solid;
    });
  }

  /** Remet toutes les cases (mur plein). */
  resetTiles() {
    if (this.active) this.active.mask = 0;
    this.refresh();
  }

  /** Valide : renvoie l'édition à appliquer, ou un message d'erreur. */
  confirm(): { id: string; edit: WallEdit } | { error: string } | null {
    const a = this.active;
    if (!a) return null;
    if (a.mask === FULL_EDIT_MASK) return { error: 'Un mur doit garder au moins une case' };
    this.close();
    return a.mask === a.original ? null : { id: a.id, edit: a.mask };
  }

  cancel() {
    this.close();
  }

  private close() {
    this.active = null;
    this.overlay.visible = false;
    this.hover = -1;
    this.paint = null;
  }
}
