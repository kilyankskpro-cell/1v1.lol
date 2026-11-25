/**
 * Génère les meshes Three.js directement à partir des colliders partagés :
 * ce que le joueur voit correspond exactement à ce qui bloque les balles.
 */
import * as THREE from 'three';
import type { Colliders } from '@shared/geometry';
import { structureColliders, type StructureSpec, type WallEdit } from '@shared/structures';

const SLAB = 0.2;
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x3b2410, transparent: true, opacity: 0.6 });

function addMesh(group: THREE.Group, geom: THREE.BufferGeometry, mat: THREE.Material, edges: boolean) {
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (edges) mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geom), edgeMaterial));
  group.add(mesh);
  return mesh;
}

export function buildColliderMeshes(c: Colliders, mat: THREE.Material, edges: boolean): THREE.Group {
  const group = new THREE.Group();

  for (const b of c.boxes) {
    const geom = new THREE.BoxGeometry(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
    const m = addMesh(group, geom, mat, edges);
    m.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  }

  for (const s of c.slopes) {
    const alongZ = s.dir % 2 === 0;
    const run = alongZ ? s.maxZ - s.minZ : s.maxX - s.minX;
    const width = alongZ ? s.maxX - s.minX : s.maxZ - s.minZ;
    const diag = Math.hypot(run, s.h);
    const angle = Math.atan2(s.h, run);
    const geom = alongZ ? new THREE.BoxGeometry(width, SLAB, diag) : new THREE.BoxGeometry(diag, SLAB, width);
    const m = addMesh(group, geom, mat, edges);
    m.position.set((s.minX + s.maxX) / 2, s.y + s.h / 2, (s.minZ + s.maxZ) / 2);
    // Rx(-θ) relève l'extrémité +Z ; Rz(+θ) relève l'extrémité +X.
    if (s.dir === 0) m.rotation.x = -angle;
    else if (s.dir === 2) m.rotation.x = angle;
    else if (s.dir === 1) m.rotation.z = angle;
    else m.rotation.z = -angle;
  }

  for (const p of c.pyramids) {
    const geom = new THREE.ConeGeometry(p.half * Math.SQRT2, p.h, 4, 1);
    const m = addMesh(group, geom, mat, edges);
    m.position.set(p.cx, p.y + p.h / 2, p.cz);
    m.rotation.y = Math.PI / 4;
  }

  return group;
}

export function buildStructureObject(s: StructureSpec & { edit?: WallEdit }, mat: THREE.Material, edges = true) {
  return buildColliderMeshes(structureColliders(s), mat, edges);
}

/** Libère les géométries (les matériaux sont gérés par l'appelant). */
export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) o.geometry.dispose();
  });
}
