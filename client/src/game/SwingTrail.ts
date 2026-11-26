/**
 * Traînée blanche du coup de pioche : ruban construit à partir des positions
 * successives de la lame (repère local du personnage), qui s'estompe en fin de coup.
 */
import * as THREE from 'three';

const MAX = 18;

export class SwingTrail {
  readonly mesh: THREE.Mesh;
  private points: THREE.Vector3[][] = [];
  private positions = new Float32Array(MAX * 2 * 3);
  private geom = new THREE.BufferGeometry();
  private mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  private fade = 0;

  constructor() {
    const index: number[] = [];
    for (let i = 0; i < MAX - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geom.setIndex(index);
    this.geom.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.mesh = new THREE.Mesh(this.geom, this.mat);
    this.mesh.frustumCulled = false;
  }

  /** Ajoute un échantillon (points intérieur et extérieur de la lame). */
  push(inner: THREE.Vector3, outer: THREE.Vector3) {
    this.points.push([inner.clone(), outer.clone()]);
    if (this.points.length > MAX) this.points.shift();
    this.fade = 0.18;
    this.rebuild();
  }

  update(dt: number) {
    if (this.fade <= 0) return;
    this.fade = Math.max(0, this.fade - dt);
    this.mat.opacity = (this.fade / 0.18) * 0.85;
    if (this.fade === 0) this.points = [];
  }

  private rebuild() {
    const n = this.points.length;
    for (let i = 0; i < MAX; i++) {
      const [inner, outer] = this.points[Math.min(i, n - 1)];
      // L'extrémité la plus ancienne s'affine : la traînée prend une forme de croissant.
      const k = n > 1 ? Math.min(i, n - 1) / (n - 1) : 1;
      const mid = inner.clone().lerp(outer, 1 - k * 0.9);
      this.positions.set([mid.x, mid.y, mid.z, outer.x, outer.y, outer.z], i * 6);
    }
    this.geom.attributes.position.needsUpdate = true;
    this.geom.setDrawRange(0, Math.max(0, n - 1) * 6);
  }
}
