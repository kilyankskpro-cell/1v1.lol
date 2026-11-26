/**
 * Monde côté client : rendu de l'arène, registre des structures (meshes + colliders)
 * et requêtes de raycast pour la caméra, les armes et l'édition.
 */
import * as THREE from 'three';
import type { ArenaDef } from '@shared/arena';
import { emptyColliders, mergeColliders, rayColliders, type Colliders } from '@shared/geometry';
import type { Vec3 } from '@shared/math';
import { raycastWorld, type HitTarget, type RayHit, type StructureCollidable } from '@shared/raycast';
import { structureColliders, type Structure, type WallEdit } from '@shared/structures';
import { buildColliderMeshes, buildStructureObject, disposeObject } from './StructureMesh';
import { CRATE_MAT, buildRamps, metalFloorTexture, spaceSkyTexture } from './SpaceTheme';

const WOOD = new THREE.Color(0xd9a066);
const WOOD_DAMAGED = new THREE.Color(0x5e3a1c);

interface StructureRecord {
  data: Structure;
  group: THREE.Group;
  colliders: Colliders;
  material: THREE.MeshStandardMaterial;
  pending: boolean;
  shake: number;
}

export class World {
  private structures = new Map<string, StructureRecord>();
  private merged: Colliders | null = null;
  private collidables: StructureCollidable[] | null = null;
  private time = 0;

  constructor(
    private scene: THREE.Scene,
    readonly arena: ArenaDef,
  ) {
    this.buildEnvironment();
  }

  // -------------------------------------------------------------------------
  // Décor
  // -------------------------------------------------------------------------

  private buildEnvironment() {
    const scene = this.scene;
    scene.background = spaceSkyTexture();
    scene.fog = new THREE.Fog(0x07060f, 140, 420);

    scene.add(new THREE.HemisphereLight(0xc9d2ff, 0x6a6470, 1.6));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(-40, 35, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = this.arena.halfSize + 8;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, far: 200 });
    scene.add(sun);

    const [ground, ...rest] = this.arena.colliders.boxes;
    // Sol : plaques métalliques alignées sur la grille de construction.
    const groundMat = new THREE.MeshStandardMaterial({
      map: metalFloorTexture(this.arena.halfSize),
      roughness: 0.8,
      metalness: 0.3,
    });
    scene.add(buildColliderMeshes({ boxes: [ground], slopes: [], pyramids: [] }, groundMat, false));

    // Les murs d'enceinte restent des colliders invisibles : la plateforme paraît ouverte sur l'espace.
    const isBoundary = (b: (typeof rest)[number]) => b.max.y - b.min.y >= this.arena.wallHeight - 0.01;
    scene.add(buildColliderMeshes({ boxes: rest.filter((b) => !isBoundary(b)), slopes: [], pyramids: [] }, CRATE_MAT, true));
    scene.add(buildRamps(this.arena.colliders.slopes));
  }

  // -------------------------------------------------------------------------
  // Structures
  // -------------------------------------------------------------------------

  hasStructure(id: string) {
    return this.structures.has(id);
  }

  *structureData(): Iterable<Structure> {
    for (const rec of this.structures.values()) yield rec.data;
  }

  getStructure(id: string): Structure | undefined {
    return this.structures.get(id)?.data;
  }

  /** `pending` = placement prédit localement, en attente de confirmation serveur. */
  addStructure(s: Structure, pending = false) {
    const existing = this.structures.get(s.id);
    if (existing) {
      existing.pending = false;
      existing.data = { ...s };
      this.refreshVisual(existing);
      return;
    }
    const material = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.85 });
    const rec: StructureRecord = {
      data: { ...s },
      group: buildStructureObject(s, material),
      colliders: structureColliders(s),
      material,
      pending,
      shake: 0,
    };
    this.structures.set(s.id, rec);
    this.scene.add(rec.group);
    this.refreshVisual(rec);
    this.invalidate();
  }

  updateStructure(id: string, hp: number, edit: WallEdit) {
    const rec = this.structures.get(id);
    if (!rec) return;
    if (hp < rec.data.hp) rec.shake = 0.25;
    rec.data.hp = hp;
    if (edit !== rec.data.edit) {
      rec.data.edit = edit;
      this.scene.remove(rec.group);
      disposeObject(rec.group);
      rec.group = buildStructureObject(rec.data, rec.material);
      rec.colliders = structureColliders(rec.data);
      this.scene.add(rec.group);
      this.invalidate();
    }
    this.refreshVisual(rec);
  }

  removeStructure(id: string) {
    const rec = this.structures.get(id);
    if (!rec) return;
    this.scene.remove(rec.group);
    disposeObject(rec.group);
    rec.material.dispose();
    this.structures.delete(id);
    this.invalidate();
  }

  clearStructures() {
    for (const id of [...this.structures.keys()]) this.removeStructure(id);
  }

  /** Aspect visuel : le bois s'assombrit et rougeoie à mesure que les PV baissent. */
  private refreshVisual(rec: StructureRecord) {
    const ratio = Math.max(0, rec.data.hp / rec.data.maxHp);
    rec.material.color.copy(WOOD).lerp(WOOD_DAMAGED, 1 - ratio);
    rec.material.emissive.setRGB(ratio < 0.34 ? 0.35 : 0, ratio < 0.34 ? 0.05 : 0, 0);
    rec.material.transparent = rec.pending;
    rec.material.opacity = rec.pending ? 0.6 : 1;
  }

  update(dt: number) {
    this.time += dt;
    for (const rec of this.structures.values()) {
      if (rec.shake <= 0) continue;
      rec.shake = Math.max(0, rec.shake - dt);
      const a = rec.shake * 0.25;
      rec.group.position.set(Math.sin(this.time * 90) * a, 0, Math.cos(this.time * 77) * a);
    }
  }

  private invalidate() {
    this.merged = null;
    this.collidables = null;
  }

  // -------------------------------------------------------------------------
  // Requêtes
  // -------------------------------------------------------------------------

  /** Tous les colliders (arène + structures) — mis en cache jusqu'au prochain changement. */
  getColliders(): Colliders {
    if (!this.merged) {
      this.merged = mergeColliders(emptyColliders(), this.arena.colliders);
      for (const rec of this.structures.values()) mergeColliders(this.merged, rec.colliders);
    }
    return this.merged;
  }

  private structureCollidables(): StructureCollidable[] {
    if (!this.collidables) {
      this.collidables = [...this.structures.values()].map((r) => ({ id: r.data.id, colliders: r.colliders }));
    }
    return this.collidables;
  }

  /** Raycast d'arme : décor, structures et joueurs. */
  raycast(o: Vec3, d: Vec3, maxT: number, players: HitTarget[] = []): RayHit | null {
    return raycastWorld(o, d, maxT, this.arena.colliders, this.structureCollidables(), players);
  }

  /** Raycast "géométrie seule" (caméra). */
  raycastGeometry(o: Vec3, d: Vec3, maxT: number): number | null {
    return rayColliders(o, d, maxT, this.getColliders());
  }
}
