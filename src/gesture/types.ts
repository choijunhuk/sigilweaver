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

// Thresholds live in data/config/gesture.json, validated by GestureConfigSchema.
export type { GestureConfigData as GestureConfig } from '../data/schemas';
