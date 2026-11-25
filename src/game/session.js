import { Match, WINS } from '../../shared/match.js';
import { icon } from '../icons.js';
import { playSound, unlockSound } from './audio.js';
import { bindControls } from './controls.js';
import { hudMarkup, makeHud } from './hud.js';
import { makeWorld } from './world.js';

export function gameMarkup() {
  return `<main class="game" id="game" aria-label="Arène de jeu" tabindex="-1" hidden><canvas class="arena-canvas" aria-label="Vue de l’arène 3D"></canvas>${hudMarkup()}<div class="game-overlay" hidden><div class="game-panel" role="dialog" aria-modal="true" aria-labelledby="game-panel-title"></div></div></main>`;
}

export function startGame(game, { mode, id = 0, initial, client, onQuit, onHelp }) {
  const canvas = game.querySelector('canvas');
  const world = makeWorld(canvas);
  const overlay = game.querySelector('.game-overlay');
  const panel = overlay.querySelector('.game-panel');
  const events = new AbortController();
  let match = mode === 'online' ? null : new Match(mode);
  let state = initial || match.snapshot();
  let paused = false;
  let endShown = false;
  let lastRound = state.round;
  let lastShot = 0;
  let lastPiece = 0;
  let lastFrame = performance.now();
  let frame = 0;
  let accumulator = 0;
  let lastSend = 0;
  let stopped = false;
  const step = 1 / 60;
  const hud = makeHud(game, mode, pause, () => match?.clearBuilds());
  const controls = bindControls(canvas, hud.root, { paused: () => paused || endShown, pause, select: (tool) => hud.select(tool) });

  function showPanel(tag, title, text, buttons) {
    panel.innerHTML = `<p class="eyebrow dialog-kicker">${icon(tag === 'RESULTAT DU DUEL' ? 'cup' : 'pause', 16)} ${tag}</p><h2 id="game-panel-title">${title}</h2><p>${text}</p><div class="game-panel-actions">${buttons}</div>`;
    overlay.hidden = false;
    hud.root.inert = true;
    panel.querySelector('button')?.focus();
  }
  function hidePanel() { overlay.hidden = true; hud.root.inert = false; game.focus({ preventScroll: true }); }
  const button = (action, label, symbol, primary = false) => `<button class="button ${primary ? 'button-primary' : 'button-outline'}" type="button" data-game-action="${action}">${symbol ? icon(symbol, 18) : ''}${label}</button>`;
  function pause() {
    if (endShown || paused) return;
    paused = true;
    controls.releaseLock();
    if (client) client.send('input', { input: controls.input(performance.now()) });
    showPanel('ARÈNE EN COURS', 'Pause', mode === 'online' ? 'Le duel en ligne continue pendant que ce menu est ouvert.' : 'Reprends quand tu veux. L’arène t’attend.',
      button('resume', 'Reprendre', 'play', true) + button('help', 'Commandes', 'keyboard') + button('quit', 'Retour à l’accueil'));
  }
  function resume() { if (paused && !endShown) { paused = false; unlockSound(); hidePanel(); } }
  function resetTo(next) {
    state = next;
    lastRound = state.round;
    lastShot = state.shots.at(-1)?.id || 0;
    lastPiece = 0;
    accumulator = 0;
    world.reset();
    controls.reset(state.players[id]);
    endShown = paused = false;
    hidePanel();
  }
  panel.addEventListener('click', (event) => {
    const action = event.target.closest('[data-game-action]')?.dataset.gameAction;
    if (action === 'resume') resume();
    else if (action === 'help') onHelp();
    else if (action === 'quit') onQuit();
    else if (action === 'again') {
      if (client) {
        client.send('rematch');
        const again = panel.querySelector('[data-game-action="again"]');
        again.textContent = 'En attente de l’adversaire…';
        again.disabled = true;
      } else {
        match = new Match(mode);
        resetTo(match.snapshot());
      }
    }
  }, { signal: events.signal });
  window.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || document.querySelector('dialog[open]') || endShown || event.repeat) return;
    if (document.pointerLockElement === canvas) return;
    event.preventDefault();
    if (paused) resume(); else pause();
  }, { signal: events.signal });

  function draw(now) {
    if (stopped) return;
    const dt = Math.min(.10, (now - lastFrame) / 1000);
    lastFrame = now;
    if (match && !paused && !endShown) {
      accumulator += dt;
      match.setInput(id, controls.input(now));
      while (accumulator >= step) { match.update(step); accumulator -= step; }
      state = match.snapshot();
    } else if (client && now - lastSend >= 28 && !endShown) {
      client.send('input', { input: controls.input(now) });
      lastSend = now;
    }
    if (state.round !== lastRound) { controls.reset(state.players[id]); lastRound = state.round; }
    const newest = state.pieces.at(-1)?.id || 0;
    if (newest > lastPiece) {
      if (state.pieces.some((piece) => piece.id > lastPiece && piece.owner === id)) playSound('build');
      lastPiece = newest;
    }
    for (const shot of state.shots) if (shot.id > lastShot) {
      if (shot.player === id) {
        playSound(shot.tool);
        if (shot.target !== null) { hud.hit(now); playSound('hit'); }
      } else {
        playSound('enemy');
        if (shot.target === id) { hud.damaged(now); playSound('damage'); }
      }
      lastShot = shot.id;
    }
    if (!endShown && state.phase === 'finished') {
      endShown = true;
      const victory = state.scores[id] === WINS;
      controls.releaseLock();
      showPanel('RESULTAT DU DUEL', victory ? 'Victoire !' : 'Défaite', `Score final : ${state.scores[id]} — ${state.scores[1 - id]}`,
        button('again', 'Rejouer', 'reload', true) + button('quit', 'Retour à l’accueil'));
    }
    hud.update(state, id, controls.tool, now);
    world.render(state, id, controls.aim, controls.tool, dt);
    frame = requestAnimationFrame(draw);
  }
  controls.reset(state.players[id]);
  game.focus({ preventScroll: true });
  hud.update(state, id, controls.tool, lastFrame);
  world.render(state, id, controls.aim, controls.tool, 1 / 60);
  frame = requestAnimationFrame(draw);

  return {
    accept(next, reset = false) { if (reset) resetTo(next); else state = next; },
    close() {
      stopped = true;
      cancelAnimationFrame(frame);
      controls.close();
      events.abort();
      world.close();
      overlay.hidden = true;
      hud.root.inert = false;
    },
  };
}
