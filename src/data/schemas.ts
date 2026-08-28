import { z } from 'zod';

/** Gesture recognition thresholds (§15). Loaded from data/config/gesture.json. */
export const GestureConfigSchema = z.object({
  curlBent: z.number().min(0).max(1),
  curlStraight: z.number().min(0).max(1),
  pinchMax: z.number().positive(),
  vSpreadMin: z.number().positive(),
  stableFrames: z.number().int().min(1).max(10),
  minConfidence: z.number().min(0).max(1),
  releaseConfidence: z.number().min(0).max(1),
  debounceMs: z.number().min(0),
});

export type GestureConfigData = z.infer<typeof GestureConfigSchema>;
