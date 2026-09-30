/**
 * Video frame sampling and scene detection engine.
 */

import {
  calculateHistogram,
  compareHistograms,
  detectScenesFromScores,
  type SceneDetectionOptions,
  type SceneInterval,
} from '../core/scene';
import type { MediaAsset } from '../core/types';

export interface SceneDetectionProgress {
  stage: string;
  percent: number;
}

/**
 * Scan video frames of an asset and detect shot boundaries with thumbnails.
 */
export async function detectScenesInAsset(
  asset: MediaAsset,
  options?: SceneDetectionOptions,
  onProgress?: (progress: SceneDetectionProgress) => void,
): Promise<SceneInterval[]> {
  if (asset.kind !== 'video' || !asset.url) {
    return [];
  }

  onProgress?.({ stage: 'Loading video for scene analysis…', percent: 10 });

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.src = asset.url;
  video.muted = true;
  video.playsInline = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video metadata.'));
  });

  const duration = video.duration || asset.duration;
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const canvas = document.createElement('canvas');
  // Small analysis resolution for speed (160x90 is ample for histogram analysis)
  canvas.width = 160;
  canvas.height = 90;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  // Sample every ~0.25 seconds or 4 frames per second
  const sampleInterval = 0.25;
  const totalSamples = Math.floor(duration / sampleInterval);
  const scores: { timeSec: number; frame: number; score: number }[] = [];

  let prevHistogram: Float32Array | null = null;

  for (let i = 0; i < totalSamples; i++) {
    const timeSec = i * sampleInterval;
    video.currentTime = timeSec;

    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hist = calculateHistogram(imgData.data);

    if (prevHistogram) {
      const score = compareHistograms(prevHistogram, hist);
      scores.push({ timeSec, frame: Math.round(timeSec * 30), score });
    }
    prevHistogram = hist;

    const percent = 10 + Math.round((i / totalSamples) * 75);
    onProgress?.({
      stage: `Analyzing video frames (${Math.round((i / totalSamples) * 100)}%)…`,
      percent,
    });
  }

  onProgress?.({ stage: 'Grouping scenes & generating thumbnails…', percent: 90 });
  const scenes = detectScenesFromScores(scores, duration, 30, options);

  // Capture thumbnail for each scene
  for (const scene of scenes) {
    video.currentTime = scene.startSec + 0.1;
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    scene.thumbnail = canvas.toDataURL('image/jpeg', 0.6);
  }

  onProgress?.({ stage: 'Done', percent: 100 });
  return scenes;
}
