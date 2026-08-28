import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { HandFeatures, Vec3 } from './types';

// Landmark indices (MediaPipe hand model)
const WRIST = 0;
const MIDDLE_MCP = 9;
// [MCP, PIP, TIP] per finger; thumb uses [MCP(2), IP(3), TIP(4)]
const FINGER_JOINTS: [number, number, number][] = [
  [2, 3, 4],    // thumb
  [5, 6, 8],    // index
  [9, 10, 12],  // middle
  [13, 14, 16], // ring
  [17, 18, 20], // pinky
];
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_TIP = 12;

// Reused buffer — no per-frame allocation (§15 GC rule)
const norm: Vec3[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
const featuresBuf: HandFeatures = { curls: [0, 0, 0, 0, 0], pinchDist: 0, vSpread: 0 };

/**
 * Normalize: wrist origin, scale by |wrist->middle MCP|, mirror x when Left hand
 * so left/right hands share one code path (§15).
 */
export function extractFeatures(
  landmarks: NormalizedLandmark[],
  handedness: 'Left' | 'Right',
): HandFeatures {
  const w = landmarks[WRIST];
  const m = landmarks[MIDDLE_MCP];
  const scale = Math.hypot(m.x - w.x, m.y - w.y, m.z - w.z) || 1e-6;
  const mirror = handedness === 'Left' ? -1 : 1;

  for (let i = 0; i < 21; i++) {
    const p = landmarks[i];
    norm[i].x = ((p.x - w.x) / scale) * mirror;
    norm[i].y = (p.y - w.y) / scale;
    norm[i].z = (p.z - w.z) / scale;
  }

  for (let f = 0; f < 5; f++) {
    const [a, b, c] = FINGER_JOINTS[f];
    featuresBuf.curls[f] = curlFromAngle(norm[a], norm[b], norm[c]);
  }
  featuresBuf.pinchDist = dist(norm[THUMB_TIP], norm[INDEX_TIP]);
  featuresBuf.vSpread = dist(norm[INDEX_TIP], norm[MIDDLE_TIP]);
  return featuresBuf;
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Angle at joint b (a-b-c). 180deg straight -> curl 0, tightly bent -> curl 1. */
function curlFromAngle(a: Vec3, b: Vec3, c: Vec3): number {
  const abx = a.x - b.x, aby = a.y - b.y, abz = a.z - b.z;
  const cbx = c.x - b.x, cby = c.y - b.y, cbz = c.z - b.z;
  const dot = abx * cbx + aby * cby + abz * cbz;
  const mag = Math.hypot(abx, aby, abz) * Math.hypot(cbx, cby, cbz) || 1e-6;
  const angle = Math.acos(Math.min(1, Math.max(-1, dot / mag))); // rad, PI = straight
  const deg = (angle * 180) / Math.PI;
  // 180deg -> 0, 50deg -> 1
  return Math.min(1, Math.max(0, (180 - deg) / 130));
}
