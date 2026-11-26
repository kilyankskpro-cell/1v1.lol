/**
 * Autre joueur (humain, bot ou cible) : interpolation entre les snapshots serveur
 * avec ~110 ms de retard, ce qui lisse la gigue réseau ("entity interpolation").
 */
import * as THREE from 'three';
import type { PlayerKind, PublicPlayer } from '@shared/protocol';
import { Avatar, type AvatarLook } from './Avatar';

const INTERP_DELAY_MS = 110;

interface Sample {
  t: number;
  p: THREE.Vector3;
  yaw: number;
  pitch: number;
}

const LOOK_BY_KIND: Record<PlayerKind, AvatarLook> = { player: 'agent', bot: 'agent', target: 'dummy' };
const LABEL_COLOR: Record<PlayerKind, string> = { player: '#ff6b5e', bot: '#ff6b5e', target: '#ffb02e' };

export class RemotePlayer {
  avatar = new Avatar('agent');
  name = '';
  kind: PlayerKind = 'player';
  alive = true;
  crouch = false;
  hp = 100;
  shield = 100;
  private buffer: Sample[] = [];
  private label: THREE.Sprite;

  constructor(
    readonly id: string,
    private scene: THREE.Scene,
  ) {
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
    this.label.position.y = 2.3;
    this.label.scale.set(2, 0.5, 1);
    this.label.visible = false; // affichée dès que le nom est connu
    this.avatar.group.add(this.label);
    scene.add(this.avatar.group);
  }

  get feet() {
    return this.avatar.group.position;
  }

  private setKind(kind: PlayerKind) {
    if (kind === this.kind) return;
    this.kind = kind;
    const old = this.avatar.group;
    this.avatar = new Avatar(LOOK_BY_KIND[kind]);
    this.avatar.group.position.copy(old.position);
    this.avatar.group.rotation.copy(old.rotation);
    old.remove(this.label);
    this.scene.remove(old);
    this.avatar.group.add(this.label);
    this.scene.add(this.avatar.group);
    this.drawLabel();
  }

  push(pp: PublicPlayer) {
    this.setKind(pp.kind);
    if (pp.name !== this.name) {
      this.name = pp.name;
      this.drawLabel();
    }
    this.alive = pp.alive;
    this.crouch = pp.crouch;
    this.hp = pp.hp;
    this.shield = pp.shield;
    this.avatar.setCrouch(pp.crouch);
    this.avatar.setAir(pp.air);
    this.avatar.setWeapon(pp.building ? null : pp.weapon);
    this.buffer.push({ t: performance.now(), p: new THREE.Vector3(pp.p.x, pp.p.y, pp.p.z), yaw: pp.yaw, pitch: pp.pitch });
    if (this.buffer.length > 30) this.buffer.shift();
  }

  /** Téléportation (nouvelle manche, réapparition) : on vide le tampon pour ne pas interpoler à travers la carte. */
  snapTo(x: number, y: number, z: number) {
    this.buffer = [];
    this.avatar.group.position.set(x, y, z);
    this.avatar.resetMotion();
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

  private drawLabel() {
    this.label.visible = this.name !== '';
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(this.name, 128, 44);
    ctx.fillStyle = LABEL_COLOR[this.kind];
    ctx.fillText(this.name, 128, 44);
    const mat = this.label.material;
    mat.map?.dispose();
    mat.map = new THREE.CanvasTexture(canvas);
    mat.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.avatar.group);
    this.label.material.map?.dispose();
    this.label.material.dispose();
  }
}

function lerpAngle(a: number, b: number, t: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
