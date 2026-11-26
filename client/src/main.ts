import './style.css';
import type { GameMode } from '@shared/arena';
import type { BotDifficulty } from '@shared/protocol';
import { audio } from './game/Audio';
import { Game } from './game/Game';
import { connect } from './game/Network';
import { loadKeyboardLayout } from './game/Settings';
import { closeSettings, isSettingsOpen, openSettings } from './ui/SettingsPanel';

const $ = (id: string) => document.getElementById(id)!;
const mainMenu = $('main-menu');
const modeMenu = $('mode-menu');
const nameInput = $('name-input') as HTMLInputElement;
nameInput.value = localStorage.getItem('player-name') ?? '';

let game: Game | null = null;
let starting = false;

function showScreen(screen: HTMLElement | null) {
  for (const s of [mainMenu, modeMenu]) s.classList.toggle('hidden', s !== screen);
}

async function startGame(mode: GameMode, difficulty?: BotDifficulty) {
  if (starting) return;
  starting = true;
  const name = nameInput.value.trim() || 'Joueur';
  localStorage.setItem('player-name', name);
  showScreen(null);
  $('loading').classList.remove('hidden');
  // Seul le duel en ligne passe par le serveur ; les autres modes tournent dans le navigateur.
  const conn = await connect(mode !== 'duel');
  $('loading').classList.add('hidden');
  game = new Game($('game-root'), { mode, name, difficulty, conn, onExit: backToMenu });
  game.start();
  starting = false;
}

function backToMenu() {
  game?.dispose();
  game = null;
  showScreen(mainMenu);
}

// Son d'interface sur tous les boutons des menus.
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) audio.play('ui');
});

$('btn-play').addEventListener('click', () => showScreen(modeMenu));
$('btn-back').addEventListener('click', () => showScreen(mainMenu));
$('btn-settings').addEventListener('click', () => openSettings(() => {}));
document.querySelectorAll<HTMLButtonElement>('[data-start]').forEach((btn) => {
  btn.addEventListener('click', () => void startGame(btn.dataset.start as GameMode, btn.dataset.difficulty as BotDifficulty | undefined));
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && isSettingsOpen() && !game) closeSettings();
});

void loadKeyboardLayout();
