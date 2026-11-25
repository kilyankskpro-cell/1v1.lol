/** HUD DOM minimaliste : vie, bouclier, pièces de construction, armes, réticule, messages. */
import { MAX_HEALTH, MAX_SHIELD } from '@shared/constants';
import type { StructureType } from '@shared/structures';
import { WEAPONS, WEAPON_ORDER, type WeaponId } from '@shared/weapons';

export const BUILD_KEYS: { code: string; type: StructureType; label: string; fallback: string }[] = [
  { code: 'KeyQ', type: 'wall', label: 'Mur', fallback: 'A' },
  { code: 'KeyE', type: 'floor', label: 'Sol', fallback: 'E' },
  { code: 'KeyR', type: 'ramp', label: 'Rampe', fallback: 'R' },
  { code: 'KeyV', type: 'roof', label: 'Toit', fallback: 'V' },
];

const ICONS: Record<StructureType, string> = {
  wall: '<rect x="5" y="4" width="22" height="24" fill="none" stroke="currentColor" stroke-width="3"/>',
  floor: '<path d="M3 20 L14 13 L29 13 L18 20 Z" fill="none" stroke="currentColor" stroke-width="3"/>',
  ramp: '<path d="M4 27 L28 5 L28 27 Z" fill="none" stroke="currentColor" stroke-width="3"/>',
  roof: '<path d="M3 26 L16 6 L29 26 Z M16 6 L16 26" fill="none" stroke="currentColor" stroke-width="3"/>',
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
      el.className = 'slot';
      el.innerHTML = `<span class="key">${i + 1}</span><b>${WEAPONS[id].name}</b><span class="sub"></span>`;
      ws.appendChild(el);
      this.weaponSlots.set(id, el);
    });
    const bs = $('build-slots');
    for (const b of BUILD_KEYS) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = `<span class="key">${b.fallback}</span><svg viewBox="0 0 32 32">${ICONS[b.type]}</svg><span class="sub">${b.label}</span>`;
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
    $('health-text').textContent = `${Math.ceil(hp)} PV`;
    $('shield-text').textContent = `${Math.ceil(shield)} Bouclier`;
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
