/**
 * Effets éphémères : traçantes, impacts, flash de bouche, particules (étincelles,
 * éclats de destruction, poussière de construction).
 * Les géométries sont partagées ; seule une petite liste d'objets vivants est mise à jour.
 */
import * as THREE from 'three';

interface Fx {
  obj: THREE.Object3D;
  life: number;
  max: number;
  mat: THREE.Material & { opacity: number };
  grow: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  max: number;
  gravity: number;
}

const SPHERE = new THREE.SphereGeometry(1, 8, 6);
const CUBE = new THREE.BoxGeometry(1, 1, 1);
/** Segment unitaire le long de +Z : orienté / étiré pour chaque traçante. */
const UNIT_LINE = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)]);
const MAX_PARTICLES = 400;

export class Effects {
  private items: Fx[] = [];
  private particles: Particle[] = [];
  private particleMats = new Map<number, THREE.MeshStandardMaterial>();
  /** Réduit le nombre de particules en qualité basse. */
  particleScale = 1;

  constructor(private scene: THREE.Scene) {}

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xfff2a8) {
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(UNIT_LINE, mat);
    line.position.copy(from);
    line.lookAt(to);
    line.scale.set(1, 1, from.distanceTo(to));
    this.push(line, mat, 0.08, 0);
  }

  impact(point: THREE.Vector3, color: number) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    const m = new THREE.Mesh(SPHERE, mat);
    m.position.copy(point);
    m.scale.setScalar(0.08);
    this.push(m, mat, 0.25, 0.5);
    this.burst(point, color, 4, 3, 0.25, 0.04, 6);
  }

  muzzleFlash(pos: THREE.Vector3) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd26a, transparent: true });
    const m = new THREE.Mesh(SPHERE, mat);
    m.position.copy(pos);
    m.scale.setScalar(0.14);
    this.push(m, mat, 0.05, 1);
  }

  /** Éclats de bois / pierre quand une construction est détruite. */
  debris(center: THREE.Vector3, color: number) {
    this.burst(center, color, 22, 7, 1.1, 0.28, 18);
  }

  /** Petite bouffée de poussière quand une pièce est posée. */
  buildPuff(center: THREE.Vector3) {
    this.burst(center, 0xe8dcc0, 8, 2.5, 0.4, 0.12, 2);
  }

  /** Éclaboussure de dégâts sur un joueur. */
  blood(point: THREE.Vector3, headshot: boolean) {
    this.burst(point, headshot ? 0xffd23a : 0xff3b3b, headshot ? 10 : 6, 4, 0.35, 0.06, 8);
  }

  burst(at: THREE.Vector3, color: number, count: number, speed: number, life: number, size: number, gravity: number) {
    const n = Math.max(1, Math.round(count * this.particleScale));
    let mat = this.particleMats.get(color);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true });
      this.particleMats.set(color, mat);
    }
    for (let i = 0; i < n; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.removeParticle(0);
      const mesh = new THREE.Mesh(CUBE, mat);
      mesh.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * size * 4, (Math.random() - 0.5) * size * 4, (Math.random() - 0.5) * size * 4));
      const s = size * (0.5 + Math.random());
      mesh.scale.setScalar(s);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize();
      this.scene.add(mesh);
      const l = life * (0.6 + Math.random() * 0.6);
      this.particles.push({
        mesh,
        vel: dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8)),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        life: l,
        max: l,
        gravity,
      });
    }
  }

  private removeParticle(i: number) {
    this.scene.remove(this.particles[i].mesh);
    this.particles.splice(i, 1);
  }

  private push(obj: THREE.Object3D, mat: Fx['mat'], life: number, grow: number) {
    this.scene.add(obj);
    this.items.push({ obj, life, max: life, mat, grow });
  }

  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const fx = this.items[i];
      fx.life -= dt;
      fx.mat.opacity = Math.max(0, fx.life / fx.max);
      if (fx.grow) fx.obj.scale.multiplyScalar(1 + fx.grow * dt * 10);
      if (fx.life > 0) continue;
      this.scene.remove(fx.obj);
      fx.mat.dispose();
      this.items.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.removeParticle(i);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += p.spin.x * dt;
      p.mesh.rotation.y += p.spin.y * dt;
      // Rétrécit en fin de vie.
      const k = Math.min(1, p.life / (p.max * 0.4));
      p.mesh.scale.multiplyScalar(k < 1 ? 0.92 : 1);
    }
  }
}
