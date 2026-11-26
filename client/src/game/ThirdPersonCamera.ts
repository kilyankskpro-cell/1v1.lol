/**
 * Caméra TPS "par-dessus l'épaule droite".
 *  - yaw / pitch pilotés par la souris (Pointer Lock),
 *  - décalage d'épaule interpolé selon l'état (normal, visée, lunette, construction),
 *  - FOV interpolé (zoom léger en visée, fort zoom au sniper),
 *  - anti-clipping : un rayon pivot → caméra rapproche la caméra si un mur s'interpose.
 */
import * as THREE from 'three';
import { clamp } from '@shared/math';

export type CameraMode = 'normal' | 'aim' | 'scope' | 'build';

/** (droite, haut, arrière) relatifs au pivot (yeux du joueur). */
const OFFSETS: Record<CameraMode, THREE.Vector3> = {
  normal: new THREE.Vector3(0.9, 0.55, 4.2),
  aim: new THREE.Vector3(1.0, 0.5, 2.4),
  scope: new THREE.Vector3(0.45, 0.15, 1.2),
  build: new THREE.Vector3(1.0, 0.7, 4.8),
};

export const BASE_FOV = 75;
const PITCH_LIMIT = 1.45;

export type RaycastFn = (o: THREE.Vector3, d: THREE.Vector3, maxT: number) => number | null;

export class ThirdPersonCamera {
  yaw = 0;
  pitch = 0;
  /** Sensibilité de base (rad / pixel), multipliée par le réglage utilisateur. */
  sensitivity = 0.0022;
  invertY = false;
  /** Champ de vision hors visée (réglable dans les paramètres). */
  baseFov = BASE_FOV;
  /** Direction de visée (centre de l'écran). */
  readonly forward = new THREE.Vector3(0, 0, -1);
  private offset = OFFSETS.normal.clone();
  private pivot = new THREE.Vector3();
  private right = new THREE.Vector3();
  private up = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private dir = new THREE.Vector3();

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** Sensibilité proportionnelle au FOV : la visée au sniper reste précise. */
  rotate(dx: number, dy: number) {
    const s = this.sensitivity * (this.camera.fov / this.baseFov);
    this.yaw -= dx * s;
    this.pitch = clamp(this.pitch - dy * s * (this.invertY ? -1 : 1), -PITCH_LIMIT, PITCH_LIMIT);
  }

  addRecoil(pitchKick: number, yawKick: number) {
    this.pitch = clamp(this.pitch + pitchKick, -PITCH_LIMIT, PITCH_LIMIT);
    this.yaw += yawKick;
  }

  update(dt: number, playerPos: THREE.Vector3, eyeHeight: number, mode: CameraMode, fov: number, raycast: RaycastFn) {
    const k = 1 - Math.exp(-14 * dt);
    this.offset.lerp(OFFSETS[mode], k);
    this.camera.fov += (fov - this.camera.fov) * k;
    this.camera.updateProjectionMatrix();

    const cp = Math.cos(this.pitch);
    this.forward.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.up.crossVectors(this.right, this.forward);

    this.pivot.set(playerPos.x, playerPos.y + eyeHeight, playerPos.z);
    this.desired
      .copy(this.pivot)
      .addScaledVector(this.right, this.offset.x)
      .addScaledVector(this.up, this.offset.y)
      .addScaledVector(this.forward, -this.offset.z);

    // Anti-clipping : on garde 25 cm de marge devant l'obstacle.
    this.dir.subVectors(this.desired, this.pivot);
    const dist = this.dir.length();
    this.dir.divideScalar(dist);
    const hit = raycast(this.pivot, this.dir, dist + 0.25);
    const camDist = hit === null ? dist : Math.max(0.2, Math.min(dist, hit - 0.25));

    this.camera.position.copy(this.pivot).addScaledVector(this.dir, camDist);
    this.camera.lookAt(this.desired.copy(this.camera.position).add(this.forward));
  }
}
