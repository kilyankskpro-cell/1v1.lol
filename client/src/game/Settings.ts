/**
 * Paramètres du joueur, appliqués immédiatement et conservés dans localStorage.
 * Les touches sont stockées par `KeyboardEvent.code` (position physique) : la
 * disposition par défaut correspond à ZQSD sur AZERTY et WASD sur QWERTY.
 */

export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'crouch' | 'reload'
  | 'wall' | 'floor' | 'ramp' | 'roof' | 'edit' | 'destroy'
  | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5';

export type Quality = 'low' | 'medium' | 'high';

export interface SettingsData {
  sensitivity: number;
  volume: number;
  quality: Quality;
  fov: number;
  invertY: boolean;
  fullscreen: boolean;
  keys: Record<Action, string>;
}

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'Avancer', back: 'Reculer', left: 'Gauche', right: 'Droite', jump: 'Sauter', sprint: 'Courir',
  crouch: "S'accroupir", reload: 'Recharger', wall: 'Mur', floor: 'Sol', ramp: 'Rampe', roof: 'Toit',
  edit: 'Modifier', destroy: 'Détruire', slot1: "Fusil d'assaut", slot2: 'Fusil à pompe', slot3: 'Pistolet',
  slot4: 'Pioche', slot5: 'Sniper',
};

export const DEFAULT_KEYS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ShiftLeft',
  crouch: 'ControlLeft', reload: 'KeyR', wall: 'KeyF', floor: 'KeyC', ramp: 'KeyV', roof: 'KeyT',
  edit: 'KeyG', destroy: 'KeyX', slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', slot5: 'Digit5',
};

const DEFAULTS: SettingsData = {
  sensitivity: 1,
  volume: 0.6,
  quality: 'high',
  fov: 78,
  invertY: false,
  fullscreen: false,
  keys: { ...DEFAULT_KEYS },
};

const STORAGE_KEY = 'buildfight-settings';
type Listener = (s: SettingsData) => void;

class SettingsStore {
  data: SettingsData;
  private listeners = new Set<Listener>();

  constructor() {
    this.data = this.load();
  }

  private load(): SettingsData {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<SettingsData>;
      return { ...DEFAULTS, ...raw, keys: { ...DEFAULT_KEYS, ...(raw.keys ?? {}) } };
    } catch {
      return { ...DEFAULTS, keys: { ...DEFAULT_KEYS } };
    }
  }

  update(patch: Partial<SettingsData>) {
    this.data = { ...this.data, ...patch, keys: { ...this.data.keys, ...(patch.keys ?? {}) } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    for (const fn of this.listeners) fn(this.data);
  }

  /** Assigne une touche ; si elle était déjà utilisée, l'autre action récupère l'ancienne touche. */
  bind(action: Action, code: string) {
    const keys = { ...this.data.keys };
    const other = (Object.keys(keys) as Action[]).find((a) => a !== action && keys[a] === code);
    if (other) keys[other] = keys[action];
    keys[action] = code;
    this.update({ keys });
  }

  reset() {
    this.update({ ...DEFAULTS, keys: { ...DEFAULT_KEYS } });
  }

  /** Abonnement ; renvoie la fonction de désabonnement. */
  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const settings = new SettingsStore();

// ---------------------------------------------------------------------------
// Libellés de touches (lettre réelle selon la disposition clavier sous Chrome / Edge)
// ---------------------------------------------------------------------------

const layout = new Map<string, string>();
const SPECIAL: Record<string, string> = {
  Space: 'Espace', ShiftLeft: 'Shift', ShiftRight: 'Shift D', ControlLeft: 'Ctrl', ControlRight: 'Ctrl D',
  AltLeft: 'Alt', AltRight: 'Alt Gr', Tab: 'Tab', CapsLock: 'Verr. Maj', Enter: 'Entrée', Backspace: 'Retour',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
};

export async function loadKeyboardLayout() {
  const kb = (navigator as Navigator & { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard;
  if (!kb?.getLayoutMap) return;
  try {
    for (const [code, key] of await kb.getLayoutMap()) layout.set(code, key);
  } catch {
    /* API indisponible (iframe, Firefox) : libellés déduits du code */
  }
}

export function keyLabel(code: string): string {
  if (SPECIAL[code]) return SPECIAL[code];
  const fromLayout = layout.get(code);
  if (fromLayout) return fromLayout.toUpperCase();
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  return code;
}
