/**
 * Orchestrateur : boucle de rendu, entrées, réseau et sous-systèmes.
 *
 * Ordre d'une frame :
 *   entrées → caméra (souris) → déplacement → caméra (position) → tir / construction
 *   → avatars → envoi réseau → HUD → rendu
 */
import * as THREE from 'three';
import { createArena, type GameMode } from '@shared/arena';
import { BUILD_COST, CLIENT_SEND_RATE, MAX_HEALTH, MAX_SHIELD, STARTING_MATERIALS } from '@shared/constants';
import type { PublicPlayer } from '@shared/protocol';
import type { StructureType } from '@shared/structures';
import { WEAPONS, WEAPON_ORDER } from '@shared/weapons';
import { Avatar } from './Avatar';
import { BuildSystem } from './BuildSystem';
import { Effects } from './Effects';
import { BUILD_KEYS, HUD } from './HUD';
import { Input } from './Input';
import { connect, type GameSocket } from './Network';
import { NO_INPUT, PlayerController, type MoveInput } from './PlayerController';
import { RemotePlayer } from './RemotePlayer';
import { BASE_FOV, ThirdPersonCamera, type CameraMode } from './ThirdPersonCamera';
import { WeaponSystem } from './WeaponSystem';
import { World } from './World';

export class Game {
  private renderer = new THREE.WebGLRenderer({ antialias: true });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 1000);
  private clock = new THREE.Clock();
  private input: Input;
  private net: GameSocket;
  private world: World;
  private player = new PlayerController();
  private tpsCam = new ThirdPersonCamera(this.camera);
  private avatar = new Avatar(0x3a7bff);
  private effects = new Effects(this.scene);
  private hud = new HUD();
  private build: BuildSystem;
  private weapons: WeaponSystem;
  private remotes = new Map<string, RemotePlayer>();

  private selfId = '';
  private round = 0;
  private alive = false;
  private hp = MAX_HEALTH;
  private shield = MAX_SHIELD;
  private materials = STARTING_MATERIALS;
  private unlimited = false;
  private scores: Record<string, number> = {};
  private sendTimer = 0;

  constructor(
    private container: HTMLElement,
    private mode: GameMode,
    private name: string,
  ) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);

    this.world = new World(this.scene, createArena(mode));
    this.scene.add(this.avatar.group);

    this.net = connect();
    this.build = new BuildSystem({
      scene: this.scene,
      world: this.world,
      selfId: () => this.selfId,
      canAfford: () => this.unlimited || this.materials >= BUILD_COST,
      sendBuild: (spec) => {
        if (!this.unlimited) this.materials -= BUILD_COST; // prédiction, corrigée par le snapshot
        this.net.emit('build', spec);
      },
      sendEdit: (msg) => this.net.emit('edit', msg),
    });
    this.weapons = new WeaponSystem({
      world: this.world,
      effects: this.effects,
      avatar: this.avatar,
      getTargets: () =>
        [...this.remotes.values()].filter((r) => r.alive).map((r) => ({ id: r.id, feet: r.feet, crouch: r.crouch })),
      sendFire: (msg) => this.net.emit('fire', msg),
    });

    this.bindNetwork();
    // Accès console pour le débogage en développement : window.__game
    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  start() {
    this.hud.show(this.mode === 'duel' ? 'DUEL 1V1' : 'JUSTBUILD');
    this.hud.message('Connexion…', 0);
    this.net.emit('join', { mode: this.mode, name: this.name });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // -------------------------------------------------------------------------
  // Réseau
  // -------------------------------------------------------------------------

  private bindNetwork() {
    const net = this.net;

    net.on('joined', (m) => {
      this.selfId = m.selfId;
      this.unlimited = m.unlimited;
      for (const s of m.structures) this.world.addStructure(s);
    });

    net.on('roundStart', (m) => {
      this.round = m.round;
      this.scores = m.scores;
      this.world.clearStructures();
      for (const [id, s] of Object.entries(m.spawns)) {
        if (id === this.selfId) {
          this.player.teleport(s.x, s.y, s.z);
          this.tpsCam.yaw = s.yaw;
          this.tpsCam.pitch = 0;
        } else {
          this.remoteFor(id).snapTo(s.x, s.y, s.z);
        }
      }
      this.alive = true;
      this.hp = MAX_HEALTH;
      this.shield = MAX_SHIELD;
      this.materials = STARTING_MATERIALS;
      this.weapons.resetAmmo(this.unlimited);

      const opponents = Object.keys(m.spawns).length - 1;
      if (this.mode === 'duel' && opponents === 0) {
        this.hud.message("En attente d'un adversaire… (ouvrez un 2ᵉ onglet pour tester)", 0);
      } else {
        this.hud.message(this.mode === 'duel' ? `Manche ${m.round} — Combat !` : 'Construisez librement !', 2);
      }
    });

    net.on('snapshot', ({ players }) => {
      const seen = new Set<string>();
      for (const pp of players) {
        seen.add(pp.id);
        if (pp.id === this.selfId) this.applySelf(pp);
        else this.remoteFor(pp.id).push(pp);
      }
      for (const [id, r] of this.remotes) {
        if (!seen.has(id)) {
          r.dispose(this.scene);
          this.remotes.delete(id);
        }
      }
    });

    net.on('structureAdded', (s) => this.world.addStructure(s));
    net.on('structureRemoved', ({ id }) => this.world.removeStructure(id));
    net.on('structureUpdated', ({ id, hp, edit }) => this.world.updateStructure(id, hp, edit));
    net.on('buildRejected', ({ id }) => {
      // Prédiction refusée : on retire la pièce fantôme (sauf si elle existe déjà côté serveur).
      const s = this.world.getStructure(id);
      if (s && s.owner === this.selfId) this.world.removeStructure(id);
    });

    net.on('shot', (m) => {
      const r = this.remotes.get(m.shooter);
      const from = r ? r.avatar.getMuzzleWorld(new THREE.Vector3()) : new THREE.Vector3(m.origin.x, m.origin.y, m.origin.z);
      if (!WEAPONS[m.weapon].melee) for (const e of m.ends) this.effects.tracer(from, new THREE.Vector3(e.x, e.y, e.z), 0xffa07a);
      if (WEAPONS[m.weapon].melee) r?.avatar.swing();
    });

    net.on('hit', (m) => this.hud.hitmarker(m.headshot, m.damage));

    net.on('died', (m) => {
      this.scores = m.scores;
      if (m.id === this.selfId) {
        this.alive = false;
        this.build.setPiece(null);
        this.hud.message(`Éliminé par ${this.remotes.get(m.killer)?.name ?? 'un adversaire'}`, 3);
      } else {
        const r = this.remotes.get(m.id);
        if (r) r.alive = false;
        this.hud.message(`Vous avez éliminé ${r?.name ?? "l'adversaire"} !`, 3);
      }
    });

    net.on('correct', ({ p }) => this.player.teleport(p.x, p.y, p.z));
    net.on('opponentLeft', () => this.hud.message("L'adversaire a quitté la partie", 3));
    net.on('disconnect', () => this.hud.message('Déconnecté du serveur — rechargez la page', 0));
  }

  private applySelf(pp: PublicPlayer) {
    if (pp.hp + pp.shield < this.hp + this.shield) this.hud.damageFlash();
    this.hp = pp.hp;
    this.shield = pp.shield;
    this.materials = pp.materials;
  }

  private remoteFor(id: string) {
    let r = this.remotes.get(id);
    if (!r) {
      r = new RemotePlayer(id, this.scene);
      this.remotes.set(id, r);
    }
    return r;
  }

  // -------------------------------------------------------------------------
  // Boucle
  // -------------------------------------------------------------------------

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  private update(dt: number) {
    const inp = this.input;
    const playing = this.alive && inp.locked;

    // 1. Sélection arme / pièce / édition
    if (playing) {
      WEAPON_ORDER.forEach((id, i) => {
        if (inp.wasPressed(`Digit${i + 1}`)) this.selectWeapon(() => this.weapons.select(id));
      });
      if (inp.wheel !== 0) this.selectWeapon(() => this.weapons.cycle(inp.wheel));
      for (const b of BUILD_KEYS) if (inp.wasPressed(b.code)) this.toggleBuild(b.type);
      if (inp.wasPressed('KeyG')) this.hud.editMessage(this.build.tryEdit(this.tpsCam));
      if (inp.wasPressed('KeyT')) this.weapons.reload();
    }

    // 2. Regard
    const { dx, dy } = inp.consumeMouseDelta();
    if (inp.locked) this.tpsCam.rotate(dx, dy);

    // 3. Déplacement
    const move: MoveInput = playing
      ? {
          forward: (inp.isDown('KeyW') ? 1 : 0) - (inp.isDown('KeyS') ? 1 : 0),
          right: (inp.isDown('KeyD') ? 1 : 0) - (inp.isDown('KeyA') ? 1 : 0),
          jump: inp.isDown('Space'),
          sprint: inp.isDown('ShiftLeft') || inp.isDown('ShiftRight'),
          crouch: inp.isDown('ControlLeft') || inp.isDown('KeyC'),
        }
      : NO_INPUT;
    this.player.yaw = this.tpsCam.yaw;
    if (this.alive) this.player.update(dt, move, this.world.getColliders());

    // 4. Caméra
    const building = this.build.piece !== null;
    const w = this.weapons.def;
    const aiming = playing && !building && inp.mouseRight && !w.melee;
    const camMode: CameraMode = building ? 'build' : aiming ? (w.id === 'sniper' ? 'scope' : 'aim') : 'normal';
    this.tpsCam.update(dt, this.player.pos, this.player.eyeHeight, camMode, aiming ? w.aimFov : BASE_FOV, (o, d, m) =>
      this.world.raycastGeometry(o, d, m),
    );

    // 5. Actions
    if (playing && building) this.build.update(dt, this.player, this.tpsCam, inp.mouseLeft);
    else if (playing) this.weapons.update(dt, { held: inp.mouseLeft, pressed: inp.mouseLeftPressed, aiming }, this.tpsCam, this.player);

    // 6. Avatars
    this.avatar.group.position.copy(this.player.pos);
    this.avatar.group.rotation.y = this.tpsCam.yaw;
    this.avatar.group.visible = this.alive && camMode !== 'scope';
    this.avatar.setCrouch(this.player.crouching);
    this.avatar.setWeapon(building ? null : this.weapons.current);
    this.avatar.setPitch(this.tpsCam.pitch);
    this.avatar.update(dt);
    for (const r of this.remotes.values()) r.update(dt);
    this.world.update(dt);
    this.effects.update(dt);

    // 7. Réseau
    this.sendTimer += dt;
    if (this.alive && this.selfId && this.sendTimer >= 1 / CLIENT_SEND_RATE) {
      this.sendTimer = 0;
      const p = this.player.pos;
      this.net.emit('state', {
        round: this.round,
        p: { x: p.x, y: p.y, z: p.z },
        yaw: this.tpsCam.yaw,
        pitch: this.tpsCam.pitch,
        crouch: this.player.crouching,
        weapon: this.weapons.current,
        building,
      });
    }

    // 8. HUD
    this.hud.setVitals(this.hp, this.shield);
    this.hud.setMaterials(this.materials, this.unlimited);
    this.hud.setActive(this.weapons.current, this.build.piece, (id) => this.weapons.ammoText(id));
    this.hud.setCrosshair(building ? 0 : this.weapons.spread, this.camera.fov, building, camMode === 'scope');
    this.hud.setLocked(inp.locked);
    this.hud.setScore(this.scoreText());
    this.hud.update(dt);
  }

  private selectWeapon(apply: () => void) {
    this.build.setPiece(null);
    apply();
  }

  /** Re-appuyer sur la touche de la pièce active repasse en mode combat. */
  private toggleBuild(type: StructureType) {
    this.build.setPiece(this.build.piece === type ? null : type);
  }

  private scoreText() {
    if (this.mode !== 'duel') return '';
    const me = this.scores[this.selfId] ?? 0;
    const other = Object.entries(this.scores).find(([id]) => id !== this.selfId);
    return other ? `Vous ${me} — ${other[1]} ${this.remotes.get(other[0])?.name ?? 'Adversaire'}` : `Vous ${me}`;
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
