import { icon } from './icons.js';

const modes = [
  { id: 'solo', type: 'COMBAT SOLO', title: 'Duel 1v1', description: 'Un face-à-face contre le bot. Premier à trois manches.', symbol: 'crosshair', action: 'Jouer le duel' },
  { id: 'practice', type: 'ENTRAÎNEMENT', title: 'Construction libre', description: 'Murs, rampes, sols, toits : construis sans limite de matériaux.', symbol: 'layers', action: 'S’entraîner' },
  { id: 'online', type: 'MULTIJOUEUR', title: 'Partie privée', description: 'Crée un salon et partage ton code pour défier un ami.', symbol: 'link', action: 'Ouvrir les salons' },
];

function modeArt(id) {
  const shapes = {
    solo: `<path d="M111 12v16m0 78v16M55 67h15m80 0h16M77 33l9 9m50 50 9 9m0-68-9 9M86 92l-9 9"/><circle cx="111" cy="67" r="34"/><circle cx="111" cy="67" r="23" opacity=".4" stroke-dasharray="2 5"/><path d="m111 49 18 18-18 18-18-18z" fill="currentColor" fill-opacity=".12"/><path d="M104 67h14m-7-7v14"/><circle cx="111" cy="67" r="47" opacity=".23"/><path d="M26 81h30m105-34h20M40 99h18m100-2h16" opacity=".4"/>`,
    practice: `<path d="m110 21 46 27-46 27-46-27z" fill="currentColor" fill-opacity=".12"/><path d="m110 36 23 12-23 14-23-14z" opacity=".46"/><path d="m64 62 46 27 46-27M64 77l46 27 46-27M64 93l46 27 46-27" stroke-opacity=".66"/><path d="M64 48v45m46-18v45m46-72v45" stroke-opacity=".26" stroke-dasharray="3 5"/><path d="M50 56h-9m136 15h-8M83 17h12m37 93h26" stroke-opacity=".38"/>`,
    online: `<path d="m92 31 30 17v34L92 99 62 82V48z" fill="currentColor" fill-opacity=".10"/><path d="m135 49 30 17v34l-30 17-30-17V66z" fill="currentColor" fill-opacity=".10"/><path d="m92 43 20 11v22L92 87 72 76V54zm43 18 20 11v22l-20 11-20-11V72z" opacity=".43"/><path d="m88 68 9-9m10 22 9-9m-24 2 20-12m10 26 22-13"/><circle cx="61" cy="23" r="2" fill="currentColor"/><circle cx="161" cy="45" r="2" fill="currentColor"/><path d="M39 101h20m72-75h24m-7 6h14" opacity=".5"/>`,
  };
  return `<svg class="mode-art" viewBox="0 0 183 130" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[id]}</svg>`;
}

export function lobbyMarkup() {
  return `<div class="lobby" id="lobby">
    <header class="site-header">
      <div class="shell header-inner">
        <a class="brand" href="/" aria-label="RIFT DUEL, accueil"><img src="/art/mark.svg" alt=""/><span>RIFT<span class="brand-slash">//</span>DUEL</span></a>
        <span class="header-label"><i></i> ARÈNE DE COMBAT</span>
        <div class="header-actions"><button class="header-control" type="button" data-action="help">${icon('keyboard', 18)} <span>Commandes</span></button><button type="button" class="icon-button sound-button" data-action="sound" aria-label="Couper le son" aria-pressed="true" title="Couper le son">${icon('sound', 18)}</button></div>
      </div>
    </header>
    <main class="shell lobby-main">
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-backdrop" aria-hidden="true"><div class="hero-grid"></div><img class="hero-fallback" src="/art/duel.svg" alt=""/><canvas class="hero-canvas" aria-hidden="true"></canvas><div class="hero-scrim"></div></div>
        <span class="hero-corner corner-tl"></span><span class="hero-corner corner-tr"></span><span class="hero-corner corner-bl"></span><span class="hero-corner corner-br"></span>
        <div class="hero-content">
          <p class="eyebrow hero-kicker"><i class="status-light"></i> TIR &amp; CONSTRUCTION <span>//</span> 1V1</p>
          <h1 id="hero-title"><span>CONSTRUIS.</span><span>DOMINE.</span></h1>
          <p class="hero-description">Un adversaire. Un seul gagnant. Prends de la hauteur, bâtis ta couverture et remporte le duel.</p>
          <div class="hero-actions"><button type="button" class="button button-primary" data-play="solo">${icon('play', 18)} Jouer en 1v1 ${icon('arrow', 18)}</button><button type="button" class="button button-quiet" data-play="practice">${icon('layers', 18)} S’entraîner</button></div>
        </div>
        <div class="hero-signal" aria-hidden="true"><i></i><span>ARÈNE // 07</span></div>
        <div class="hero-location" aria-hidden="true"><span><b>07</b><i></i></span><div><small>SECTEUR ACTIF</small><strong>LA FAILLE</strong></div></div>
        <div class="hero-index" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
      </section>
      <section class="modes" aria-labelledby="modes-title">
        <div class="modes-heading"><div><p class="eyebrow section-kicker"><i></i> SÉLECTION DE L’ARÈNE</p><h2 id="modes-title">MODES DE JEU</h2></div><span class="modes-index">01 <i></i> 03</span></div>
        <div class="mode-grid">${modes.map((mode, i) => `<button type="button" class="mode-card ${mode.id}" data-play="${mode.id}" aria-label="${mode.title} : ${mode.action}">${modeArt(mode.id)}<span class="mode-icon">${icon(mode.symbol, 18)}</span><span class="mode-meta"><span>0${i + 1}</span> / ${mode.type}</span><strong>${mode.title}</strong><span class="mode-description">${mode.description}</span><span class="mode-action">${mode.action} ${icon('arrow', 16)}</span></button>`).join('')}</div>
      </section>
    </main>
    <footer class="site-footer"><div class="shell footer-inner"><span><img src="/art/mark.svg" alt=""/> <b>RIFT<span>//</span>DUEL</b><i></i> Arène de duel indépendante</span><span>${icon('keyboard', 15)} CLAVIER + SOURIS <i></i> TACTILE</span></div></footer>
  </div>`;
}
