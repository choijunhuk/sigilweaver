import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { packLandmarks, type Recording, type RecordedFrame } from '../../src/gesture/recording';
import type { Sigil } from '../../src/gesture/types';
import { Rng } from '../../src/core/rng';

/**
 * Geometric synthetic hand: wrist at bottom, fingers pointing up in image
 * space (y decreases upward). Only joints consumed by extractFeatures need to
 * be exact; the rest are interpolated. Scale unit = |wrist -> middle MCP|.
 */
const SCALE = 0.25; // image-space hand scale
const WRIST = { x: 0.5, y: 0.8 };

// finger base x offsets (in scale units), roughly anatomical, thumb leftmost
const FINGER_X = [-0.55, -0.25, 0, 0.22, 0.42];
const SEG = 0.45; // finger segment length in scale units

function fingerChain(fx: number, curled: boolean): { mcp: Pt; pip: Pt; tip: Pt } {
  const mcp = { x: WRIST.x + fx * SCALE, y: WRIST.y - 1.0 * SCALE };
  const pip = { x: mcp.x, y: mcp.y - SEG * SCALE };
  // straight: keep going up (collinear, 180deg). curled: fold tip back down past pip.
  const tip = curled
    ? { x: pip.x + 0.1 * SCALE, y: pip.y + SEG * 0.9 * SCALE }
    : { x: pip.x, y: pip.y - SEG * SCALE };
  return { mcp, pip, tip };
}

interface Pt {
  x: number;
  y: number;
}

export interface PoseSpec {
  /** per-finger curled flags [thumb, index, middle, ring, pinky] */
  curled: [boolean, boolean, boolean, boolean, boolean];
  /** move thumb tip onto index tip (FOCUS) */
  pinch?: boolean;
  /** spread index/middle tips apart (ARC) vs parallel */
  vSpread?: boolean;
}

export const POSES: Record<Exclude<Sigil, 'NONE'>, PoseSpec> = {
  BOLT: { curled: [true, false, true, true, true] },
  WARD: { curled: [true, true, true, true, true] },
  PULSE: { curled: [false, false, false, false, false] },
  ARC: { curled: [true, false, false, true, true], vSpread: true },
  FOCUS: { curled: [false, false, false, false, false], pinch: true },
};

export function buildLandmarks(spec: PoseSpec, jitter = 0, rng?: Rng): NormalizedLandmark[] {
  const lm: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({
    x: 0, y: 0, z: 0, visibility: 1,
  }));
  const set = (i: number, p: Pt) => {
    const jx = jitter && rng ? (rng.next() - 0.5) * jitter * SCALE : 0;
    const jy = jitter && rng ? (rng.next() - 0.5) * jitter * SCALE : 0;
    lm[i].x = p.x + jx;
    lm[i].y = p.y + jy;
  };

  set(0, WRIST);
  // fingers: [MCP, PIP, TIP] landmark ids per finger; thumb uses 2/3/4
  const ids: [number, number, number][] = [
    [2, 3, 4], [5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20],
  ];
  const chains = spec.curled.map((c, f) => fingerChain(FINGER_X[f], c));

  if (spec.vSpread) {
    // rotate whole fingers from MCP so they stay straight while spreading
    chains[1].pip.x -= 0.125 * SCALE;
    chains[1].tip.x -= 0.25 * SCALE;
    chains[2].pip.x += 0.125 * SCALE;
    chains[2].tip.x += 0.25 * SCALE;
  }

  for (let f = 0; f < 5; f++) {
    const [mcpId, pipId, tipId] = ids[f];
    set(mcpId, chains[f].mcp);
    set(pipId, chains[f].pip);
    set(tipId, chains[f].tip);
  }
  // interpolated in-between joints (DIP etc.) — not used by features, keep sane
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  set(1, mid(WRIST, chains[0].mcp));
  set(7, mid(chains[1].pip, chains[1].tip));
  set(11, mid(chains[2].pip, chains[2].tip));
  set(15, mid(chains[3].pip, chains[3].tip));
  set(19, mid(chains[4].pip, chains[4].tip));

  if (spec.pinch) {
    // thumb tip touches index tip
    lm[4].x = lm[8].x + 0.02;
    lm[4].y = lm[8].y + 0.02;
  }
  return lm;
}

/** Hold a pose for `frames` frames at ~24fps, with optional jitter noise. */
export function makeRecording(
  sigil: Exclude<Sigil, 'NONE'>,
  frames: number,
  opts: { jitter?: number; seed?: number; handedness?: 'Left' | 'Right' } = {},
): Recording {
  const rng = new Rng(opts.seed ?? 1);
  const out: RecordedFrame[] = [];
  for (let i = 0; i < frames; i++) {
    out.push({
      t: i * (1000 / 24),
      handedness: opts.handedness ?? 'Right',
      lm: packLandmarks(buildLandmarks(POSES[sigil], opts.jitter ?? 0, rng)),
    });
  }
  return { version: 1, label: sigil, frames: out };
}
