import { BaseGestureSource } from './source';
import { extractFeatures } from './features';
import { classify } from './classify';
import { TemporalFilter, type GestureEvent } from './filter';
import { unpackLandmarks, type Recording } from './recording';
import type { GestureConfig } from './types';

/**
 * Replays a recorded landmark stream through the full classify+filter
 * pipeline — camera-free testing of everything downstream of the tracker.
 */
export class ReplayGestureSource extends BaseGestureSource {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private recording: Recording,
    private cfg: GestureConfig,
  ) {
    super();
  }

  /** Process every frame synchronously (tests). Returns all fired events. */
  runSync(): GestureEvent[] {
    const filter = new TemporalFilter(this.cfg);
    const events: GestureEvent[] = [];
    for (const frame of this.recording.frames) {
      const landmarks = unpackLandmarks(frame.lm);
      const features = extractFeatures(landmarks, frame.handedness);
      const cls = classify(features, this.cfg);
      const ev = filter.update(cls, frame.t);
      this.snapshot = {
        candidate: cls.sigil,
        confidence: cls.confidence,
        progress: filter.progress,
        landmarks,
        handSeen: true,
        hands: [{ landmarks, candidate: cls.sigil, confidence: cls.confidence, progress: filter.progress }],
      };
      if (ev) {
        events.push(ev);
        this.fire(ev);
      }
    }
    return events;
  }

  /** Real-time playback along recorded timestamps (demo/debug use). */
  async start(): Promise<void> {
    const filter = new TemporalFilter(this.cfg);
    const frames = this.recording.frames;
    let i = 0;
    const t0 = performance.now();
    const step = () => {
      while (i < frames.length && frames[i].t <= performance.now() - t0) {
        const frame = frames[i++];
        const landmarks = unpackLandmarks(frame.lm);
        const cls = classify(extractFeatures(landmarks, frame.handedness), this.cfg);
        const ev = filter.update(cls, frame.t);
        this.snapshot = {
          candidate: cls.sigil,
          confidence: cls.confidence,
          progress: filter.progress,
          landmarks,
          handSeen: true,
        hands: [{ landmarks, candidate: cls.sigil, confidence: cls.confidence, progress: filter.progress }],
        };
        if (ev) this.fire(ev);
      }
      if (i < frames.length) this.timer = setTimeout(step, 16);
    };
    step();
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
