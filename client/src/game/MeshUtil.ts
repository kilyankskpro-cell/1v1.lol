/** Petites aides de construction de meshes low-poly (ombrage plat). */
import * as THREE from 'three';

const Z = new THREE.Vector3(0, 0, 1);

export const flat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.75, ...extra });

export function box(w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Cylindre orienté le long de Z (canons, lunettes). */
export function tube(r: number, len: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 6) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

/** Segment de section carrée reliant deux points (bras, jambes, lames). */
export function limb(a: THREE.Vector3, b: THREE.Vector3, w: number, mat: THREE.Material, h = w) {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d.length()), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(Z, d.normalize());
  m.castShadow = true;
  return m;
}

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
