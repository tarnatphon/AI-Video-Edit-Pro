/**
 * Engine-level silence detector for MediaAssets and audio buffers.
 */

import {
  detectSilenceFromSamples,
  type SilenceAnalysisResult,
  type SilenceDetectionOptions,
} from '../core/silence';
import type { MediaAsset } from '../core/types';

type OfflineCtor = typeof OfflineAudioContext;

function resolveOfflineContext(): OfflineCtor | null {
  const w = window as Window & { webkitOfflineAudioContext?: OfflineCtor };
  return window.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null;
}

function decodeAudio(ctx: OfflineAudioContext, buffer: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const maybePromise = ctx.decodeAudioData(
      buffer,
      resolve,
      (err) => reject(err ?? new Error('decodeAudioData failed')),
    );
    if (maybePromise && typeof (maybePromise as Promise<AudioBuffer>).catch === 'function') {
      (maybePromise as Promise<AudioBuffer>).catch(() => undefined);
    }
  });
}

/**
 * Mix multiple channels down to a single mono Float32Array.
 */
export function mixToMono(audioBuffer: AudioBuffer): Float32Array {
  const numChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  if (numChannels === 1) {
    return audioBuffer.getChannelData(0);
  }

  const mono = new Float32Array(length);
  for (let c = 0; c < numChannels; c++) {
    const channel = audioBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      mono[i] += channel[i]! / numChannels;
    }
  }
  return mono;
}

/**
 * Cache for silence analysis results keyed by `${assetId}:${optionsHash}`.
 */
const analysisCache = new Map<string, SilenceAnalysisResult>();

/**
 * Analyze an audio/video MediaAsset for silence and speech intervals.
 */
export async function analyzeAssetSilence(
  asset: MediaAsset,
  options?: SilenceDetectionOptions,
): Promise<SilenceAnalysisResult> {
  if (!asset.url) {
    return {
      silenceIntervals: [],
      speechIntervals: [],
      totalDuration: 0,
      silenceDuration: 0,
      speechDuration: 0,
      savedPercent: 0,
    };
  }

  const cacheKey = `${asset.id}:${JSON.stringify(options ?? {})}`;
  const cached = analysisCache.get(cacheKey);
  if (cached) return cached;

  const Ctor = resolveOfflineContext();
  if (!Ctor) {
    throw new Error('Web Audio OfflineAudioContext is not supported on this platform.');
  }

  const response = await fetch(asset.url);
  const arrayBuffer = await response.arrayBuffer();

  const ctx = new Ctor(1, 1, 44_100);
  const audioBuffer = await decodeAudio(ctx, arrayBuffer);
  const monoSamples = mixToMono(audioBuffer);

  const result = detectSilenceFromSamples(monoSamples, audioBuffer.sampleRate, options);
  analysisCache.set(cacheKey, result);
  return result;
}

/**
 * Clear silence cache when assets change.
 */
export function clearSilenceCache(): void {
  analysisCache.clear();
}
