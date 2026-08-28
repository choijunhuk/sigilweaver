import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],       // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],       // index
  [5, 9], [9, 10], [10, 11], [11, 12],  // middle
  [9, 13], [13, 14], [14, 15], [15, 16],// ring
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17], // pinky + palm edge
];

/** Draw mirrored landmark skeleton (selfie view) onto full-canvas space. */
export function drawHand(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[] | undefined,
  w: number,
  h: number,
): void {
  ctx.clearRect(0, 0, w, h);
  if (!landmarks) return;

  const px = (p: NormalizedLandmark) => ((1 - p.x) * w); // mirror for selfie view
  const py = (p: NormalizedLandmark) => p.y * h;

  ctx.strokeStyle = '#7c6cff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [a, b] of CONNECTIONS) {
    ctx.moveTo(px(landmarks[a]), py(landmarks[a]));
    ctx.lineTo(px(landmarks[b]), py(landmarks[b]));
  }
  ctx.stroke();

  ctx.fillStyle = '#e0def4';
  for (const p of landmarks) {
    ctx.beginPath();
    ctx.arc(px(p), py(p), 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Stabilization progress ring around the wrist. */
export function drawProgressRing(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[] | undefined,
  progress: number,
  w: number,
  h: number,
): void {
  if (!landmarks || progress <= 0) return;
  const x = (1 - landmarks[0].x) * w;
  const y = landmarks[0].y * h;
  ctx.strokeStyle = '#f5c26b';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(x, y, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.stroke();
}
