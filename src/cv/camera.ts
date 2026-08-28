/** Front camera stream at full sensor FOV. Low resolution requests make many
 * cameras crop (digital zoom) instead of scaling — the hand then only fits at
 * arm's length. Request 720p + resizeMode 'none' to keep the wide view;
 * MediaPipe downscales internally for inference so the cost stays the same. */
export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
      resizeMode: { ideal: 'none' },
    } as MediaTrackConstraints,
    audio: false,
  });
  video.srcObject = stream;
  await new Promise<void>((resolve) => {
    video.onloadedmetadata = () => resolve();
  });
  await video.play();
}

export function stopCamera(video: HTMLVideoElement): void {
  const stream = video.srcObject as MediaStream | null;
  stream?.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
}
