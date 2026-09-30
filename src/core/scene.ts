/**
 * AI Video Scene and Shot Detection domain models and algorithms.
 */

export interface SceneCut {
  timeSec: number;
  frame: number;
  score: number;
}

export interface SceneInterval {
  id: string;
  startSec: number;
  endSec: number;
  duration: number;
  startFrame: number;
  endFrame: number;
  thumbnail?: string;
}

export interface SceneDetectionOptions {
  /** Sensitivity threshold for scene change (0.1 = sensitive, 0.5 = moderate, 0.8 = only drastic cuts). Default: 0.35 */
  threshold?: number;
  /** Minimum length of a scene in seconds. Default: 1.0s */
  minSceneDuration?: number;
  /** Maximum number of scenes to detect. Default: 100 */
  maxScenes?: number;
}

export const DEFAULT_SCENE_OPTIONS: Required<SceneDetectionOptions> = {
  threshold: 0.35,
  minSceneDuration: 1.0,
  maxScenes: 100,
};

/**
 * Calculate a 64-bin color histogram (16 bins for R, G, B, Luminance) normalized to [0, 1].
 */
export function calculateHistogram(pixels: Uint8ClampedArray): Float32Array {
  const bins = new Float32Array(64);
  const totalPixels = pixels.length / 4;
  if (totalPixels === 0) return bins;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const lum = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    bins[Math.min(15, Math.floor(r / 16))] += 1;
    bins[16 + Math.min(15, Math.floor(g / 16))] += 1;
    bins[32 + Math.min(15, Math.floor(b / 16))] += 1;
    bins[48 + Math.min(15, Math.floor(lum / 16))] += 1;
  }

  // Normalize
  for (let i = 0; i < 64; i++) {
    bins[i] = bins[i]! / (totalPixels * 4);
  }

  return bins;
}

/**
 * Compare two color histograms using Chi-Square Distance / Manhattan distance in [0, 1].
 * 0 = identical frames, 1 = completely different scenes.
 */
export function compareHistograms(h1: Float32Array, h2: Float32Array): number {
  let diff = 0;
  for (let i = 0; i < 64; i++) {
    const v1 = h1[i] ?? 0;
    const v2 = h2[i] ?? 0;
    diff += Math.abs(v1 - v2);
  }
  return Math.min(1, diff / 2);
}

/**
 * Pure function: Detect scene intervals from sequential frame difference scores.
 */
export function detectScenesFromScores(
  scores: readonly { timeSec: number; frame: number; score: number }[],
  totalDuration: number,
  fps: number,
  options?: SceneDetectionOptions,
): SceneInterval[] {
  const opts = { ...DEFAULT_SCENE_OPTIONS, ...options };
  if (totalDuration <= 0) return [];

  const cutTimes: number[] = [0];

  for (const item of scores) {
    if (item.score >= opts.threshold) {
      const lastCut = cutTimes[cutTimes.length - 1]!;
      if (item.timeSec - lastCut >= opts.minSceneDuration) {
        cutTimes.push(Number(item.timeSec.toFixed(3)));
      }
    }
  }

  if (cutTimes[cutTimes.length - 1]! < totalDuration) {
    cutTimes.push(Number(totalDuration.toFixed(3)));
  }

  const scenes: SceneInterval[] = [];
  for (let i = 0; i < cutTimes.length - 1; i++) {
    const startSec = cutTimes[i]!;
    const endSec = cutTimes[i + 1]!;
    if (endSec - startSec < 0.01) continue;

    const startFrame = Math.round(startSec * fps);
    const endFrame = Math.round(endSec * fps);

    scenes.push({
      id: `scene-${i + 1}`,
      startSec,
      endSec,
      duration: Number((endSec - startSec).toFixed(3)),
      startFrame,
      endFrame,
    });
  }

  return scenes.slice(0, opts.maxScenes);
}
