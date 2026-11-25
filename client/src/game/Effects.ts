/** Effets éphémères : traçantes, impacts, flash de bouche. */
import * as THREE from 'three';

interface Fx {
  obj: THREE.Object3D;
  life: number;
  max: number;
  mat: THREE.Material;
  grow: number;
}

const SPHERE = new THREE.SphereGeometry(1, 8, 6);

export class Effects {
  private items: Fx[] = [];

  constructor(private scene: THREE.Scene) {}

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xfff2a8) {
    const geom = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    this.push(new THREE.Line(geom, mat), mat, 0.08, 0);
  }

  impact(point: THREE.Vector3, color: number) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const m = new THREE.Mesh(SPHERE, mat);
    m.position.copy(point);
    m.scale.setScalar(0.08);
    this.push(m, mat, 0.25, 0.5);
  }

  muzzleFlash(pos: THREE.Vector3) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd26a, transparent: true });
    const m = new THREE.Mesh(SPHERE, mat);
    m.position.copy(pos);
    m.scale.setScalar(0.14);
    this.push(m, mat, 0.05, 1);
  }

  private push(obj: THREE.Object3D, mat: THREE.Material, life: number, grow: number) {
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, mat, grow });
  }

  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const fx = this.items[i];
      fx.life -= dt;
      fx.mat.opacity = Math.max(0, fx.life / fx.max);
      fx.obj.scale.multiplyScalar(1 + fx.grow * dt * 10);
      if (fx.life > 0) continue;
      this.scene.remove(fx.obj);
      if (fx.obj instanceof THREE.Line) fx.obj.geometry.dispose();
      fx.mat.dispose();
      this.items.splice(i, 1);
    }
  }
}
