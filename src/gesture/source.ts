import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { GestureEvent } from './filter';
import type { Sigil } from './types';

/** Live recognition state, polled by UI every render frame. */
export interface GestureSnapshot {
  candidate: Sigil;
  confidence: number;
  /** stabilization progress 0..1 (§12 인식 게이지) */
  progress: number;
  /** latest landmarks for silhouette drawing; null = hand not seen */
  landmarks: NormalizedLandmark[] | null;
  handSeen: boolean;
}

/**
 * The single boundary between input and game (§14): the game only ever sees
 * GestureEvents + a poll-able snapshot. Implementations: CameraGestureSource,
 * ReplayGestureSource, ButtonGestureSource.
 */
export interface GestureSource {
  start(): Promise<void>;
  stop(): void;
  onGesture(cb: (ev: GestureEvent) => void): () => void;
  readonly snapshot: GestureSnapshot;
}

export function emptySnapshot(): GestureSnapshot {
  return { candidate: 'NONE', confidence: 0, progress: 0, landmarks: null, handSeen: false };
}

/** Shared listener plumbing for all sources. */
export abstract class BaseGestureSource implements GestureSource {
  protected listeners = new Set<(ev: GestureEvent) => void>();
  snapshot: GestureSnapshot = emptySnapshot();

  abstract start(): Promise<void>;
  abstract stop(): void;

  onGesture(cb: (ev: GestureEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  protected fire(ev: GestureEvent): void {
    for (const cb of this.listeners) cb(ev);
  }
}

/** Debug / assistive input: sigils fired directly, no camera (§12 보조 입력). */
export class ButtonGestureSource extends BaseGestureSource {
  async start(): Promise<void> {}
  stop(): void {}

  press(sigil: Exclude<Sigil, 'NONE'>, now = performance.now()): void {
    this.fire({ sigil, confidence: 1, confirmLatencyMs: 0, at: now });
  }
}
