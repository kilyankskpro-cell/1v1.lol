/**
 * HUD DOM : vie, bouclier, inventaire par rareté, munitions, matériaux, pièces de construction,
 * FPS/ping, réticule dynamique, éliminations, manches, barre de résistance de la cible visée,
 * indicateurs de direction des dégâts et messages.
 */
import { MAX_HEALTH, MAX_SHIELD } from '@shared/constants';
import type { StructureType } from '@shared/structures';
import { WEAPONS, WEAPON_ORDER, type WeaponId } from '@shared/weapons';
import { keyLabel, settings, type Action } from './Settings';
import { RARITY } from './WeaponModels';

export const BUILD_ACTIONS: { action: Action; type: StructureType; label: string }[] = [
  { action: 'wall', type: 'wall', label: 'Mur' },
  { action: 'floor', type: 'floor', label: 'Sol' },
  { action: 'ramp', type: 'ramp', label: 'Rampe' },
  { action: 'roof', type: 'roof', label: 'Toit' },
];

export const SLOT_ACTIONS: Action[] = ['slot1', 'slot2', 'slot3', 'slot4', 'slot5'];

const PIECE = 'fill="#dfe5f7" stroke="#6b78b8" stroke-width="1.5" stroke-linejoin="round"';
const ICONS: Record<StructureType, string> = {
  wall: `<path d="M9 5 L25 3 L25 27 L9 29 Z" ${PIECE}/>`,
  floor: `<path d="M2 19 L13 11 L30 13 L19 22 Z" ${PIECE}/>`,
  ramp: `<path d="M3 26 L12 8 L29 9 L22 27 Z" ${PIECE}/>`,
  roof: `<path d="M3 24 L16 6 L29 24 Z" ${PIECE}/><path d="M16 6 L13 24" stroke="#6b78b8" stroke-width="1.5"/>`,
};

/** Silhouettes d'armes (viewBox 64x32). */
const WEAPON_ICONS: Record<WeaponId, string> = {
  pickaxe:
    '<path d="M16 29 L42 7" stroke="#2b1a10" stroke-width="4" stroke-linecap="round"/><path d="M28 7 Q46 -1 60 15 Q46 8 33 13 Z" fill="#dfe5ff" stroke="#1d2340" stroke-width="1.2"/>',
  shotgun: '<path d="M3 15 h38 v-3 h20 v5 h-20 v2 h-9 l-4 8 h-6 l2-8 h-7 l-9 6 h-6 l5-7z" fill="#fff"/>',
  ar: '<path d="M2 14 h10 v-2 h28 v-4 h7 v4 h15 v4 h-15 v2 h-8 l-2 9 h-5 l1-9 h-6 l-2 6 h-4 v-5 h-8 l-6 5 h-4 l4-6z" fill="#fff"/>',
  pistol: '<path d="M18 9 h30 v7 h-20 l-3 12 h-8 l3-12 h-2z" fill="#fff"/>',
  sniper:
    '<path d="M1 15 h12 v-2 h16 v-4 h14 v4 h-5 v2 h25 v3 h-28 v2 h-7 l-2 7 h-4 l1-7 h-6 l-8 5 h-5 l4-6z" fill="#fff"/>',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface TargetInfo {
  label: string;
  hp: number;
  max: number;
  /** Bouclier (joueurs) — absent pour une construction. */
  shield?: number;
}

export class HUD {
  private root = $('hud');
  private crosshair = $('crosshair');
  private hitmarkerEl = $('hitmarker');
  private scope = $('scope');
  private flash = $('damage-flash');
  private center = $('center-message');
  private editHint = $('edit-hint');
  private lockHint = $('lock-hint');
  private dmgNumbers = $('damage-numbers');
  private dmgDirs = $('damage-dirs');
  private targetInfo = $('target-info');
  private centerTimer = 0;
  private editTimer = 0;
  private flashTimer = 0;
  private weaponSlots = new Map<WeaponId, HTMLElement>();
  private buildSlots = new Map<StructureType, HTMLElement>();
  private unsubscribe: () => void;
  private lastTarget = '';

  constructor() {
    const ws = $('weapon-slots');
    ws.innerHTML = '';
    WEAPON_ORDER.forEach((id) => {
      const el = document.createElement('div');
      el.className = 'slot weapon';
      el.title = WEAPONS[id].name;
      el.style.setProperty('--rarity', `#${RARITY[id].toString(16).padStart(6, '0')}`);
      el.innerHTML = `<span class="key"></span><svg viewBox="0 0 64 32">${WEAPON_ICONS[id]}</svg><span class="sub"></span>`;
      ws.appendChild(el);
      this.weaponSlots.set(id, el);
    });
    const bs = $('build-slots');
    bs.innerHTML = '';
    for (const b of BUILD_ACTIONS) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = `<span class="key"></span><svg viewBox="0 0 32 32">${ICONS[b.type]}</svg>`;
      el.title = b.label;
      bs.appendChild(el);
      this.buildSlots.set(b.type, el);
    }
    this.refreshKeys();
    this.unsubscribe = settings.subscribe(() => this.refreshKeys());
  }

  /** Lettres des touches selon la configuration et la disposition clavier. */
  refreshKeys() {
    const keys = settings.data.keys;
    WEAPON_ORDER.forEach((id, i) => {
      this.weaponSlots.get(id)!.querySelector('.key')!.textContent = keyLabel(keys[SLOT_ACTIONS[i]]);
    });
    for (const b of BUILD_ACTIONS) this.buildSlots.get(b.type)!.querySelector('.key')!.textContent = keyLabel(keys[b.action]);
    $('keys-hint').textContent =
      `${keyLabel(keys.edit)} Modifier · ${keyLabel(keys.destroy)} Détruire · ${keyLabel(keys.reload)} Recharger · Échap Pause`;
  }

  show(modeLabel: string) {
    this.root.classList.remove('hidden');
    $('mode-label').textContent = modeLabel;
  }

  dispose() {
    this.unsubscribe();
    this.root.classList.add('hidden');
    this.center.textContent = '';
    this.editHint.textContent = '';
    this.dmgDirs.innerHTML = '';
    this.dmgNumbers.innerHTML = '';
    this.targetInfo.classList.add('hidden');
  }

  setVitals(hp: number, shield: number) {
    $('health-fill').style.width = `${(hp / MAX_HEALTH) * 100}%`;
    $('shield-fill').style.width = `${(shield / MAX_SHIELD) * 100}%`;
    $('health-text').textContent = String(Math.ceil(hp));
    $('shield-text').textContent = String(Math.ceil(shield));
  }

  setStats(fps: number, pingMs: number | null, offline: boolean) {
    $('fps').textContent = `FPS: ${Math.round(fps)}`;
    $('ping').textContent = offline ? 'Local' : `Ping: ${pingMs === null ? '--' : Math.round(pingMs)} ms`;
  }

  setMaterials(n: number, unlimited: boolean) {
    $('materials').textContent = `🪵 ${unlimited ? '∞' : n}`;
  }

  setActive(weapon: WeaponId, piece: StructureType | null, ammo: (id: WeaponId) => string) {
    for (const [id, el] of this.weaponSlots) {
      el.classList.toggle('active', !piece && id === weapon);
      el.querySelector('.sub')!.textContent = ammo(id);
    }
    for (const [type, el] of this.buildSlots) el.classList.toggle('active', type === piece);
  }

  /** Grand compteur de munitions + barre de rechargement (progress 0..1, null = pas de rechargement). */
  setAmmo(name: string, text: string, reloadProgress: number | null) {
    $('weapon-name').textContent = name;
    $('ammo-count').textContent = text;
    const bar = $('reload-bar');
    bar.classList.toggle('hidden', reloadProgress === null);
    if (reloadProgress !== null) ($('reload-fill').style.width = `${reloadProgress * 100}%`);
  }

  /** Réticule dynamique : l'écart des branches reflète la dispersion réelle. */
  setCrosshair(spreadRad: number, fovDeg: number, building: boolean, scoped: boolean) {
    const halfH = window.innerHeight / 2;
    const gap = 4 + (Math.tan(spreadRad) / Math.tan((fovDeg * Math.PI) / 360)) * halfH;
    this.crosshair.style.setProperty('--gap', `${Math.min(gap, 120).toFixed(1)}px`);
    this.crosshair.classList.toggle('build', building);
    this.crosshair.classList.toggle('hidden', scoped);
    this.scope.classList.toggle('hidden', !scoped);
  }

  setLocked(locked: boolean, paused: boolean) {
    this.lockHint.classList.toggle('hidden', locked || paused);
  }

  setScore(text: string) {
    $('score').textContent = text;
  }

  setKills(n: number) {
    $('kills').textContent = `⚔ ${n}`;
  }

  /** Barre de résistance de la construction / du joueur visé. */
  setTargetInfo(info: TargetInfo | null) {
    if (!info) {
      if (this.lastTarget) this.targetInfo.classList.add('hidden');
      this.lastTarget = '';
      return;
    }
    const key = `${info.label}:${Math.ceil(info.hp)}:${info.shield ?? ''}`;
    if (key === this.lastTarget) return;
    this.lastTarget = key;
    this.targetInfo.classList.remove('hidden');
    $('target-label').textContent = `${info.label} · ${Math.ceil(info.hp)}`;
    $('target-fill').style.width = `${Math.max(0, (info.hp / info.max) * 100)}%`;
    const sh = $('target-shield');
    sh.classList.toggle('hidden', info.shield === undefined);
    if (info.shield !== undefined) sh.style.width = `${(info.shield / MAX_SHIELD) * 100}%`;
  }

  hitmarker(headshot: boolean, damage: number) {
    this.hitmarkerEl.classList.remove('show');
    this.hitmarkerEl.classList.toggle('head', headshot);
    void this.hitmarkerEl.offsetWidth; // relance l'animation CSS
    this.hitmarkerEl.classList.add('show');
    const el = document.createElement('div');
    el.className = `dmg${headshot ? ' head' : ''}`;
    el.textContent = String(damage);
    el.style.setProperty('--dx', `${(Math.random() - 0.5) * 40}px`);
    this.dmgNumbers.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  damageFlash() {
    this.flash.classList.add('on');
    this.flashTimer = 0.08;
  }

  /** Arc rouge autour du réticule indiquant d'où viennent les dégâts (0 = devant, sens horaire). */
  damageFrom(angle: number) {
    const el = document.createElement('div');
    el.className = 'dmg-dir';
    el.style.transform = `rotate(${angle}rad)`;
    this.dmgDirs.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  /** duration = 0 → message persistant. */
  message(text: string, duration = 2) {
    this.center.textContent = text;
    this.centerTimer = duration;
  }

  editMessage(text: string, duration = 1.5) {
    this.editHint.textContent = text;
    this.editTimer = duration;
  }

  update(dt: number) {
    if (this.centerTimer > 0 && (this.centerTimer -= dt) <= 0) this.center.textContent = '';
    if (this.editTimer > 0 && (this.editTimer -= dt) <= 0) this.editHint.textContent = '';
    if (this.flashTimer > 0 && (this.flashTimer -= dt) <= 0) this.flash.classList.remove('on');
  }
}
