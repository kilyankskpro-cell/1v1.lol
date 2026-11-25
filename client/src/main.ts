import './style.css';
import type { GameMode } from '@shared/arena';
import { Game } from './game/Game';

const menu = document.getElementById('menu')!;
const nameInput = document.getElementById('name-input') as HTMLInputElement;
nameInput.value = localStorage.getItem('player-name') ?? '';

menu.querySelectorAll<HTMLButtonElement>('button[data-mode]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const name = nameInput.value.trim() || 'Joueur';
    localStorage.setItem('player-name', name);
    menu.classList.add('hidden');
    const game = new Game(document.getElementById('game-root')!, btn.dataset.mode as GameMode, name);
    game.start();
  });
});
