/**
 * Menu Paramètres (depuis le menu principal ou la pause) : sensibilité, volume,
 * qualité graphique, plein écran, champ de vision, inversion verticale, touches.
 * Chaque changement est appliqué immédiatement et sauvegardé (localStorage).
 */
import { audio } from '../game/Audio';
import { ACTION_LABELS, keyLabel, settings, type Action, type Quality } from '../game/Settings';

const panel = () => document.getElementById('settings-menu')!;
let onCloseCb: (() => void) | null = null;
let capture: ((e: KeyboardEvent) => void) | null = null;

const QUALITY_LABELS: Record<Quality, string> = { low: 'Basse', medium: 'Moyenne', high: 'Haute' };

export function isSettingsOpen() {
  return !panel().classList.contains('hidden');
}

export function openSettings(onClose: () => void) {
  onCloseCb = onClose;
  render();
  panel().classList.remove('hidden');
}

export function closeSettings() {
  stopCapture();
  panel().classList.add('hidden');
  const cb = onCloseCb;
  onCloseCb = null;
  cb?.();
}

function stopCapture() {
  if (capture) window.removeEventListener('keydown', capture, true);
  capture = null;
}

export function toggleFullscreen(on: boolean) {
  if (on && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
  if (!on && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
}

function slider(label: string, min: number, max: number, step: number, value: number, fmt: (v: number) => string, apply: (v: number) => void) {
  const row = document.createElement('label');
  row.className = 'set-row';
  row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output>${fmt(value)}</output>`;
  const input = row.querySelector('input')!;
  const out = row.querySelector('output')!;
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = fmt(v);
    apply(v);
  });
  return row;
}

function checkbox(label: string, value: boolean, apply: (v: boolean) => void) {
  const row = document.createElement('label');
  row.className = 'set-row';
  row.innerHTML = `<span>${label}</span><input type="checkbox" ${value ? 'checked' : ''}>`;
  const input = row.querySelector('input')!;
  input.addEventListener('change', () => apply(input.checked));
  return row;
}

function render() {
  stopCapture();
  const s = settings.data;
  const root = panel();
  root.innerHTML = `<div class="panel settings-panel"><h2>Paramètres</h2><div class="set-cols"><div class="set-col" id="set-general"></div><div class="set-col"><h3>Touches</h3><div id="set-keys" class="keys-grid"></div></div></div><div class="panel-actions"><button id="set-reset" class="ghost">Réinitialiser</button><button id="set-close">Fermer</button></div></div>`;
  const general = root.querySelector('#set-general')!;
  general.append(
    slider('Sensibilité souris', 0.1, 3, 0.05, s.sensitivity, (v) => v.toFixed(2), (v) => settings.update({ sensitivity: v })),
    slider('Volume', 0, 1, 0.05, s.volume, (v) => `${Math.round(v * 100)} %`, (v) => settings.update({ volume: v })),
    slider('Champ de vision', 60, 110, 1, s.fov, (v) => `${v}°`, (v) => settings.update({ fov: v })),
    checkbox('Inverser l’axe vertical', s.invertY, (v) => settings.update({ invertY: v })),
    checkbox('Plein écran', s.fullscreen, (v) => {
      settings.update({ fullscreen: v });
      toggleFullscreen(v);
    }),
  );
  const q = document.createElement('div');
  q.className = 'set-row';
  q.innerHTML = '<span>Qualité graphique</span><div class="seg"></div>';
  const seg = q.querySelector('.seg')!;
  (Object.keys(QUALITY_LABELS) as Quality[]).forEach((quality) => {
    const b = document.createElement('button');
    b.textContent = QUALITY_LABELS[quality];
    b.classList.toggle('on', s.quality === quality);
    b.addEventListener('click', () => {
      settings.update({ quality });
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    });
    seg.appendChild(b);
  });
  general.appendChild(q);

  const keys = root.querySelector('#set-keys')!;
  (Object.keys(ACTION_LABELS) as Action[]).forEach((action) => {
    const row = document.createElement('div');
    row.className = 'key-row';
    row.innerHTML = `<span>${ACTION_LABELS[action]}</span><button class="key-btn">${keyLabel(s.keys[action])}</button>`;
    const btn = row.querySelector('button')!;
    btn.addEventListener('click', () => {
      stopCapture();
      keys.querySelectorAll('.key-btn').forEach((b) => b.classList.remove('listening'));
      btn.classList.add('listening');
      btn.textContent = 'Appuyez…';
      capture = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        stopCapture();
        if (e.code !== 'Escape') settings.bind(action, e.code);
        audio.play('ui');
        render();
      };
      window.addEventListener('keydown', capture, true);
    });
    keys.appendChild(row);
  });

  root.querySelector('#set-reset')!.addEventListener('click', () => {
    settings.reset();
    render();
  });
  root.querySelector('#set-close')!.addEventListener('click', closeSettings);
}
