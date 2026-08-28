import type { HandLandmarker } from '@mediapipe/tasks-vision';
import { BaseGestureSource } from './source';
import { extractFeatures } from './features';
import { classify } from './classify';
import { TemporalFilter } from './filter';
import { startCamera, stopCamera } from '../cv/camera';
import { createTracker } from '../cv/tracker';
import type { GestureConfig } from './types';
import { log } from '../core/log';

const INFER_INTERVAL_MS = 1000 / 24; // §15: inference throttled, decoupled from render

/** Live camera pipeline: getUserMedia → MediaPipe → classify → FSM → events. */
export class CameraGestureSource extends BaseGestureSource {
  private video: HTMLVideoElement | null = null;
  private tracker: HandLandmarker | null = null;
  /** independent FSM per hand so 양손 교대 casting works (§3) */
  private filters = new Map<'Left' | 'Right', TemporalFilter>();
  private rafId = 0;
  private lastInferAt = 0;
  private lastHandSeenAt = 0;
  /** perf metrics for debug HUD */
  inferMsAvg = 0;
  inferFps = 0;
  private inferCount = 0;
  private lastFpsAt = 0;

  constructor(private cfg: GestureConfig) {
    super();
    this.filters.set('Left', new TemporalFilter(cfg));
    this.filters.set('Right', new TemporalFilter(cfg));
  }

  async start(): Promise<void> {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    const [tracker] = await Promise.all([createTracker(), startCamera(this.video)]);
    this.tracker = tracker;
    log('cv', 'camera source started');
    const loop = (now: number) => {
      this.step(now);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private step(now: number): void {
    if (!this.tracker || !this.video) return;
    if (now - this.lastInferAt < INFER_INTERVAL_MS || this.video.readyState < 2) return;
    this.lastInferAt = now;

    const t0 = performance.now();
    const result = this.tracker.detectForVideo(this.video, now);
    this.inferMsAvg = this.inferMsAvg * 0.9 + (performance.now() - t0) * 0.1;
    this.inferCount++;
    if (now - this.lastFpsAt >= 1000) {
      this.inferFps = this.inferCount;
      this.inferCount = 0;
      this.lastFpsAt = now;
    }

    if (result.landmarks.length === 0) {
      for (const f of this.filters.values()) f.update({ sigil: 'NONE', confidence: 0 }, now);
      this.snapshot = {
        candidate: 'NONE',
        confidence: 0,
        progress: 0,
        landmarks: null,
        handSeen: now - this.lastHandSeenAt < 1000,
        hands: [],
      };
      return;
    }

    this.lastHandSeenAt = now;
    const hands: typeof this.snapshot.hands = [];
    const seen = new Set<'Left' | 'Right'>();
    for (let i = 0; i < result.landmarks.length; i++) {
      const landmarks = result.landmarks[i];
      const handedness = (result.handedness[i]?.[0]?.categoryName ?? 'Right') as 'Left' | 'Right';
      if (seen.has(handedness)) continue; // duplicate label — keep the first
      seen.add(handedness);
      const filter = this.filters.get(handedness)!;
      const cls = classify(extractFeatures(landmarks, handedness), this.cfg);
      const ev = filter.update(cls, now);
      hands.push({
        landmarks,
        candidate: filter.currentCandidate,
        confidence: cls.confidence,
        progress: filter.progress,
      });
      if (ev) this.fire(ev);
    }
    // idle the filter of a hand that left the frame
    for (const [label, f] of this.filters) {
      if (!seen.has(label)) f.update({ sigil: 'NONE', confidence: 0 }, now);
    }

    // primary = the hand closest to confirming
    hands.sort((a, b) => b.progress - a.progress || b.confidence - a.confidence);
    const primary = hands[0];
    this.snapshot = {
      candidate: primary.candidate,
      confidence: primary.confidence,
      progress: primary.progress,
      landmarks: primary.landmarks,
      handSeen: true,
      hands,
    };
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    if (this.video) stopCamera(this.video);
    this.tracker?.close();
    this.tracker = null;
    this.video = null;
  }
}
