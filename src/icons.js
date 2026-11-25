const paths = {
  play: '<path d="M8 5.1 19 12 8 18.9z" fill="currentColor" stroke-linejoin="round"/>',
  arrow: '<path d="M4.5 12h14m-5.5-5.5 5.5 5.5-5.5 5.5"/>',
  diagonal: '<path d="M6.5 17.5 17 7m-9 0h9v9"/>',
  keyboard: '<rect x="2.8" y="5.8" width="18.4" height="12.4" rx="2"/><path d="M7 10h.01m3.3 0h.01m3.3 0h.01m3.3 0h.01M7 14h.01m3.3 0h6.6"/>',
  sound: '<path d="M11 5.1 6.3 9H3.5v6h2.8l4.7 3.9zm4 3.4a5 5 0 0 1 0 7m2.9-10a9 9 0 0 1 0 13"/>',
  mute: '<path d="M11 5.1 6.3 9H3.5v6h2.8l4.7 3.9zm4 4 5 5m0-5-5 5"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  crosshair: '<circle cx="12" cy="12" r="6"/><path d="M12 2v6m0 8v6M2 12h6m8 0h6"/>',
  link: '<path d="m10 13 4-4m-5.7 6.3L6.9 17a3 3 0 0 1-4.2-4.2l4.1-4.1a3 3 0 0 1 4.2 0m2 6.6a3 3 0 0 0 4.2 0l4.1-4.1A3 3 0 0 0 17.1 7l-1.6 1.6"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  copy: '<rect x="7" y="7" width="12" height="13" rx="2"/><path d="M15 7V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h2"/>',
  shield: '<path d="m12 2.8 7.4 3.1v5c0 5-3.7 8.4-7.4 10.3-3.7-1.9-7.4-5.3-7.4-10.3v-5z"/>',
  health: '<path d="M12 5v14M5 12h14" stroke-width="3.2"/>',
  pause: '<path d="M8.5 5v14m7 0V5" stroke-width="3"/>',
  burst: '<path d="M3 10.5h2.4l1.8-2h11.5v2H22V13h-3.4l-2 2h-3.8l.8 3h-3.1l-1.3-4.4H6.9l-2 2H3zm7 5h2.6M10 8.5V6.8h5v1.7"/>',
  scatter: '<path d="M3 10h16v1.2h3v2.5h-4.2l-2.6 1.8h-4l-1 2.7H7l1.1-4.5H6l-3 2.2zm2.2-1.4h12"/>',
  wall: '<rect x="3.6" y="4.5" width="16.8" height="15" rx="1"/><path d="M3.6 9.5h16.8m-16.8 5h16.8M9 4.5v5m5.5 0v5m-5.5 0v5"/>',
  ramp: '<path d="M3 18 18 5l3 4v10H3zm13.8-9.9 3.4 3.7M12.8 11.4l3.2 3.3M8.6 14.8l3.6 3.7"/>',
  floor: '<path d="m12 5 9 5-9 5-9-5zm-9 5v3.6l9 5 9-5V10m-9 5v3.6"/>',
  roof: '<path d="m12 4.5 9 11.2-9 4.4-9-4.4zm0 0v15.6m-9-4.4 9-2.9 9 2.9"/>',
  reload: '<path d="M20 7v5h-5M4 17v-5h5m-4 0a7 7 0 0 1 12-5l3 5m-16 0 3 5a7 7 0 0 0 12-5"/>',
  jump: '<path d="M12 19V5m-5 5 5-5 5 5"/>',
  mouse: '<rect x="6.5" y="2.7" width="11" height="18.6" rx="5.5"/><path d="M12 3v6"/>',
  trash: '<path d="M5 7h14m-12 0 1 13h8l1-13M10 7V4h4v3m-4 4v5m4-5v5"/>',
  cup: '<path d="M8 4h8v5a4 4 0 0 1-8 0zm0 2H4v2a4 4 0 0 0 4.5 4m7.5-6h4v2a4 4 0 0 1-4.5 4M12 13v5m-4 2h8"/>',
};

export function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}
