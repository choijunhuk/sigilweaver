export type Sigil = 'BOLT' | 'WARD' | 'PULSE' | 'ARC' | 'FOCUS' | 'NONE';

export interface Vec3 { x: number; y: number; z: number; }

/** Normalized landmarks (wrist origin, scale-normalized, right-hand mirrored). */
export interface HandFeatures {
  /** Per-finger curl 0 (straight) .. 1 (fully curled): [thumb, index, middle, ring, pinky] */
  curls: [number, number, number, number, number];
  /** thumb tip <-> index tip distance, scale-normalized */
  pinchDist: number;
  /** index tip <-> middle tip distance, scale-normalized */
  vSpread: number;
}

export interface Classification {
  sigil: Sigil;
  /** rule margin, 0..1-ish; higher = more confident */
  confidence: number;
}

export interface GestureConfig {
  curlBent: number;        // curl above this = finger bent
  curlStraight: number;    // curl below this = finger straight
  pinchMax: number;        // pinch dist below this = pinching
  vSpreadMin: number;      // index-middle spread above this = V
  stableFrames: number;    // consecutive frames to confirm
  minConfidence: number;   // confidence to count a frame
  releaseConfidence: number; // hysteresis: below this = candidate lost
  debounceMs: number;      // min gap between same-sigil re-fires
}

export const DEFAULT_CONFIG: GestureConfig = {
  curlBent: 0.6,
  curlStraight: 0.25,
  pinchMax: 0.25,
  vSpreadMin: 0.35,
  stableFrames: 4,
  minConfidence: 0.15,
  releaseConfidence: 0.05,
  debounceMs: 300,
};
