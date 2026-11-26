/**
 * Placement sur grille :
 *  1. on choisit une cellule cible (ciblage partagé avec les bots, voir shared/buildTarget),
 *  2. on affiche une prévisualisation translucide (bleue = valide, rouge = invalide),
 *  3. clic gauche (maintenu = construction en rafale) : placement prédit localement
 *     puis confirmé / annulé par le serveur.
 */
import * as THREE from 'three';
import { computeBuildCandidate } from '@shared/buildTarget';
import { BUILD_MAX_DISTANCE, PLAYER } from '@shared/constants';
import { distance } from '@shared/math';
import {
  STRUCTURE_MAX_HP,
  isSpecInBounds,
  structureCenter,
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
}

/** Délai minimal entre deux pièces en construction continue (secondes). */
const TURBO_BUILD_DELAY = 0.15;

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
    const spec = computeBuildCandidate(
      this.piece,
      { pos: player.pos, slopeDir: player.slopeDir, yaw: cam.yaw, pitch: cam.pitch },
      (key) => this.ctx.world.getStructure(key),
    );
    const key = structureKey(spec);
    const eye = { x: player.pos.x, y: player.pos.y + PLAYER.eyeHeight, z: player.pos.z };
    const valid =
      isSpecInBounds(spec, this.ctx.world.arena.halfSize) &&
      !this.ctx.world.hasStructure(key) &&
      this.ctx.canAfford() &&
      distance(structureCenter(spec), eye) <= BUILD_MAX_DISTANCE;
    this.showPreview(spec, key, valid);

    // Construction en rafale : bouton maintenu → on pose chaque nouvel emplacement visé,
    // avec un court délai pour qu'un simple clic ne pose qu'une pièce.
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (!buttonHeld) this.lastPlacedKey = '';
    else if (valid && key !== this.lastPlacedKey && this.cooldown <= 0) this.place(spec, key);
  }

  private place(spec: StructureSpec, key: string) {
    const maxHp = STRUCTURE_MAX_HP[spec.type];
    this.ctx.world.addStructure({ ...spec, id: key, hp: maxHp, maxHp, owner: this.ctx.selfId(), edit: 0 }, true);
    this.ctx.sendBuild(spec);
    this.lastPlacedKey = key;
    this.cooldown = TURBO_BUILD_DELAY;
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
}
