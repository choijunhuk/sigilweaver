import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';

/** MediaPipe Hand Landmarker wrapper. Assets served from public/ (see scripts/fetch-assets.sh). */
export async function createTracker(): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks('/wasm');
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: '/models/hand_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export type { HandLandmarkerResult };
