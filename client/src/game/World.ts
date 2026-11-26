/**
 * Monde côté client : rendu de l'arène, registre des structures (meshes + colliders)
 * et requêtes de raycast pour la caméra, les armes et l'édition.
 * Animations : apparition des pièces (petit "pop"), tremblement à l'impact,
 * destruction (affaissement + fondu + éclats) avec retrait immédiat de la collision.
 */
import * as THREE from 'three';
import type { ArenaDef } from '@shared/arena';
import { GRID } from '@shared/constants';
import { emptyColliders, mergeColliders, rayColliders, type Colliders } from '@shared/geometry';
import type { Vec3 } from '@shared/math';
import { raycastWorld, type HitTarget, type RayHit, type StructureCollidable } from '@shared/raycast';
import { structureCenter, structureColliders, type Structure, type WallEdit } from '@shared/structures';
import type { Effects } from './Effects';
import { CRATE_MAT, buildRamps, metalFloorTexture, spaceSkyTexture } from './SpaceTheme';
import { DEBRIS_COLORS, STRUCTURE_DAMAGED, STRUCTURE_TINT, createStructureMaterial } from './StructureMaterials';
import { buildColliderMeshes, buildStructureObject, disposeObject } from './StructureMesh';

const SPAWN_TIME = 0.14;
const DESTROY_TIME = 0.35;

interface StructureRecord {
  data: Structure;
  /** Pivot au centre de la pièce (pour les animations), meshes en enfant. */
  group: THREE.Group;
  inner: THREE.Group;
  center: THREE.Vector3;
  colliders: Colliders;
  material: THREE.MeshStandardMaterial;
  pending: boolean;
  shake: number;
  spawn: number;
}

interface Dying {
  group: THREE.Group;
  material: THREE.MeshStandardMaterial;
  t: number;
}

export class World {
  readonly sun: THREE.DirectionalLight;
  private structures = new Map<string, StructureRecord>();
  private dying: Dying[] = [];
  private merged: Colliders | null = null;
  private collidables: StructureCollidable[] | null = null;
  private time = 0;

  constructor(
    private scene: THREE.Scene,
    readonly arena: ArenaDef,
    private effects: Effects,
  ) {
    this.sun = this.buildEnvironment();
  }

  // -------------------------------------------------------------------------
  // Décor
  // -------------------------------------------------------------------------

  private buildEnvironment() {
    const scene = this.scene;
    scene.background = spaceSkyTexture();
    scene.fog = new THREE.Fog(0x07060f, 140, 420);

    scene.add(new THREE.HemisphereLight(0xc9d2ff, 0x6a6470, 1.6));
    // Lumière d'appoint opposée au soleil : les personnages vus de dos ne sont plus noirs.
    const fill = new THREE.DirectionalLight(0xaab8ff, 0.7);
    fill.position.set(40, 20, -30);
    scene.add(fill);
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(-40, 35, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
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
    return sun;
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
      const editChanged = existing.data.edit !== s.edit;
      existing.data = { ...s };
      if (editChanged) this.rebuild(existing);
      this.refreshVisual(existing);
      return;
    }
    const c = structureCenter(s);
    const center = new THREE.Vector3(c.x, c.y, c.z);
    const material = createStructureMaterial(s.type);
    const group = new THREE.Group();
    group.position.copy(center);
    const inner = buildStructureObject(s, material);
    inner.position.copy(center).negate();
    group.add(inner);
    const rec: StructureRecord = {
      data: { ...s },
      group,
      inner,
      center,
      colliders: structureColliders(s),
      material,
      pending,
      shake: 0,
      spawn: SPAWN_TIME,
    };
    this.structures.set(s.id, rec);
    this.scene.add(group);
    this.refreshVisual(rec);
    this.invalidate();
    this.effects.buildPuff(center.clone().setY(s.iy * GRID + 0.2));
  }

  updateStructure(id: string, hp: number, edit: WallEdit) {
    const rec = this.structures.get(id);
    if (!rec) return;
    if (hp < rec.data.hp) rec.shake = 0.25;
    rec.data.hp = hp;
    if (edit !== rec.data.edit) {
      rec.data.edit = edit;
      this.rebuild(rec);
    }
    this.refreshVisual(rec);
  }

  private rebuild(rec: StructureRecord) {
    rec.group.remove(rec.inner);
    disposeObject(rec.inner);
    rec.inner = buildStructureObject(rec.data, rec.material);
    rec.inner.position.copy(rec.center).negate();
    rec.group.add(rec.inner);
    rec.colliders = structureColliders(rec.data);
    this.invalidate();
  }

  /** destroyed = animation de destruction ; sinon retrait instantané (prédiction refusée, nouvelle manche). */
  removeStructure(id: string, destroyed = false) {
    const rec = this.structures.get(id);
    if (!rec) return;
    this.structures.delete(id);
    this.invalidate(); // la collision disparaît immédiatement
    if (destroyed) {
      rec.material.transparent = true;
      this.dying.push({ group: rec.group, material: rec.material, t: 0 });
      this.effects.debris(rec.center, DEBRIS_COLORS[rec.data.type]);
      return;
    }
    this.scene.remove(rec.group);
    disposeObject(rec.group);
    rec.material.dispose();
  }

  clearStructures() {
    for (const id of [...this.structures.keys()]) this.removeStructure(id);
  }

  /** Aspect visuel : la pièce s'assombrit et rougeoie à mesure que les PV baissent. */
  private refreshVisual(rec: StructureRecord) {
    const ratio = Math.max(0, rec.data.hp / rec.data.maxHp);
    rec.material.color.copy(STRUCTURE_TINT).lerp(STRUCTURE_DAMAGED, (1 - ratio) * 0.85);
    rec.material.emissive.setRGB(ratio < 0.34 ? 0.3 : 0, ratio < 0.34 ? 0.04 : 0, 0);
    rec.material.transparent = rec.pending;
    rec.material.opacity = rec.pending ? 0.6 : 1;
  }

  update(dt: number) {
    this.time += dt;
    for (const rec of this.structures.values()) {
      if (rec.spawn > 0) {
        rec.spawn = Math.max(0, rec.spawn - dt);
        const k = 1 - rec.spawn / SPAWN_TIME;
        rec.group.scale.setScalar(0.85 + 0.15 * (1 - (1 - k) ** 3));
      }
      if (rec.shake <= 0) continue;
      rec.shake = Math.max(0, rec.shake - dt);
      const a = rec.shake * 0.25;
      rec.group.position.set(rec.center.x + Math.sin(this.time * 90) * a, rec.center.y, rec.center.z + Math.cos(this.time * 77) * a);
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      const k = Math.min(1, d.t / DESTROY_TIME);
      d.group.scale.set(1 + k * 0.15, 1 - k * 0.6, 1 + k * 0.15);
      d.group.position.y -= dt * 3;
      d.material.opacity = 1 - k;
      if (k < 1) continue;
      this.scene.remove(d.group);
      disposeObject(d.group);
      d.material.dispose();
      this.dying.splice(i, 1);
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
