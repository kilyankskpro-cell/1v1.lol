/**
 * Joueur local : le moteur de déplacement partagé (identique à celui des bots),
 * avec des vecteurs Three.js pour s'intégrer directement au rendu.
 */
import * as THREE from 'three';
import { CharacterMotor } from '@shared/movement';

export { NO_INPUT, type MoveInput } from '@shared/movement';

export class PlayerController extends CharacterMotor {
  declare readonly pos: THREE.Vector3;
  declare readonly vel: THREE.Vector3;

  constructor() {
    super(new THREE.Vector3(), new THREE.Vector3());
  }
}
