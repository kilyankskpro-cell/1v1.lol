import { icon } from './icons.js';

const bindings = [
  ['Se déplacer', '<kbd>Z Q S D</kbd><kbd>W A S D</kbd><kbd>↑ ← ↓ →</kbd>'],
  ['Viser', '<kbd>Souris</kbd>'],
  ['Tirer ou placer', '<kbd>Clic gauche</kbd>'],
  ['Sauter', '<kbd>Espace</kbd>'],
  ['Recharger', '<kbd>R</kbd>'],
  ['Changer d’arme', '<kbd>1</kbd><kbd>2</kbd>'],
  ['Mur, rampe, sol, toit', '<kbd>3</kbd><kbd>4</kbd><kbd>5</kbd><kbd>6</kbd>'],
  ['Mettre en pause', '<kbd>Échap</kbd>'],
];

export function dialogMarkup() {
  return `<dialog class="panel-dialog" aria-labelledby="dialog-title"><div class="dialog-inner"><button class="icon-button dialog-close" data-action="close" aria-label="Fermer" type="button">${icon('close')}</button><div data-dialog-content></div></div></dialog>`;
}

export function makeDialog(element) {
  const content = element.querySelector('[data-dialog-content]');
  const heading = (eyebrow, title, description) => `<p class="eyebrow dialog-kicker"><i class="status-light"></i> ${eyebrow}</p><h2 id="dialog-title">${title}</h2>${description ? `<p class="dialog-description">${description}</p>` : ''}`;
  function open(markup) {
    const wasOpen = element.open;
    content.innerHTML = markup;
    if (!wasOpen) element.showModal();
    else element.querySelector('.dialog-close').focus();
  }
  element.addEventListener('click', (event) => { if (event.target === element) element.close(); });
  return {
    get open() { return element.open; },
    close() { if (element.open) element.close(); },
    controls() {
      open(`${heading('MANUEL DE TERRAIN', 'Commandes', 'Deux outils pour prendre l’avantage : la visée et la construction.')}<dl class="binding-list">${bindings.map(([label, keys]) => `<div><dt>${label}</dt><dd>${keys}</dd></div>`).join('')}</dl><p class="dialog-hint">Sur écran tactile : utilise le joystick pour te déplacer, glisse dans l’arène pour viser et touche les emplacements pour t’équiper. À la souris, le clic droit maintenu permet aussi de viser.</p><button class="button button-primary dialog-main-button" data-action="close" type="button">Compris ${icon('arrow', 18)}</button>`);
    },
    online(code = '') {
      open(`${heading('MULTIJOUEUR', 'Partie privée', 'Invite un ami dans un duel 1v1. Un code suffit, sans compte.')}<button class="button button-primary dialog-main-button" data-action="create-room" type="button">${icon('link', 18)} Créer un salon ${icon('arrow', 18)}</button><div class="dialog-divider"><span>OU REJOINDRE</span></div><form class="room-form"><label for="room-code">Code du salon</label><div><input id="room-code" name="code" type="text" autocomplete="off" autocapitalize="characters" maxlength="6" minlength="6" placeholder="ABC123" spellcheck="false" required/><button class="button button-outline" type="submit">Rejoindre ${icon('arrow', 17)}</button></div></form><p class="dialog-message" role="status" aria-live="polite"></p>`);
      if (code) content.querySelector('input').value = code;
    },
    waiting(code) {
      open(`${heading('SALON PRIVÉ', 'En attente', 'Partage ce code ou le lien avec ton ami. Le duel commence quand il rejoint le salon.')}<div class="room-display"><div><small>CODE DU SALON</small><strong data-room-code></strong></div><button type="button" class="icon-button" data-action="copy-code" aria-label="Copier le code" title="Copier le code">${icon('copy')}</button></div><button class="button button-primary dialog-main-button" data-action="share-room" type="button">${icon('link', 18)} Copier le lien d’invitation</button><p class="dialog-message" role="status" aria-live="polite"></p>`);
      content.querySelector('[data-room-code]').textContent = code;
    },
    message(message, isError = false) {
      const status = content.querySelector('.dialog-message');
      if (status) { status.textContent = message; status.classList.toggle('is-error', isError); }
    },
    busy(value) {
      for (const button of content.querySelectorAll('[data-action="create-room"], [type="submit"]')) button.disabled = value;
    },
  };
}
