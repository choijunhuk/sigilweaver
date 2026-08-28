import type { Classification, GestureConfig, HandFeatures, Sigil } from './types';

const result: Classification = { sigil: 'NONE', confidence: 0 };

/**
 * Rule-based classification (§15). Each rule returns a margin:
 * min over its constraints of how far past the threshold we are (normalized).
 * Margin <= 0 means the rule fails. Best positive margin wins.
 */
export function classify(f: HandFeatures, cfg: GestureConfig): Classification {
  const [thumb, index, middle, ring, pinky] = f.curls;

  // Ward (fist): all fingers bent. Thumb wraps loosely -> weight it half.
  const fist = min5(
    bentM(thumb, cfg) * 2, // thumb rarely fully curls; be lenient
    bentM(index, cfg), bentM(middle, cfg), bentM(ring, cfg), bentM(pinky, cfg),
  );

  // Pulse (palm): all fingers straight.
  const palm = min5(
    straightM(thumb, cfg) * 2,
    straightM(index, cfg), straightM(middle, cfg), straightM(ring, cfg), straightM(pinky, cfg),
  );

  // Bolt (point): index straight, middle/ring/pinky bent.
  const point = Math.min(
    straightM(index, cfg),
    bentM(middle, cfg), bentM(ring, cfg), bentM(pinky, cfg),
  );

  // Arc (V): index+middle straight, ring+pinky bent, tips spread apart.
  const v = Math.min(
    straightM(index, cfg), straightM(middle, cfg),
    bentM(ring, cfg), bentM(pinky, cfg),
    (f.vSpread - cfg.vSpreadMin) / cfg.vSpreadMin,
  );

  // Focus (pinch): thumb-index tips together; middle/ring/pinky free.
  // Guard: exclude fist look-alikes by requiring index not fully curled at PIP.
  const pinch = Math.min(
    (cfg.pinchMax - f.pinchDist) / cfg.pinchMax,
    (0.9 - index) / 0.3,
  );

  let best: Sigil = 'NONE';
  let bestM = 0;
  const entries: [Sigil, number][] = [
    ['WARD', fist], ['PULSE', palm], ['BOLT', point], ['ARC', v], ['FOCUS', pinch],
  ];
  for (const [s, m] of entries) {
    if (m > bestM) { best = s; bestM = m; }
  }
  result.sigil = best;
  result.confidence = Math.min(1, bestM);
  return result;
}

function bentM(curl: number, cfg: GestureConfig): number {
  return (curl - cfg.curlBent) / (1 - cfg.curlBent);
}
function straightM(curl: number, cfg: GestureConfig): number {
  return (cfg.curlStraight - curl) / cfg.curlStraight;
}
function min5(a: number, b: number, c: number, d: number, e: number): number {
  return Math.min(a, b, c, d, e);
}
