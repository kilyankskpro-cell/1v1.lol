import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/barlow-condensed/800-italic.css';
import '@fontsource/barlow-condensed/900-italic.css';
import '@fontsource-variable/space-grotesk';
import './styles.css';
import './game/game.css';
import { lobbyMarkup } from './lobby.js';
import { dialogMarkup, makeDialog } from './dialog.js';
import { gameMarkup, startGame } from './game/session.js';
import { playSound, soundEnabled, toggleSound, unlockSound } from './game/audio.js';
import { renderHero } from './game/scenery.js';
import { connectRoom } from './online.js';
import { icon } from './icons.js';

const app = document.querySelector('#app');
app.innerHTML = `${lobbyMarkup()}${gameMarkup()}${dialogMarkup()}<div class="toast" role="status" aria-live="polite" hidden></div>`;
const lobby = app.querySelector('#lobby');
const game = app.querySelector('#game');
const dialogElement = app.querySelector('dialog');
const dialog = makeDialog(dialogElement);
const toast = app.querySelector('.toast');
let toastTimer;
let session;
let client;
let roomCode;
let playerId;
let trigger;

try {
  renderHero(lobby.querySelector('.hero-canvas'));
  lobby.querySelector('.hero').classList.add('rendered');
} catch { /* The lobby has original static art when WebGL is unavailable. */ }

function notice(text) {
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.hidden = false;
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
}

function cleanupRoom() {
  client?.close();
  client = roomCode = playerId = undefined;
}

function home() {
  session?.close();
  session = undefined;
  cleanupRoom();
  game.hidden = true;
  lobby.hidden = false;
  document.body.classList.remove('game-open');
  trigger?.focus({ preventScroll: true });
}

function enter(mode, initial) {
  unlockSound();
  lobby.hidden = true;
  game.hidden = false;
  document.body.classList.add('game-open');
  try {
    session = startGame(game, { mode, id: playerId, initial, client, onQuit: home, onHelp: () => dialog.controls() });
    dialog.close();
    game.focus({ preventScroll: true });
    const url = new URL(window.location.href);
    if (url.searchParams.has('salon')) {
      url.searchParams.delete('salon');
      history.replaceState(history.state, '', url);
    }
  } catch {
    home();
    dialog.close();
    notice('L’arène 3D ne peut pas démarrer. Vérifie que WebGL est activé dans ton navigateur.');
  }
}

function disconnected(message) {
  if (session) { home(); notice(message); }
  else {
    cleanupRoom();
    if (dialog.open) { dialog.online(); dialog.message(message, true); }
  }
}

function roomRequest(type, code) {
  if (!client) client = connectRoom({
    message(message) {
      if (message.type === 'joined') {
        roomCode = message.code;
        playerId = message.player;
        if (playerId === 0) dialog.waiting(roomCode);
      } else if (message.type === 'start') {
        if (session) session.accept(message.state, true);
        else enter('online', message.state);
      } else if (message.type === 'state') session?.accept(message.state);
      else if (message.type === 'error') {
        if (roomCode) disconnected(message.message);
        else { dialog.busy(false); dialog.message(message.message, true); }
      } else if (message.type === 'left') disconnected('L’autre joueur a quitté la partie.');
    },
    disconnected: () => disconnected('Connexion au salon perdue. Réessaie dans un instant.'),
  });
  dialog.busy(true);
  dialog.message('Connexion au salon…');
  client.send(type, type === 'join' ? { code } : undefined);
}

async function copyRoom(link) {
  if (!roomCode) return;
  const url = new URL(window.location.href);
  url.searchParams.set('salon', roomCode);
  try {
    await navigator.clipboard.writeText(link ? url.href : roomCode);
    dialog.message(link ? 'Lien d’invitation copié.' : 'Code copié.');
  } catch {
    dialog.message(link ? url.href : `Code à recopier : ${roomCode}`);
  }
}

function syncSound(button) {
  const enabled = soundEnabled();
  const label = enabled ? 'Couper le son' : 'Activer le son';
  button.innerHTML = icon(enabled ? 'sound' : 'mute', 18);
  button.setAttribute('aria-pressed', String(enabled));
  button.setAttribute('aria-label', label);
  button.title = label;
}

app.addEventListener('click', (event) => {
  const play = event.target.closest('[data-play]');
  const button = event.target.closest('[data-action]');
  if (play) {
    trigger = play;
    unlockSound();
    playSound('click');
    if (play.dataset.play === 'online') dialog.online();
    else enter(play.dataset.play);
  } else if (button) {
    switch (button.dataset.action) {
      case 'help': dialog.controls(); break;
      case 'sound': toggleSound(); unlockSound(); playSound('click'); syncSound(button); break;
      case 'close': dialog.close(); break;
      case 'create-room': roomRequest('create'); break;
      case 'copy-code': copyRoom(false); break;
      case 'share-room': copyRoom(true); break;
    }
  }
});
app.addEventListener('submit', (event) => {
  if (!event.target.matches('.room-form')) return;
  event.preventDefault();
  const code = new FormData(event.target).get('code').trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) { dialog.message('Saisis les six caractères du code du salon.', true); return; }
  roomRequest('join', code);
});
dialogElement.addEventListener('close', () => { if (!session && !dialog.open) cleanupRoom(); });
const invited = new URLSearchParams(window.location.search).get('salon');
if (/^[A-Z2-9]{6}$/.test(invited || '')) dialog.online(invited);
