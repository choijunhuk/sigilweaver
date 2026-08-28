import { z } from 'zod';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

/** Recorded landmark stream — fixture format for ReplayGestureSource (§17). */
export const RecordingSchema = z.object({
  version: z.literal(1),
  /** expected sigil label, e.g. "BOLT"; "MIXED" for free-form sessions */
  label: z.string(),
  frames: z.array(
    z.object({
      /** ms since recording start */
      t: z.number(),
      handedness: z.enum(['Left', 'Right']),
      /** 21 landmarks flattened [x0,y0,z0, x1,y1,z1, ...] */
      lm: z.array(z.number()).length(63),
    }),
  ),
});

export type Recording = z.infer<typeof RecordingSchema>;
export type RecordedFrame = Recording['frames'][number];

export function packLandmarks(landmarks: NormalizedLandmark[]): number[] {
  const flat: number[] = new Array(63);
  for (let i = 0; i < 21; i++) {
    flat[i * 3] = landmarks[i].x;
    flat[i * 3 + 1] = landmarks[i].y;
    flat[i * 3 + 2] = landmarks[i].z;
  }
  return flat;
}

export function unpackLandmarks(lm: number[]): NormalizedLandmark[] {
  const out: NormalizedLandmark[] = new Array(21);
  for (let i = 0; i < 21; i++) {
    out[i] = { x: lm[i * 3], y: lm[i * 3 + 1], z: lm[i * 3 + 2], visibility: 1 };
  }
  return out;
}
