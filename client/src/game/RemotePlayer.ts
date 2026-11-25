/**
 * Adversaire : interpolation entre les snapshots serveur avec ~110 ms de retard,
 * ce qui lisse la gigue réseau (technique classique "entity interpolation").
 */
import * as THREE from 'three';
import type { PublicPlayer } from '@shared/protocol';
import { Avatar } from './Avatar';

const INTERP_DELAY_MS = 110;

interface Sample {
  t: number;
  p: THREE.Vector3;
  yaw: number;
  pitch: number;
}

export class RemotePlayer {
  readonly avatar = new Avatar(0xe0473f);
  name = '';
  alive = true;
  crouch = false;
  private buffer: Sample[] = [];
  private label: THREE.Sprite;

  constructor(
    readonly id: string,
    scene: THREE.Scene,
  ) {
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    this.label.position.y = 2.3;
    this.label.scale.set(2, 0.5, 1);
    this.avatar.group.add(this.label);
    scene.add(this.avatar.group);
  }

  get feet() {
    return this.avatar.group.position;
  }

  push(pp: PublicPlayer) {
    if (pp.name !== this.name) this.setName(pp.name);
    this.alive = pp.alive;
    this.crouch = pp.crouch;
    this.avatar.setCrouch(pp.crouch);
    this.avatar.setWeapon(pp.building ? null : pp.weapon);
    this.buffer.push({ t: performance.now(), p: new THREE.Vector3(pp.p.x, pp.p.y, pp.p.z), yaw: pp.yaw, pitch: pp.pitch });
    if (this.buffer.length > 30) this.buffer.shift();
  }

  /** Téléportation (nouvelle manche) : on vide le tampon pour ne pas interpoler à travers la carte. */
  snapTo(x: number, y: number, z: number) {
    this.buffer = [];
    this.avatar.group.position.set(x, y, z);
  }

  update(dt: number) {
    this.avatar.group.visible = this.alive;
    this.avatar.update(dt);
    if (this.buffer.length === 0) return;

    const renderT = performance.now() - INTERP_DELAY_MS;
    let a = this.buffer[0];
    let b = a;
    for (let i = 0; i < this.buffer.length - 1; i++) {
      if (this.buffer[i + 1].t >= renderT) {
        a = this.buffer[i];
        b = this.buffer[i + 1];
        break;
      }
      a = b = this.buffer[i + 1];
    }
    const k = b.t > a.t ? THREE.MathUtils.clamp((renderT - a.t) / (b.t - a.t), 0, 1) : 1;
    this.avatar.group.position.lerpVectors(a.p, b.p, k);
    this.avatar.group.rotation.y = lerpAngle(a.yaw, b.yaw, k);
    this.avatar.setPitch(a.pitch + (b.pitch - a.pitch) * k);
  }

  private setName(name: string) {
    this.name = name;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(name, 128, 44);
    ctx.fillStyle = '#ff6b5e';
    ctx.fillText(name, 128, 44);
    const mat = this.label.material;
    mat.map?.dispose();
    mat.map = new THREE.CanvasTexture(canvas);
    mat.needsUpdate = true;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.avatar.group);
  }
}

function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
