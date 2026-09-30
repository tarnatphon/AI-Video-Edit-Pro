import { detectBeatsFromSamples, type BeatDetectionOptions, type BeatDetectionResult } from '../core/beats';

// Simple in-memory cache for audio beat analysis
const beatCache = new Map<string, BeatDetectionResult>();

/**
 * Decode audio from an asset URL or Blob, and run beat detection.
 */
export async function analyzeBeatsFromAudioUrl(
  audioUrl: string,
  options?: BeatDetectionOptions,
): Promise<BeatDetectionResult> {
  const cacheKey = `${audioUrl}_${options?.sensitivity ?? 0.5}_${options?.fps ?? 30}`;
  const cached = beatCache.get(cacheKey);
  if (cached) return cached;

  const response = await fetch(audioUrl);
  const arrayBuffer = await response.arrayBuffer();

  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
    sampleRate: 44100,
  });

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channelData = audioBuffer.getChannelData(0);

    const result = detectBeatsFromSamples(channelData, audioBuffer.sampleRate, options);
    beatCache.set(cacheKey, result);
    return result;
  } finally {
    if (audioCtx.state !== 'closed') {
      audioCtx.close().catch(() => {});
    }
  }
}
