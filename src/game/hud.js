import { PIECES, TOOLS } from '../../shared/arena.js';
import { WEAPONS, WINS } from '../../shared/match.js';
import { icon } from '../icons.js';

export const PIECE_NAMES = { wall: 'Mur', ramp: 'Rampe', floor: 'Sol', roof: 'Toit' };
const TOOL_NAMES = { burst: WEAPONS.burst.name, scatter: WEAPONS.scatter.name, ...PIECE_NAMES };
export const MODE_NAMES = { solo: 'Duel 1v1', online: 'Partie privée', practice: 'Construction libre' };

export function hudMarkup() {
  const slot = (name, i) => `<button type="button" class="tool-slot" data-tool="${name}" aria-label="${TOOL_NAMES[name]} (${i + 1})" aria-pressed="false" title="${TOOL_NAMES[name]} (${i + 1})"><kbd>${i + 1}</kbd>${icon(name, 28)}<small>${TOOL_NAMES[name]}</small></button>`;
  const meter = (kind, name, max) => `<div class="meter meter-${kind}">${icon(kind, 17)}<div class="meter-track" role="progressbar" aria-label="${name}" aria-valuemin="0" aria-valuemax="${max}"><div></div></div><strong></strong></div>`;
  return `<div class="game-hud">
    <div class="game-top"><div class="game-label"><img src="/art/mark.svg" alt=""/><div><strong data-ui="mode"></strong><small>SECTEUR 07 <i></i> LA FAILLE</small></div></div>
      <div class="scoreboard" aria-label="Score"><div class="score-side ally"><span>TOI</span><div data-ui="own-score"></div></div><div class="round-clock"><span data-ui="round"></span><strong data-ui="time"></strong></div><div class="score-side rival"><span data-ui="opponent"></span><div data-ui="their-score"></div></div></div>
      <div class="game-menu-actions"><button class="icon-button clear-button" type="button" aria-label="Effacer les constructions" title="Effacer les constructions" hidden>${icon('trash')}</button><button class="icon-button pause-button" type="button" aria-label="Pause" title="Pause (Échap)">${icon('pause')}</button></div></div>
    <div class="reticle" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></div><div class="damage-flash" aria-hidden="true"></div>
    <div class="match-note" hidden><small data-ui="cue"></small><strong data-ui="notice"></strong></div>
    <div class="aim-tip">${icon('mouse', 14)}<span>Clique dans l’arène pour capturer la souris</span></div>
    <div class="touch-controls"><div class="joystick" aria-label="Joystick de déplacement"><i></i></div><div class="touch-actions"><button type="button" data-touch="jump" aria-label="Sauter">${icon('jump')}</button><button type="button" data-touch="reload" aria-label="Recharger">${icon('reload')}</button><button type="button" data-touch="fire" aria-label="Tirer ou placer">${icon('crosshair', 30)}</button></div></div>
    <div class="game-bottom"><div class="vitals">${meter('shield', 'Bouclier', 50)}${meter('health', 'Points de vie', 100)}</div>
      <div class="loadout" aria-label="Équipement"><div class="slot-group">${TOOLS.slice(0, 2).map(slot).join('')}</div><span class="slot-divider"></span><div class="slot-group">${TOOLS.slice(2).map((name, i) => slot(name, i + 2)).join('')}</div></div>
      <div class="ammo-panel"><small data-ui="ammo-title"></small><strong data-ui="ammo"></strong><span data-ui="ammo-info"></span></div></div>
  </div>`;
}

export function makeHud(game, mode, onPause, onClear) {
  const root = game.querySelector('.game-hud');
  const fields = Object.fromEntries([...root.querySelectorAll('[data-ui]')].map((element) => [element.dataset.ui, element]));
  const get = (selector) => root.querySelector(selector);
  const write = (element, value) => { const next = String(value); if (element.textContent !== next) element.textContent = next; };
  const score = (element, count) => {
    if (Number(element.dataset.score || -1) === count) return;
    element.dataset.score = count;
    element.innerHTML = Array.from({ length: WINS }, (_, index) => `<i class="${index < count ? 'scored' : ''}"></i>`).join('');
    element.setAttribute('aria-label', `${count} manche${count === 1 ? '' : 's'} gagnée${count === 1 ? '' : 's'}`);
  };
  const meter = (kind, value, max) => {
    const track = get(`.meter-${kind} .meter-track`);
    track.setAttribute('aria-valuenow', value);
    track.firstElementChild.style.width = `${value / max * 100}%`;
    write(get(`.meter-${kind} strong`), value);
  };
  write(fields.mode, MODE_NAMES[mode]);
  root.dataset.mode = mode;
  root.querySelector('.scoreboard').hidden = mode === 'practice';
  const clear = get('.clear-button');
  clear.hidden = mode !== 'practice';
  clear.onclick = onClear;
  get('.pause-button').onclick = onPause;
  const reticle = get('.reticle');
  const flash = get('.damage-flash');
  const note = get('.match-note');
  const aimTip = get('.aim-tip');
  const slots = root.querySelectorAll('[data-tool]');
  const minutes = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  let hitUntil = 0;
  let damageUntil = 0;

  return {
    root,
    select(tool) {
      for (const slot of slots) slot.setAttribute('aria-pressed', String(slot.dataset.tool === tool));
      reticle.classList.toggle('building', PIECES.includes(tool));
    },
    hit(now) { hitUntil = now + 155; },
    damaged(now) { damageUntil = now + 225; },
    update(state, id, tool, now) {
      const player = state.players[id];
      const building = PIECES.includes(tool);
      meter('shield', player.shield, 50);
      meter('health', player.hp, 100);
      write(fields['ammo-title'], TOOL_NAMES[tool]);
      write(fields.ammo, building ? mode === 'practice' ? '∞' : player.materials : player.ammo[tool]);
      write(fields['ammo-info'], building ? 'MATÉRIAUX' : player.reloadTool === tool ? 'RECHARGEMENT' : `/ ${WEAPONS[tool].clip}`);
      reticle.classList.toggle('hit', now < hitUntil);
      flash.classList.toggle('active', now < damageUntil);
      aimTip.hidden = document.pointerLockElement !== null || state.phase !== 'playing';
      if (mode === 'practice') {
        clear.disabled = state.pieces.length === 0;
        return;
      }
      write(fields.round, `MANCHE ${String(state.round).padStart(2, '0')}`);
      write(fields.opponent, mode === 'solo' ? 'BOT' : 'ADVERSAIRE');
      write(fields.time, minutes(state.phase === 'countdown' ? 90 : Math.ceil(state.remaining)));
      score(fields['own-score'], state.scores[id]);
      score(fields['their-score'], state.scores[1 - id]);
      note.hidden = !['countdown', 'between'].includes(state.phase);
      if (state.phase === 'countdown') {
        write(fields.cue, 'PRÉPARE-TOI');
        write(fields.notice, Math.ceil(state.remaining));
      } else if (state.phase === 'between') {
        write(fields.cue, `MANCHE ${state.round}`);
        write(fields.notice, state.roundWinner === null ? 'ÉGALITÉ' : state.roundWinner === id ? 'MANCHE GAGNÉE' : 'MANCHE PERDUE');
      }
    },
  };
}
