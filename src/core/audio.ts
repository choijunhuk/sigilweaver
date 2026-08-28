/** Tiny WebAudio synth — no asset files (§13). All fire-and-forget. */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function initAudio(): void {
  if (ctx) return;
  ctx = new AudioContext();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

function env(g: GainNode, t0: number, peak: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
}

function tone(freq: number, decay: number, type: OscillatorType = 'square', peak = 0.25): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env(g, t0, peak, decay);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + decay + 0.05);
}

function sweep(from: number, to: number, decay: number, type: OscillatorType = 'sawtooth'): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, to), t0 + decay);
  env(g, t0, 0.22, decay);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + decay + 0.05);
}

function noise(decay: number, peak = 0.2, highpass = 0): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime;
  const len = Math.ceil(ctx.sampleRate * decay);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  env(g, t0, peak, decay);
  let node: AudioNode = src;
  if (highpass) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = highpass;
    node.connect(hp);
    node = hp;
  }
  node.connect(g);
  g.connect(master);
  src.start(t0);
}

// §13: 인장 확정음은 계열별로 구분되는 짧은 신스톤
const SIGIL_FREQ: Record<string, number> = {
  BOLT: 660, WARD: 330, PULSE: 440, ARC: 880, FOCUS: 550,
};

export const sfx = {
  cast(sigil: string): void {
    tone(SIGIL_FREQ[sigil] ?? 500, 0.12, 'square');
  },
  hit(): void {
    noise(0.06, 0.14, 1200);
  },
  enemyDeath(): void {
    sweep(320, 60, 0.25);
  },
  wardBlock(): void {
    tone(1250, 0.09, 'triangle', 0.3);
  },
  playerHit(): void {
    sweep(140, 55, 0.3, 'square');
    noise(0.12, 0.2);
  },
  phrase(): void {
    // rising chord (§13: 인장문 완성 시 화음 상승)
    tone(523, 0.35, 'triangle', 0.2);
    setTimeout(() => tone(659, 0.35, 'triangle', 0.2), 70);
    setTimeout(() => tone(784, 0.45, 'triangle', 0.25), 140);
  },
  uiPick(): void {
    tone(740, 0.1, 'triangle', 0.18);
  },
};

/** Dark ambient BGM: slow detuned drone + combat layer (§13 수직 레이어링). */
let bgmNodes: { stop(): void } | null = null;
let combatLayer: GainNode | null = null;

export function startBgm(): void {
  if (!ctx || !master || bgmNodes) return;
  const oscs: OscillatorNode[] = [];
  const g = ctx.createGain();
  g.gain.value = 0.05;
  g.connect(master);
  for (const [freq, detune] of [[55, 0], [55, 6], [82.4, -4]] as const) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = detune;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    o.connect(lp).connect(g);
    o.start();
    oscs.push(o);
  }
  combatLayer = ctx.createGain();
  combatLayer.gain.value = 0;
  const co = ctx.createOscillator();
  co.type = 'triangle';
  co.frequency.value = 110;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 2.2;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 30;
  lfo.connect(lfoG).connect(co.frequency);
  co.connect(combatLayer).connect(master);
  co.start();
  lfo.start();
  oscs.push(co, lfo);
  bgmNodes = { stop: () => oscs.forEach((o) => o.stop()) };
}

export function setCombatLayer(on: boolean): void {
  if (!ctx || !combatLayer) return;
  combatLayer.gain.linearRampToValueAtTime(on ? 0.045 : 0, ctx.currentTime + 1.2);
}

export function stopBgm(): void {
  bgmNodes?.stop();
  bgmNodes = null;
  combatLayer = null;
}
