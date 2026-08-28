import type { Classification, GestureConfig, Sigil } from './types';

export interface GestureEvent {
  sigil: Sigil;
  confidence: number;
  /** ms from first candidate frame to confirmation — spike latency metric */
  confirmLatencyMs: number;
  at: number;
}

/**
 * Temporal FSM (§15): a candidate must hold for `stableFrames` consecutive
 * frames at confidence >= minConfidence to confirm. Release uses hysteresis
 * (releaseConfidence). Same sigil re-fires only after debounceMs.
 */
export class TemporalFilter {
  private candidate: Sigil = 'NONE';
  private streak = 0;
  private streakStartAt = 0;
  private confirmed: Sigil = 'NONE';
  private lastFireAt = new Map<Sigil, number>();

  constructor(private cfg: GestureConfig) {}

  /** Feed one classified frame; returns an event when a sigil confirms. */
  update(c: Classification, now: number): GestureEvent | null {
    // Hysteresis: while a sigil is confirmed, keep it held until confidence
    // for that sigil clearly drops (different sigil or below release level).
    if (this.confirmed !== 'NONE') {
      if (c.sigil !== this.confirmed || c.confidence < this.cfg.releaseConfidence) {
        this.confirmed = 'NONE';
      } else {
        return null; // still holding the confirmed pose
      }
    }

    if (c.sigil === 'NONE' || c.confidence < this.cfg.minConfidence) {
      this.candidate = 'NONE';
      this.streak = 0;
      return null;
    }

    if (c.sigil !== this.candidate) {
      this.candidate = c.sigil;
      this.streak = 1;
      this.streakStartAt = now;
      return null;
    }

    this.streak++;
    if (this.streak < this.cfg.stableFrames) return null;

    const last = this.lastFireAt.get(c.sigil) ?? -Infinity;
    if (now - last < this.cfg.debounceMs) return null;

    this.confirmed = c.sigil;
    this.lastFireAt.set(c.sigil, now);
    this.candidate = 'NONE';
    this.streak = 0;
    return {
      sigil: c.sigil,
      confidence: c.confidence,
      confirmLatencyMs: now - this.streakStartAt,
      at: now,
    };
  }

  get progress(): number {
    return this.candidate === 'NONE' ? 0 : this.streak / this.cfg.stableFrames;
  }
  get currentCandidate(): Sigil {
    return this.confirmed !== 'NONE' ? this.confirmed : this.candidate;
  }
}
