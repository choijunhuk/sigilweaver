import { startCamera } from './camera';
import { createTracker } from './tracker';
import { extractFeatures } from './features';
import { classify } from './classify';
import { TemporalFilter, type GestureEvent } from './filter';
import { drawHand, drawProgressRing } from './draw';
import { DEFAULT_CONFIG, type Sigil } from './types';

const SIGIL_LABEL: Record<Sigil, string> = {
  BOLT: '☝ BOLT', WARD: '✊ WARD', PULSE: '🖐 PULSE', ARC: '✌ ARC', FOCUS: '🤏 FOCUS', NONE: '',
};

const video = document.getElementById('video') as HTMLVideoElement;
const overlay = document.getElementById('overlay') as HTMLCanvasElement;
const hudEl = document.getElementById('hud')!;
const gestureEl = document.getElementById('gesture')!;
const flashEl = document.getElementById('flash')!;
const startEl = document.getElementById('start')!;
const startBtn = document.getElementById('startBtn') as HTMLButtonElement;

const INFER_INTERVAL_MS = 1000 / 24; // §15: inference 15–24fps, decoupled from render

// Metrics
let inferCount = 0;
let inferFps = 0;
let renderCount = 0;
let renderFps = 0;
let lastFpsAt = performance.now();
let inferMsAvg = 0;
const fireCounts = new Map<Sigil, number>();
let lastEvent: GestureEvent | null = null;
let lastHandSeenAt = 0;

startBtn.onclick = async () => {
  startBtn.disabled = true;
  startBtn.textContent = '로딩 중…';
  try {
    await run();
  } catch (e) {
    startBtn.textContent = '실패 — 다시 시도';
    startBtn.disabled = false;
    hudEl.textContent = String(e);
    console.error(e);
  }
};

async function run(): Promise<void> {
  const [tracker] = await Promise.all([createTracker(), startCamera(video)]);
  startEl.style.display = 'none';

  const ctx = overlay.getContext('2d')!;
  const filter = new TemporalFilter(DEFAULT_CONFIG);
  let lastInferAt = 0;
  let landmarks: ReturnType<typeof tracker.detectForVideo>['landmarks'][0] | undefined;

  const resize = () => {
    overlay.width = overlay.clientWidth * devicePixelRatio;
    overlay.height = overlay.clientHeight * devicePixelRatio;
  };
  resize();
  addEventListener('resize', resize);

  const loop = (now: number) => {
    renderCount++;

    if (now - lastInferAt >= INFER_INTERVAL_MS && video.readyState >= 2) {
      lastInferAt = now;
      const t0 = performance.now();
      const result = tracker.detectForVideo(video, now);
      const t1 = performance.now();
      inferMsAvg = inferMsAvg * 0.9 + (t1 - t0) * 0.1;
      inferCount++;

      landmarks = result.landmarks[0];
      if (landmarks) {
        lastHandSeenAt = now;
        const handedness = (result.handedness[0]?.[0]?.categoryName ?? 'Right') as 'Left' | 'Right';
        const features = extractFeatures(landmarks, handedness);
        const cls = classify(features, DEFAULT_CONFIG);
        const ev = filter.update(cls, now);
        if (ev) onFire(ev);
        updateHud(cls.sigil, cls.confidence, features.curls);
      } else {
        filter.update({ sigil: 'NONE', confidence: 0 }, now);
        updateHud('NONE', 0, null);
      }
    }

    drawHand(ctx, landmarks, overlay.width, overlay.height);
    drawProgressRing(ctx, landmarks, filter.progress, overlay.width, overlay.height);

    if (now - lastFpsAt >= 1000) {
      renderFps = renderCount; inferFps = inferCount;
      renderCount = 0; inferCount = 0; lastFpsAt = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function onFire(ev: GestureEvent): void {
  lastEvent = ev;
  fireCounts.set(ev.sigil, (fireCounts.get(ev.sigil) ?? 0) + 1);
  gestureEl.textContent = SIGIL_LABEL[ev.sigil];
  flashEl.style.opacity = '0.25';
  requestAnimationFrame(() => requestAnimationFrame(() => { flashEl.style.opacity = '0'; }));
  if (navigator.vibrate) navigator.vibrate(30);
  setTimeout(() => {
    if (lastEvent === ev) gestureEl.textContent = '';
  }, 900);
}

function updateHud(candidate: Sigil, confidence: number, curls: number[] | null): void {
  const counts = (['BOLT', 'WARD', 'PULSE', 'ARC', 'FOCUS'] as Sigil[])
    .map((s) => `${SIGIL_LABEL[s].slice(2)}:${fireCounts.get(s) ?? 0}`)
    .join(' ');
  const handLost = performance.now() - lastHandSeenAt > 1000;
  hudEl.textContent =
    `render ${renderFps}fps | infer ${inferFps}fps ${inferMsAvg.toFixed(1)}ms\n` +
    `candidate ${candidate} conf ${confidence.toFixed(2)}\n` +
    (curls ? `curls ${curls.map((c) => c.toFixed(2)).join(' ')}\n` : '') +
    (lastEvent
      ? `last fire ${lastEvent.sigil} latency ${lastEvent.confirmLatencyMs.toFixed(0)}ms\n`
      : '') +
    `fires ${counts}` +
    (handLost ? '\n\n⚠ 손을 보여주세요' : '');
}
