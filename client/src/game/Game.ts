/**
 * Orchestrateur : boucle de rendu, entrées, réseau, sous-systèmes, pause et fin de match.
 *
 * Ordre d'une frame :
 *   entrées → caméra (souris) → déplacement → caméra (position) → tir / construction / édition
 *   → avatars → envoi réseau → HUD → rendu
 */
import * as THREE from 'three';
import { MODE_LABELS, createArena, type GameMode } from '@shared/arena';
import { BUILD_COST, CLIENT_SEND_RATE, MAX_HEALTH, MAX_SHIELD, STARTING_MATERIALS } from '@shared/constants';
import { DIFFICULTY_LABELS, type BotDifficulty, type PublicPlayer } from '@shared/protocol';
import { STRUCTURE_LABELS, structureCenter, type Structure, type StructureType } from '@shared/structures';
import { WEAPONS, WEAPON_ORDER } from '@shared/weapons';
import { hideAllOverlays, hideMatchOver, hidePause, showMatchOver, showPause } from '../ui/Overlays';
import { closeSettings, isSettingsOpen, openSettings, toggleFullscreen } from '../ui/SettingsPanel';
import { audio } from './Audio';
import { Avatar } from './Avatar';
import { BuildSystem } from './BuildSystem';
import { EditSystem } from './EditSystem';
import { Effects } from './Effects';
import { BUILD_ACTIONS, HUD, SLOT_ACTIONS } from './HUD';
import { Input } from './Input';
import { Minimap } from './Minimap';
import type { Connection, GameSocket } from './Network';
import { NO_INPUT, PlayerController, type MoveInput } from './PlayerController';
import { RemotePlayer } from './RemotePlayer';
import { settings, type SettingsData } from './Settings';
import { ThirdPersonCamera, type CameraMode } from './ThirdPersonCamera';
import { WeaponSystem } from './WeaponSystem';
import { World } from './World';

export interface GameOptions {
  mode: GameMode;
  name: string;
  difficulty?: BotDifficulty;
  conn: Connection;
  /** Retour au menu principal. */
  onExit: () => void;
}

const BASE_SENSITIVITY = 0.0022;

export class Game {
  private renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(75, 1, 0.05, 1000);
  private clock = new THREE.Clock();
  private input: Input;
  private effects = new Effects(this.scene);
  private world: World;
  private player = new PlayerController();
  private tpsCam = new ThirdPersonCamera(this.camera);
  private avatar = new Avatar('barbarian');
  private hud = new HUD();
  private build: BuildSystem;
  private edit: EditSystem;
  private weapons: WeaponSystem;
  private remotes = new Map<string, RemotePlayer>();
  private minimap: Minimap;
  private net: GameSocket;
  private mode: GameMode;

  private selfId = '';
  private round = 0;
  private alive = false;
  private hp = MAX_HEALTH;
  private shield = MAX_SHIELD;
  private materials = STARTING_MATERIALS;
  private unlimited = false;
  private roundsToWin = 0;
  private scores: Record<string, number> = {};
  private kills: Record<string, number> = {};
  private sendTimer = 0;
  private fps = { frames: 0, time: 0, value: 0 };
  private ping: { ms: number | null; timer: number } = { ms: null, timer: 0 };
  /** La souris a été capturée au moins une fois (avant : simple invite "Cliquez pour jouer"). */
  private started = false;
  private paused = false;
  private matchEnded = false;
  private quality: SettingsData['quality'] | null = null;
  private unsubSettings: () => void;
  private onResize = () => this.resize();

  constructor(
    private container: HTMLElement,
    private opts: GameOptions,
  ) {
    this.mode = opts.mode;
    this.net = opts.conn.socket;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.input = new Input(this.renderer.domElement);
    this.input.onCanvasClick = () => !this.matchEnded && this.resume();
    this.input.onLockChange = (locked) => this.onLockChange(locked);

    this.world = new World(this.scene, createArena(this.mode), this.effects);
    this.scene.add(this.avatar.group);
    this.minimap = new Minimap(document.getElementById('minimap') as HTMLCanvasElement, this.world.arena);

    this.build = new BuildSystem({
      scene: this.scene,
      world: this.world,
      selfId: () => this.selfId,
      canAfford: () => this.unlimited || this.materials >= BUILD_COST,
      sendBuild: (spec) => {
        if (!this.unlimited) this.materials -= BUILD_COST; // prédiction, corrigée par le snapshot
        audio.play('build');
        this.net.emit('build', spec);
      },
    });
    this.edit = new EditSystem(this.scene, this.world);
    this.weapons = new WeaponSystem({
      world: this.world,
      effects: this.effects,
      avatar: this.avatar,
      getTargets: () =>
        [...this.remotes.values()].filter((r) => r.alive).map((r) => ({ id: r.id, feet: r.feet, crouch: r.crouch })),
      sendFire: (msg) => this.net.emit('fire', msg),
    });

    this.applySettings(settings.data);
    this.unsubSettings = settings.subscribe((s) => this.applySettings(s));
    this.bindNetwork();
    // Accès console pour le débogage en développement : window.__game
    if (import.meta.env.DEV) (window as unknown as { __game?: Game }).__game = this;
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  start() {
    const label = MODE_LABELS[this.mode] + (this.mode === 'bot' && this.opts.difficulty ? ` · ${DIFFICULTY_LABELS[this.opts.difficulty].toUpperCase()}` : '');
    this.hud.show(label + (this.mode === 'duel' && this.opts.conn.offline ? ' · HORS LIGNE' : ''));
    this.hud.message('Chargement…', 0);
    this.net.emit('join', { mode: this.mode, name: this.opts.name, difficulty: this.opts.difficulty });
    this.renderer.setAnimationLoop(() => this.frame());
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.input.dispose();
    this.hud.dispose();
    this.unsubSettings();
    hideAllOverlays();
    if (isSettingsOpen()) closeSettings();
    window.removeEventListener('resize', this.onResize);
    this.net.disconnect();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    if (import.meta.env.DEV) delete (window as unknown as { __game?: Game }).__game;
  }

  // -------------------------------------------------------------------------
  // Paramètres
  // -------------------------------------------------------------------------

  private applySettings(s: SettingsData) {
    this.tpsCam.sensitivity = BASE_SENSITIVITY * s.sensitivity;
    this.tpsCam.invertY = s.invertY;
    this.tpsCam.baseFov = s.fov;
    if (s.quality === this.quality) return;
    this.quality = s.quality;
    const dpr = window.devicePixelRatio || 1;
    const q = {
      low: { ratio: Math.min(dpr, 1) * 0.75, shadows: false, map: 512, particles: 0.4 },
      medium: { ratio: Math.min(dpr, 1.25), shadows: true, map: 1024, particles: 0.7 },
      high: { ratio: Math.min(dpr, 2), shadows: true, map: 2048, particles: 1 },
    }[s.quality];
    this.renderer.setPixelRatio(q.ratio);
    this.renderer.shadowMap.enabled = q.shadows;
    const shadow = this.world.sun.shadow;
    if (shadow.mapSize.x !== q.map) {
      shadow.mapSize.set(q.map, q.map);
      shadow.map?.dispose();
      shadow.map = null;
    }
    this.effects.particleScale = q.particles;
    // Les matériaux doivent être recompilés quand les ombres changent.
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
    this.resize();
  }

  // -------------------------------------------------------------------------
  // Pause / reprise
  // -------------------------------------------------------------------------

  private resume() {
    if (settings.data.fullscreen) toggleFullscreen(true);
    this.input.requestLock();
  }

  private onLockChange(locked: boolean) {
    if (locked) {
      this.started = true;
      this.setPaused(false);
      hidePause();
      if (isSettingsOpen()) closeSettings();
      return;
    }
    if (this.started && !this.matchEnded) this.openPause();
  }

  private setPaused(p: boolean) {
    this.paused = p;
    this.opts.conn.local?.setPaused(p);
  }

  private openPause() {
    this.setPaused(true);
    this.edit.cancel();
    const note = this.opts.conn.local ? 'Partie en pause' : 'Partie en ligne : le jeu continue pendant la pause';
    showPause(
      {
        resume: () => {
          audio.play('ui');
          this.resume();
        },
        restart: () => {
          audio.play('ui');
          this.net.emit('restart');
          this.resume();
        },
        settings: () => {
          audio.play('ui');
          hidePause();
          openSettings(() => this.paused && this.openPause());
        },
        menu: () => {
          audio.play('ui');
          this.opts.onExit();
        },
      },
      note,
    );
  }

  // -------------------------------------------------------------------------
  // Réseau
  // -------------------------------------------------------------------------

  private bindNetwork() {
    const net = this.net;

    net.on('joined', (m) => {
      this.selfId = m.selfId;
      this.unlimited = m.unlimited;
      this.roundsToWin = m.roundsToWin;
      for (const s of m.structures) this.world.addStructure(s);
    });

    net.on('roundStart', (m) => {
      this.round = m.round;
      this.scores = m.scores;
      this.kills = m.kills;
      this.world.clearStructures();
      this.edit.cancel();
      for (const [id, s] of Object.entries(m.spawns)) {
        if (id === this.selfId) {
          this.player.teleport(s.x, s.y, s.z);
          this.avatar.resetMotion();
          this.tpsCam.yaw = s.yaw;
          this.tpsCam.pitch = 0;
        } else {
          const r = this.remoteFor(id);
          r.snapTo(s.x, s.y, s.z);
          r.alive = true;
        }
      }
      this.alive = true;
      this.hp = MAX_HEALTH;
      this.shield = MAX_SHIELD;
      this.materials = STARTING_MATERIALS;
      this.weapons.resetAmmo(this.unlimited);

      const opponents = Object.keys(m.spawns).length - 1;
      if (this.mode === 'duel' && opponents === 0 && this.opts.conn.offline) {
        this.hud.message('Serveur injoignable — entraînement solo dans l’arène de duel', 3);
      } else if (this.mode === 'duel' && opponents === 0) {
        this.hud.message("En attente d'un adversaire… (ouvrez un 2ᵉ onglet pour tester)", 0);
      } else if (this.mode === 'training') {
        this.hud.message('Entraînement — détruisez les cibles !', 2.5);
      } else if (this.mode === 'freebuild') {
        this.hud.message('Free Build — construisez librement !', 2.5);
      } else {
        this.hud.message(`Manche ${m.round} — Combat !`, 2);
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
          r.dispose();
          this.remotes.delete(id);
        }
      }
    });

    net.on('structureAdded', (s) => {
      if (s.owner !== this.selfId) audio.play('build', structureCenter(s));
      this.world.addStructure(s);
    });
    net.on('structureRemoved', ({ id, destroyed }) => {
      const s = this.world.getStructure(id);
      if (s && destroyed) audio.play('destroy', structureCenter(s));
      if (this.edit.active?.id === id) this.edit.cancel();
      this.world.removeStructure(id, destroyed);
    });
    net.on('structureUpdated', ({ id, hp, edit }) => {
      const s = this.world.getStructure(id);
      if (s && hp < s.hp) audio.play('structureHit', structureCenter(s), 0.6);
      this.world.updateStructure(id, hp, edit);
    });
    net.on('buildRejected', ({ id }) => {
      // Prédiction refusée : on retire la pièce fantôme (sauf si elle existe déjà côté serveur).
      const s = this.world.getStructure(id);
      if (s && s.owner === this.selfId) this.world.removeStructure(id);
    });

    net.on('shot', (m) => {
      const r = this.remotes.get(m.shooter);
      const w = WEAPONS[m.weapon];
      const from = r ? r.avatar.getMuzzleWorld(new THREE.Vector3()) : new THREE.Vector3(m.origin.x, m.origin.y, m.origin.z);
      if (!w.melee) {
        this.effects.muzzleFlash(from);
        for (const e of m.ends) {
          const end = new THREE.Vector3(e.x, e.y, e.z);
          this.effects.tracer(from, end, 0xffa07a);
          this.effects.impact(end, 0xdddddd);
        }
      } else r?.avatar.swing();
      audio.play(m.weapon, m.origin);
    });

    net.on('hit', (m) => {
      this.hud.hitmarker(m.headshot, m.damage);
      this.effects.blood(new THREE.Vector3(m.point.x, m.point.y, m.point.z), m.headshot);
      audio.play(m.headshot ? 'headshot' : 'hit');
    });

    net.on('hurt', (m) => {
      this.hud.damageFlash();
      audio.play('hurt');
      // Direction de l'attaquant relative au regard (0 = devant, sens horaire).
      const dx = m.from.x - this.player.pos.x;
      const dz = m.from.z - this.player.pos.z;
      const yaw = this.tpsCam.yaw;
      const fwd = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
      const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
      this.hud.damageFrom(Math.atan2(right, fwd));
    });

    net.on('died', (m) => {
      this.scores = m.scores;
      this.kills = m.kills;
      const victim = this.remotes.get(m.id);
      if (m.id === this.selfId) {
        this.alive = false;
        this.build.setPiece(null);
        this.edit.cancel();
        this.hud.message(`Éliminé par ${this.remotes.get(m.killer)?.name ?? 'un adversaire'}`, 3);
        return;
      }
      if (victim) victim.alive = false;
      if (m.killer !== this.selfId) return;
      audio.play('elim');
      if (victim?.kind === 'target') this.hud.editMessage(`Cible détruite ! (${this.kills[this.selfId] ?? 0})`, 1.2);
      else this.hud.message(`Vous avez éliminé ${victim?.name ?? "l'adversaire"} !`, 3);
    });

    net.on('respawn', ({ id, spawn }) => {
      if (id === this.selfId) {
        this.player.teleport(spawn.x, spawn.y, spawn.z);
        this.avatar.resetMotion();
        this.alive = true;
        this.hp = MAX_HEALTH;
        this.shield = MAX_SHIELD;
        this.hud.message('Réapparition', 1.5);
      } else {
        const r = this.remoteFor(id);
        r.snapTo(spawn.x, spawn.y, spawn.z);
        r.alive = true;
      }
    });

    net.on('matchOver', (m) => {
      this.scores = m.scores;
      this.matchEnded = true;
      this.build.setPiece(null);
      this.edit.cancel();
      const victory = m.winner === this.selfId;
      audio.play(victory ? 'victory' : 'defeat');
      this.input.releaseLock();
      showMatchOver(victory, this.scoreText(), {
        replay: () => {
          audio.play('ui');
          hideMatchOver();
          this.matchEnded = false;
          this.net.emit('restart');
          this.resume();
        },
        menu: () => {
          audio.play('ui');
          this.opts.onExit();
        },
      });
    });

    net.on('correct', ({ p }) => this.player.teleport(p.x, p.y, p.z));
    net.on('opponentLeft', () => this.hud.message("L'adversaire a quitté la partie", 3));
    net.on('disconnect', () => this.hud.message('Déconnecté du serveur — revenez au menu', 0));
  }

  private applySelf(pp: PublicPlayer) {
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

  /** Ses propres constructions, ou toutes dans les modes illimités (entraînement, free build). */
  private canModify(s: Structure) {
    return s.owner === this.selfId || this.unlimited;
  }

  // -------------------------------------------------------------------------
  // Boucle
  // -------------------------------------------------------------------------

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    // Partie locale en pause : le monde est figé, on continue simplement d'afficher.
    if (!(this.paused && this.opts.conn.local)) this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  private update(dt: number) {
    const inp = this.input;
    const playing = this.alive && inp.locked && !this.paused && !this.matchEnded;

    // 1. Sélection arme / pièce / édition / destruction
    if (playing) this.handleActions();

    // 2. Regard
    const { dx, dy } = inp.consumeMouseDelta();
    if (inp.locked) this.tpsCam.rotate(dx, dy);

    // 3. Déplacement
    const move: MoveInput = playing
      ? {
          forward: (inp.action('forward') ? 1 : 0) - (inp.action('back') ? 1 : 0),
          right: (inp.action('right') ? 1 : 0) - (inp.action('left') ? 1 : 0),
          jump: inp.action('jump'),
          sprint: inp.action('sprint'),
          crouch: inp.action('crouch'),
        }
      : NO_INPUT;
    this.player.yaw = this.tpsCam.yaw;
    if (this.alive) this.player.update(dt, move, this.world.getColliders());
    if (this.player.jumped) audio.play('jump');
    if (this.player.landedSpeed > 0) audio.play('land', undefined, Math.min(1, this.player.landedSpeed / 14));

    // 4. Caméra
    const editing = this.edit.editing;
    const building = this.build.piece !== null || editing;
    const w = this.weapons.def;
    const aiming = playing && !building && inp.mouseRight && !w.melee;
    const camMode: CameraMode = building ? 'build' : aiming ? (w.id === 'sniper' ? 'scope' : 'aim') : 'normal';
    this.tpsCam.update(dt, this.player.pos, this.player.eyeHeight, camMode, aiming ? w.aimFov : this.tpsCam.baseFov, (o, d, m) =>
      this.world.raycastGeometry(o, d, m),
    );
    audio.setListener(this.player.pos);

    // 5. Actions
    if (playing && editing) {
      if (this.edit.update(this.tpsCam, inp.mouseLeftPressed, inp.mouseLeft)) audio.play('edit');
    } else if (playing && building) {
      this.build.update(dt, this.player, this.tpsCam, inp.mouseLeft);
    } else if (playing) {
      this.weapons.update(dt, { held: inp.mouseLeft, pressed: inp.mouseLeftPressed, aiming }, this.tpsCam, this.player);
    }

    // 6. Avatars
    this.avatar.group.position.copy(this.player.pos);
    this.avatar.group.rotation.y = this.tpsCam.yaw;
    this.avatar.group.visible = this.alive && camMode !== 'scope';
    this.avatar.setCrouch(this.player.crouching);
    this.avatar.setAir(!this.player.grounded);
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
        air: !this.player.grounded,
        weapon: this.weapons.current,
        building,
      });
    }

    // 8. HUD
    this.updateHud(dt, camMode, building);
  }

  private handleActions() {
    const inp = this.input;
    SLOT_ACTIONS.forEach((a, i) => {
      if (inp.actionPressed(a)) this.selectWeapon(() => this.weapons.select(WEAPON_ORDER[i]));
    });
    if (inp.wheel !== 0) this.selectWeapon(() => this.weapons.cycle(inp.wheel));
    for (const b of BUILD_ACTIONS) if (inp.actionPressed(b.action)) this.toggleBuild(b.type);

    if (inp.actionPressed('edit')) {
      if (this.edit.editing) this.confirmEdit();
      else {
        const err = this.edit.begin(this.tpsCam, (s) => this.canModify(s));
        if (err) this.hud.editMessage(err);
        else {
          this.build.setPiece(null);
          audio.play('edit');
          this.hud.editMessage('Cliquez les cases à retirer · Modifier = valider · Clic droit = annuler · Recharger = réinitialiser', 0);
        }
      }
    }
    if (this.edit.editing) {
      if (inp.wasPressed('Enter')) this.confirmEdit();
      if (inp.mouseRightPressed) {
        this.edit.cancel();
        this.hud.editMessage('Modification annulée');
      }
      if (inp.actionPressed('reload')) this.edit.resetTiles();
      return;
    }
    if (inp.actionPressed('reload')) this.weapons.reload();
    if (inp.actionPressed('destroy')) this.demolishAimed();
  }

  private confirmEdit() {
    const res = this.edit.confirm();
    if (!res) {
      this.hud.editMessage('');
      return;
    }
    if ('error' in res) {
      this.hud.editMessage(res.error);
      return;
    }
    const s = this.world.getStructure(res.id);
    if (s) this.world.updateStructure(res.id, s.hp, res.edit); // prédiction
    this.net.emit('edit', res);
    audio.play('build');
    this.hud.editMessage('Modification validée');
  }

  /** Détruire : supprime instantanément la construction visée (la sienne, ou toutes en mode illimité). */
  private demolishAimed() {
    const hit = this.world.raycast(this.camera.position, this.tpsCam.forward, 18);
    const s = hit?.structureId ? this.world.getStructure(hit.structureId) : undefined;
    if (!s) return this.hud.editMessage('Visez une construction pour la détruire');
    if (!this.canModify(s)) return this.hud.editMessage('Vous ne pouvez détruire que vos propres constructions');
    this.net.emit('demolish', { id: s.id });
  }

  private updateHud(dt: number, camMode: CameraMode, building: boolean) {
    const hud = this.hud;
    hud.setVitals(this.hp, this.shield);
    hud.setMaterials(this.materials, this.unlimited);
    hud.setActive(this.weapons.current, this.build.piece, (id) => this.weapons.ammoText(id));
    const w = this.weapons.def;
    hud.setAmmo(building ? (this.edit.editing ? 'Édition' : 'Construction') : w.name, building ? '' : this.weapons.ammoText(w.id), building ? null : this.weapons.reloadProgress);
    hud.setCrosshair(building ? 0 : this.weapons.spread, this.camera.fov, building, camMode === 'scope');
    hud.setLocked(this.input.locked, this.paused || this.matchEnded);
    hud.setScore(this.scoreText());
    hud.setKills(this.kills[this.selfId] ?? 0);
    hud.setTargetInfo(this.aimedInfo());
    hud.update(dt);
    this.updateStats(dt);
    this.minimap.update(dt, {
      self: { x: this.player.pos.x, z: this.player.pos.z, yaw: this.tpsCam.yaw, alive: this.alive },
      enemies: [...this.remotes.values()].filter((r) => r.alive).map((r) => ({ x: r.feet.x, z: r.feet.z })),
      structures: this.world.structureData(),
    });
  }

  /** Construction ou joueur sous le réticule : barre de résistance / de vie. */
  private aimedInfo() {
    if (!this.alive) return null;
    const targets = [...this.remotes.values()].filter((r) => r.alive).map((r) => ({ id: r.id, feet: r.feet, crouch: r.crouch }));
    const hit = this.world.raycast(this.camera.position, this.tpsCam.forward, 60, targets);
    if (hit?.kind === 'structure' && hit.structureId) {
      const s = this.world.getStructure(hit.structureId);
      return s ? { label: STRUCTURE_LABELS[s.type], hp: s.hp, max: s.maxHp } : null;
    }
    if (hit?.kind === 'player' && hit.playerId) {
      const r = this.remotes.get(hit.playerId);
      return r ? { label: r.name, hp: r.hp, max: MAX_HEALTH, shield: r.kind === 'target' ? undefined : r.shield } : null;
    }
    return null;
  }

  /** FPS (moyenne sur 0,5 s) et ping (aller-retour mesuré toutes les 2 s). */
  private updateStats(dt: number) {
    this.fps.frames++;
    if ((this.fps.time += dt) >= 0.5) {
      this.fps.value = this.fps.frames / this.fps.time;
      this.fps.frames = 0;
      this.fps.time = 0;
    }
    if (!this.opts.conn.offline && (this.ping.timer -= dt) <= 0) {
      this.ping.timer = 2;
      const sent = performance.now();
      this.net.emit('latency', () => (this.ping.ms = performance.now() - sent));
    }
    this.hud.setStats(this.fps.value, this.ping.ms, this.opts.conn.offline);
  }

  private selectWeapon(apply: () => void) {
    this.build.setPiece(null);
    this.edit.cancel();
    apply();
  }

  /** Re-appuyer sur la touche de la pièce active repasse en mode combat. */
  private toggleBuild(type: StructureType) {
    this.edit.cancel();
    this.build.setPiece(this.build.piece === type ? null : type);
  }

  private scoreText() {
    if (this.roundsToWin === 0) return '';
    const me = this.scores[this.selfId] ?? 0;
    const other = Object.entries(this.scores).find(([id]) => id !== this.selfId);
    const target = ` · 1ᵉʳ à ${this.roundsToWin}`;
    return other
      ? `Vous ${me} — ${other[1]} ${this.remotes.get(other[0])?.name ?? 'Adversaire'}${target}`
      : `Vous ${me}${target}`;
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
