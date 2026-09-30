/**
 * Core silence detection algorithms, data structures, and auto-noise-floor estimator.
 */

export interface SilenceInterval {
  start: number; // in seconds
  end: number;   // in seconds
  duration: number;
}

export interface SpeechInterval {
  start: number; // in seconds
  end: number;   // in seconds
  duration: number;
}

export interface SilenceDetectionOptions {
  /** Decibel threshold below which audio is considered silence. Default: -35 dB. Range: [-60, -10]. */
  thresholdDb?: number | undefined;
  /** Minimum length of silence (in seconds) to be considered an actual pause. Default: 0.4s. */
  minSilenceDuration?: number | undefined;
  /** Minimum length of speech (in seconds) to keep. Default: 0.15s. */
  minSpeechDuration?: number | undefined;
  /** Margin (in seconds) to expand around speech intervals to avoid cutting off words. Default: 0.08s. */
  padding?: number | undefined;
  /** Window size (in seconds) for RMS calculation. Default: 0.02s (20ms). */
  windowSize?: number | undefined;
}

export interface SilenceAnalysisResult {
  silenceIntervals: SilenceInterval[];
  speechIntervals: SpeechInterval[];
  totalDuration: number;
  silenceDuration: number;
  speechDuration: number;
  savedPercent: number;
}

export const DEFAULT_SILENCE_OPTIONS = {
  thresholdDb: -35,
  minSilenceDuration: 0.4,
  minSpeechDuration: 0.15,
  padding: 0.08,
  windowSize: 0.02,
} as const;

/**
 * Convert linear amplitude in [0, 1] to decibels (dB).
 * 0 dB is max volume, silence approaches -infinity (clamped to -100 dB).
 */
export function amplitudeToDb(amplitude: number): number {
  if (amplitude <= 1e-5) return -100;
  return 20 * Math.log10(amplitude);
}

/**
 * Convert decibels (dB) to linear amplitude in [0, 1].
 */
export function dbToAmplitude(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Calculate Root Mean Square (RMS) energy of an audio buffer slice.
 */
export function calculateRms(samples: Float32Array, start: number, end: number): number {
  const length = Math.max(1, end - start);
  let sum = 0;
  for (let i = start; i < end; i++) {
    const val = samples[i] ?? 0;
    sum += val * val;
  }
  return Math.sqrt(sum / length);
}

/**
 * Automatically estimate the background noise floor and recommend the optimal silence threshold.
 */
export function estimateNoiseFloor(
  samples: Float32Array,
  sampleRate: number,
  windowSize = 0.02,
): { recommendedThresholdDb: number; noiseFloorDb: number; speechPeakDb: number } {
  const totalSamples = samples.length;
  if (totalSamples === 0 || sampleRate <= 0) {
    return { recommendedThresholdDb: -35, noiseFloorDb: -60, speechPeakDb: -6 };
  }

  const windowSamples = Math.max(1, Math.round(windowSize * sampleRate));
  const numWindows = Math.floor(totalSamples / windowSamples);
  const dbValues: number[] = [];

  for (let w = 0; w < numWindows; w++) {
    const start = w * windowSamples;
    const end = Math.min(totalSamples, start + windowSamples);
    const rms = calculateRms(samples, start, end);
    dbValues.push(amplitudeToDb(rms));
  }

  if (dbValues.length === 0) {
    return { recommendedThresholdDb: -35, noiseFloorDb: -60, speechPeakDb: -6 };
  }

  // Sort dB values to find percentiles
  dbValues.sort((a, b) => a - b);

  // 15th percentile ~ background noise floor
  const noiseIdx = Math.floor(dbValues.length * 0.15);
  const noiseFloorDb = (dbValues[noiseIdx] !== undefined ? dbValues[noiseIdx] : -60) as number;
  // 90th percentile ~ speech volume
  const speechIdx = Math.floor(dbValues.length * 0.9);
  const speechPeakDb = (dbValues[speechIdx] !== undefined ? dbValues[speechIdx] : -12) as number;

  // Recommended threshold sits between noise floor and active speech
  let recommended = noiseFloorDb + (speechPeakDb - noiseFloorDb) * 0.4;
  recommended = Math.max(-55, Math.min(-18, Math.round(recommended)));

  return {
    recommendedThresholdDb: recommended,
    noiseFloorDb: Math.round(noiseFloorDb),
    speechPeakDb: Math.round(speechPeakDb),
  };
}

/**
 * Pure function: Detect silence and speech intervals from mono Float32Array audio samples.
 */
export function detectSilenceFromSamples(
  samples: Float32Array,
  sampleRate: number,
  options?: SilenceDetectionOptions,
): SilenceAnalysisResult {
  const thresholdDb: number = options?.thresholdDb !== undefined ? options.thresholdDb : DEFAULT_SILENCE_OPTIONS.thresholdDb;
  const minSilenceDuration: number = options?.minSilenceDuration !== undefined ? options.minSilenceDuration : DEFAULT_SILENCE_OPTIONS.minSilenceDuration;
  const minSpeechDuration: number = options?.minSpeechDuration !== undefined ? options.minSpeechDuration : DEFAULT_SILENCE_OPTIONS.minSpeechDuration;
  const padding: number = options?.padding !== undefined ? options.padding : DEFAULT_SILENCE_OPTIONS.padding;
  const windowSize: number = options?.windowSize !== undefined ? options.windowSize : DEFAULT_SILENCE_OPTIONS.windowSize;

  const totalSamples = samples.length;
  const totalDuration = sampleRate > 0 ? totalSamples / sampleRate : 0;

  if (totalSamples === 0 || totalDuration <= 0) {
    return {
      silenceIntervals: [],
      speechIntervals: [],
      totalDuration: 0,
      silenceDuration: 0,
      speechDuration: 0,
      savedPercent: 0,
    };
  }

  const windowSamples = Math.max(1, Math.round(windowSize * sampleRate));
  const numWindows = Math.ceil(totalSamples / windowSamples);
  const isSilentWindow = new Uint8Array(numWindows);

  // Compute energy for each window
  for (let w = 0; w < numWindows; w++) {
    const startSample = w * windowSamples;
    const endSample = Math.min(totalSamples, startSample + windowSamples);
    const rms = calculateRms(samples, startSample, endSample);
    const db = amplitudeToDb(rms);
    isSilentWindow[w] = db < thresholdDb ? 1 : 0;
  }

  // Group contiguous silent windows into raw intervals
  const rawSilences: { startSec: number; endSec: number }[] = [];
  let inSilence = false;
  let silenceStartSec = 0;

  for (let w = 0; w < numWindows; w++) {
    const timeSec = (w * windowSamples) / sampleRate;
    if (isSilentWindow[w] === 1) {
      if (!inSilence) {
        inSilence = true;
        silenceStartSec = timeSec;
      }
    } else {
      if (inSilence) {
        inSilence = false;
        rawSilences.push({ startSec: silenceStartSec, endSec: timeSec });
      }
    }
  }
  if (inSilence) {
    rawSilences.push({ startSec: silenceStartSec, endSec: totalDuration });
  }

  // Filter out silences shorter than minSilenceDuration
  const significantSilences = rawSilences.filter(
    (s) => s.endSec - s.startSec >= minSilenceDuration,
  );

  // Compute speech intervals (the complements of significant silences)
  let rawSpeech: { startSec: number; endSec: number }[] = [];
  let lastEnd = 0;

  for (const silence of significantSilences) {
    if (silence.startSec > lastEnd) {
      rawSpeech.push({ startSec: lastEnd, endSec: silence.startSec });
    }
    lastEnd = silence.endSec;
  }
  if (lastEnd < totalDuration) {
    rawSpeech.push({ startSec: lastEnd, endSec: totalDuration });
  }

  // Apply padding around speech intervals (buffer before/after)
  const paddedSpeech: { startSec: number; endSec: number }[] = rawSpeech.map((s) => ({
    startSec: Math.max(0, s.startSec - padding),
    endSec: Math.min(totalDuration, s.endSec + padding),
  }));

  // Merge any overlapping speech intervals created by padding
  const mergedSpeech: { startSec: number; endSec: number }[] = [];
  for (const seg of paddedSpeech) {
    const last = mergedSpeech[mergedSpeech.length - 1];
    if (last && seg.startSec <= last.endSec) {
      last.endSec = Math.max(last.endSec, seg.endSec);
    } else {
      mergedSpeech.push({ ...seg });
    }
  }

  // Filter out speech intervals that are too short
  const finalSpeech = mergedSpeech.filter(
    (s) => s.endSec - s.startSec >= minSpeechDuration,
  );

  // Re-derive final silence intervals from final speech
  const finalSilences: { startSec: number; endSec: number }[] = [];
  let speechEnd = 0;

  for (const sp of finalSpeech) {
    if (sp.startSec > speechEnd) {
      finalSilences.push({ startSec: speechEnd, endSec: sp.startSec });
    }
    speechEnd = sp.endSec;
  }
  if (speechEnd < totalDuration) {
    finalSilences.push({ startSec: speechEnd, endSec: totalDuration });
  }

  const speechIntervals: SpeechInterval[] = finalSpeech.map((s) => ({
    start: Number(s.startSec.toFixed(3)),
    end: Number(s.endSec.toFixed(3)),
    duration: Number((s.endSec - s.startSec).toFixed(3)),
  }));

  const silenceIntervals: SilenceInterval[] = finalSilences
    .filter((s) => s.endSec - s.startSec > 0.001)
    .map((s) => ({
      start: Number(s.startSec.toFixed(3)),
      end: Number(s.endSec.toFixed(3)),
      duration: Number((s.endSec - s.startSec).toFixed(3)),
    }));

  const silenceDuration = silenceIntervals.reduce((sum, s) => sum + s.duration, 0);
  const speechDuration = speechIntervals.reduce((sum, s) => sum + s.duration, 0);
  const savedPercent = totalDuration > 0 ? (silenceDuration / totalDuration) * 100 : 0;

  return {
    silenceIntervals,
    speechIntervals,
    totalDuration: Number(totalDuration.toFixed(3)),
    silenceDuration: Number(silenceDuration.toFixed(3)),
    speechDuration: Number(speechDuration.toFixed(3)),
    savedPercent: Number(savedPercent.toFixed(1)),
  };
}
