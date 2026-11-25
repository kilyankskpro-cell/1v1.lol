let context;
let enabled = true;

export function soundEnabled() { return enabled; }
export function toggleSound() { enabled = !enabled; return enabled; }

export function unlockSound() {
  if (!enabled || !window.AudioContext) return;
  try {
    context ||= new AudioContext();
    if (context.state === 'suspended') context.resume().catch(() => {});
  } catch { /* Audio is optional. */ }
}

const cues = {
  burst: [145, 46, .11, .046, 'sawtooth'], scatter: [93, 29, .18, .067, 'sawtooth'],
  enemy: [87, 53, .086, .019, 'triangle'], build: [260, 550, .13, .048, 'triangle'],
  hit: [840, 530, .097, .035, 'sine'], damage: [185, 75, .15, .037, 'triangle'], click: [330, 510, .08, .026, 'sine'],
};

export function playSound(name) {
  if (!enabled || context?.state !== 'running' || !cues[name]) return;
  const [start, end, duration, volume, wave] = cues[name];
  const at = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = wave;
  oscillator.frequency.setValueAtTime(start, at);
  oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
  gain.gain.setValueAtTime(.0002, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + .009);
  gain.gain.exponentialRampToValueAtTime(.0002, at + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(at);
  oscillator.stop(at + duration + .01);
}
