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
  private filter: TemporalFilter;
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
    this.filter = new TemporalFilter(cfg);
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

    const landmarks = result.landmarks[0];
    if (!landmarks) {
      this.filter.update({ sigil: 'NONE', confidence: 0 }, now);
      this.snapshot = {
        candidate: 'NONE',
        confidence: 0,
        progress: 0,
        landmarks: null,
        handSeen: now - this.lastHandSeenAt < 1000,
      };
      return;
    }

    this.lastHandSeenAt = now;
    const handedness = (result.handedness[0]?.[0]?.categoryName ?? 'Right') as 'Left' | 'Right';
    const cls = classify(extractFeatures(landmarks, handedness), this.cfg);
    const ev = this.filter.update(cls, now);
    this.snapshot = {
      candidate: this.filter.currentCandidate,
      confidence: cls.confidence,
      progress: this.filter.progress,
      landmarks,
      handSeen: true,
    };
    if (ev) this.fire(ev);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    if (this.video) stopCamera(this.video);
    this.tracker?.close();
    this.tracker = null;
    this.video = null;
  }
}
