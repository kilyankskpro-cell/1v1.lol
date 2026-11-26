/** Menus en jeu : pause et fin de match. Tous les boutons déclenchent une vraie action. */

export interface PauseHandlers {
  resume: () => void;
  restart: () => void;
  settings: () => void;
  menu: () => void;
}

const el = (id: string) => document.getElementById(id)!;

function bind(id: string, fn: () => void) {
  // Remplace les écouteurs précédents (le menu est réutilisé d'une partie à l'autre).
  const old = el(id);
  const btn = old.cloneNode(true) as HTMLElement;
  old.replaceWith(btn);
  btn.addEventListener('click', fn);
}

export function showPause(h: PauseHandlers, note: string) {
  bind('pause-resume', h.resume);
  bind('pause-restart', h.restart);
  bind('pause-settings', h.settings);
  bind('pause-menu-btn', h.menu);
  el('pause-note').textContent = note;
  el('pause-menu').classList.remove('hidden');
}

export function hidePause() {
  el('pause-menu').classList.add('hidden');
}

export function showMatchOver(victory: boolean, score: string, h: { replay: () => void; menu: () => void }) {
  el('match-title').textContent = victory ? 'VICTOIRE !' : 'DÉFAITE';
  el('match-title').className = victory ? 'win' : 'lose';
  el('match-score').textContent = score;
  bind('match-replay', h.replay);
  bind('match-menu', h.menu);
  el('match-over').classList.remove('hidden');
}

export function hideMatchOver() {
  el('match-over').classList.add('hidden');
}

export function hideAllOverlays() {
  hidePause();
  hideMatchOver();
}
