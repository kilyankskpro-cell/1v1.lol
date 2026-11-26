/** HUD DOM : vie, bouclier, inventaire par rareté, pièces de construction, FPS/ping, réticule, messages. */
import { MAX_HEALTH, MAX_SHIELD } from '@shared/constants';
import type { StructureType } from '@shared/structures';
import { WEAPONS, WEAPON_ORDER, type WeaponId } from '@shared/weapons';
import { RARITY } from './WeaponModels';

export const BUILD_KEYS: { code: string; type: StructureType; label: string; fallback: string }[] = [
  { code: 'KeyQ', type: 'wall', label: 'Mur', fallback: 'A' },
  { code: 'KeyE', type: 'floor', label: 'Sol', fallback: 'E' },
  { code: 'KeyR', type: 'ramp', label: 'Rampe', fallback: 'R' },
  { code: 'KeyV', type: 'roof', label: 'Toit', fallback: 'V' },
];

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
  sniper:
    '<path d="M1 15 h12 v-2 h16 v-4 h14 v4 h-5 v2 h25 v3 h-28 v2 h-7 l-2 7 h-4 l1-7 h-6 l-8 5 h-5 l4-6z" fill="#fff"/>',
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

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
  private centerTimer = 0;
  private editTimer = 0;
  private flashTimer = 0;
  private weaponSlots = new Map<WeaponId, HTMLElement>();
  private buildSlots = new Map<StructureType, HTMLElement>();

  constructor() {
    const ws = $('weapon-slots');
    WEAPON_ORDER.forEach((id, i) => {
      const el = document.createElement('div');
      el.className = 'slot weapon';
      el.title = WEAPONS[id].name;
      el.style.setProperty('--rarity', `#${RARITY[id].toString(16).padStart(6, '0')}`);
      el.innerHTML = `<span class="key">${i + 1}</span><svg viewBox="0 0 64 32">${WEAPON_ICONS[id]}</svg><span class="sub"></span>`;
      ws.appendChild(el);
      this.weaponSlots.set(id, el);
    });
    const bs = $('build-slots');
    for (const b of BUILD_KEYS) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = `<span class="key">${b.fallback}</span><svg viewBox="0 0 32 32">${ICONS[b.type]}</svg>`;
      el.title = b.label;
      bs.appendChild(el);
      this.buildSlots.set(b.type, el);
    }
    void this.localizeKeys();
  }

  /** Affiche la vraie lettre de la touche selon la disposition clavier (Chrome / Edge). */
  private async localizeKeys() {
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard;
    if (!kb?.getLayoutMap) return;
    try {
      const map = await kb.getLayoutMap();
      for (const b of BUILD_KEYS) {
        const label = map.get(b.code);
        const key = this.buildSlots.get(b.type)?.querySelector('.key');
        if (label && key) key.textContent = label.toUpperCase();
      }
    } catch {
      /* API indisponible : on garde les libellés AZERTY par défaut */
    }
  }

  show(modeLabel: string) {
    this.root.classList.remove('hidden');
    $('mode-label').textContent = modeLabel;
  }

  setVitals(hp: number, shield: number) {
    $('health-fill').style.width = `${(hp / MAX_HEALTH) * 100}%`;
    $('shield-fill').style.width = `${(shield / MAX_SHIELD) * 100}%`;
    $('health-text').textContent = String(Math.ceil(hp));
    $('shield-text').textContent = String(Math.ceil(shield));
  }

  setStats(fps: number, pingMs: number | null) {
    $('fps').textContent = `FPS: ${Math.round(fps)}`;
    $('ping').textContent = `Ping: ${pingMs === null ? '--' : Math.round(pingMs)} ms`;
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

  /** Réticule dynamique : l'écart des branches reflète la dispersion réelle. */
  setCrosshair(spreadRad: number, fovDeg: number, building: boolean, scoped: boolean) {
    const halfH = window.innerHeight / 2;
    const gap = 4 + (Math.tan(spreadRad) / Math.tan((fovDeg * Math.PI) / 360)) * halfH;
    this.crosshair.style.setProperty('--gap', `${Math.min(gap, 120).toFixed(1)}px`);
    this.crosshair.classList.toggle('build', building);
    this.crosshair.classList.toggle('hidden', scoped);
    this.scope.classList.toggle('hidden', !scoped);
  }

  setLocked(locked: boolean) {
    this.lockHint.classList.toggle('hidden', locked);
  }

  setScore(text: string) {
    $('score').textContent = text;
  }

  hitmarker(headshot: boolean, damage: number) {
    this.hitmarkerEl.classList.remove('show');
    this.hitmarkerEl.classList.toggle('head', headshot);
    void this.hitmarkerEl.offsetWidth; // relance l'animation CSS
    this.hitmarkerEl.classList.add('show');
    const el = document.createElement('div');
    el.className = `dmg${headshot ? ' head' : ''}`;
    el.textContent = String(damage);
    this.dmgNumbers.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  damageFlash() {
    this.flash.classList.add('on');
    this.flashTimer = 0.08;
  }

  /** duration = 0 → message persistant. */
  message(text: string, duration = 2) {
    this.center.textContent = text;
    this.centerTimer = duration;
  }

  editMessage(text: string) {
    this.editHint.textContent = text;
    this.editTimer = 1.5;
  }

  update(dt: number) {
    if (this.centerTimer > 0 && (this.centerTimer -= dt) <= 0) this.center.textContent = '';
    if (this.editTimer > 0 && (this.editTimer -= dt) <= 0) this.editHint.textContent = '';
    if (this.flashTimer > 0 && (this.flashTimer -= dt) <= 0) this.flash.classList.remove('on');
  }
}
