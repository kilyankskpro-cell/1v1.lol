/**
 * Génère les meshes Three.js directement à partir des colliders partagés :
 * ce que le joueur voit correspond exactement à ce qui bloque les balles.
 *
 * Optimisation : les géométries (et leurs arêtes) sont mises en cache par
 * dimensions et partagées entre toutes les constructions identiques — poser
 * une pièce ne crée jamais de nouvelle géométrie si une pièce identique existe.
 */
import * as THREE from 'three';
import { GRID } from '@shared/constants';
import type { Colliders } from '@shared/geometry';
import { structureColliders, type StructureSpec, type WallEdit } from '@shared/structures';

const SLAB = 0.2;
const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x3b2410, transparent: true, opacity: 0.6 });

const geometryCache = new Map<string, THREE.BufferGeometry>();
const edgesCache = new WeakMap<THREE.BufferGeometry, THREE.EdgesGeometry>();

/**
 * Boîte partagée. `uvWorld` = taille monde d'une répétition de texture : les UV de
 * chaque face sont mis à l'échelle de ses dimensions (une case d'édition reçoit
 * 1/3 de la texture au lieu d'une texture entière écrasée).
 */
function sharedBox(w: number, h: number, d: number, uvWorld: number | null) {
  const key = `box:${w.toFixed(3)}:${h.toFixed(3)}:${d.toFixed(3)}:${uvWorld ?? '-'}`;
  let geom = geometryCache.get(key);
  if (!geom) {
    geom = new THREE.BoxGeometry(w, h, d);
    if (uvWorld) {
      // Ordre des faces de BoxGeometry : +x, -x, +y, -y, +z, -z (4 sommets chacune).
      const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      const uv = geom.attributes.uv as THREE.BufferAttribute;
      for (let f = 0; f < 6; f++) {
        for (let v = 0; v < 4; v++) {
          const i = f * 4 + v;
          uv.setXY(i, (uv.getX(i) * dims[f][0]) / uvWorld, (uv.getY(i) * dims[f][1]) / uvWorld);
        }
      }
    }
    geom.userData.shared = true;
    geometryCache.set(key, geom);
  }
  return geom;
}

function sharedCone(r: number, h: number) {
  const key = `cone:${r.toFixed(3)}:${h.toFixed(3)}`;
  let geom = geometryCache.get(key);
  if (!geom) {
    geom = new THREE.ConeGeometry(r, h, 4, 1);
    geom.userData.shared = true;
    geometryCache.set(key, geom);
  }
  return geom;
}

function edgesOf(geom: THREE.BufferGeometry) {
  let e = edgesCache.get(geom);
  if (!e) {
    e = new THREE.EdgesGeometry(geom);
    e.userData.shared = true;
    edgesCache.set(geom, e);
  }
  return e;
}

function addMesh(group: THREE.Group, geom: THREE.BufferGeometry, mat: THREE.Material, edges: boolean) {
  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (edges) mesh.add(new THREE.LineSegments(edgesOf(geom), edgeMaterial));
  group.add(mesh);
  return mesh;
}

export function buildColliderMeshes(c: Colliders, mat: THREE.Material, edges: boolean, uvWorld: number | null = null): THREE.Group {
  const group = new THREE.Group();

  for (const b of c.boxes) {
    const geom = sharedBox(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z, uvWorld);
    const m = addMesh(group, geom, mat, edges);
    m.position.set((b.min.x + b.max.x) / 2, (b.min.y + b.max.y) / 2, (b.min.z + b.max.z) / 2);
  }

  for (const s of c.slopes) {
    const alongZ = s.dir % 2 === 0;
    const run = alongZ ? s.maxZ - s.minZ : s.maxX - s.minX;
    const width = alongZ ? s.maxX - s.minX : s.maxZ - s.minZ;
    const diag = Math.hypot(run, s.h);
    const angle = Math.atan2(s.h, run);
    const geom = alongZ ? sharedBox(width, SLAB, diag, uvWorld) : sharedBox(diag, SLAB, width, uvWorld);
    const m = addMesh(group, geom, mat, edges);
    m.position.set((s.minX + s.maxX) / 2, s.y + s.h / 2, (s.minZ + s.maxZ) / 2);
    // Rx(-θ) relève l'extrémité +Z ; Rz(+θ) relève l'extrémité +X.
    if (s.dir === 0) m.rotation.x = -angle;
    else if (s.dir === 2) m.rotation.x = angle;
    else if (s.dir === 1) m.rotation.z = angle;
    else m.rotation.z = -angle;
  }

  for (const p of c.pyramids) {
    const m = addMesh(group, sharedCone(p.half * Math.SQRT2, p.h), mat, edges);
    m.position.set(p.cx, p.y + p.h / 2, p.cz);
    m.rotation.y = Math.PI / 4;
  }

  return group;
}

export function buildStructureObject(s: StructureSpec & { edit?: WallEdit }, mat: THREE.Material, edges = true) {
  return buildColliderMeshes(structureColliders(s), mat, edges, GRID);
}

/** Libère les géométries non partagées (les matériaux sont gérés par l'appelant). */
export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if ((o instanceof THREE.Mesh || o instanceof THREE.LineSegments) && !o.geometry.userData.shared) o.geometry.dispose();
  });
}
