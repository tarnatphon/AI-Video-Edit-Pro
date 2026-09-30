import type { Frames, Project } from './types';

export interface BeatMarker {
  timeSec: number;
  frame: Frames;
  energy: number; // 0 to 1
  isDownbeat?: boolean;
}

export interface BeatDetectionResult {
  bpm: number;
  beats: BeatMarker[];
  totalBeats: number;
  durationSec: number;
}

export interface BeatDetectionOptions {
  /** Sensitivity for peak detection (0.1 to 1.0). Default: 0.5 */
  sensitivity?: number;
  /** Minimum interval between consecutive beats in seconds. Default: 0.25s (max 240 BPM) */
  minInterval?: number;
  /** Frames per second of the project */
  fps?: number;
}

/**
 * Pure function: Detect musical beats and onsets from audio samples using Short-Time Energy Flux.
 */
export function detectBeatsFromSamples(
  samples: Float32Array,
  sampleRate: number,
  options?: BeatDetectionOptions,
): BeatDetectionResult {
  const sensitivity = options?.sensitivity ?? 0.5;
  const minInterval = options?.minInterval ?? 0.25;
  const fps = options?.fps ?? 30;

  const totalSamples = samples.length;
  const durationSec = sampleRate > 0 ? totalSamples / sampleRate : 0;

  if (totalSamples === 0 || durationSec <= 0) {
    return { bpm: 120, beats: [], totalBeats: 0, durationSec: 0 };
  }

  // Energy window: ~1024 samples (~23ms at 44.1kHz)
  const windowSize = 1024;
  const hopSize = 512;
  const numHops = Math.floor((totalSamples - windowSize) / hopSize);

  if (numHops <= 0) {
    return { bpm: 120, beats: [], totalBeats: 0, durationSec };
  }

  // 1. Calculate instant energy per hop
  const energies = new Float32Array(numHops);
  let maxEnergy = 1e-6;

  for (let i = 0; i < numHops; i++) {
    const start = i * hopSize;
    let sum = 0;
    for (let j = 0; j < windowSize; j++) {
      const val = samples[start + j] ?? 0;
      sum += val * val;
    }
    const energy = Math.sqrt(sum / windowSize);
    energies[i] = energy;
    if (energy > maxEnergy) maxEnergy = energy;
  }

  // Normalize energies
  for (let i = 0; i < numHops; i++) {
    energies[i] = (energies[i] ?? 0) / maxEnergy;
  }

  // 2. Compute Spectral / Energy Flux (positive derivative)
  const flux = new Float32Array(numHops);
  for (let i = 1; i < numHops; i++) {
    const diff = (energies[i] ?? 0) - (energies[i - 1] ?? 0);
    flux[i] = diff > 0 ? diff : 0;
  }

  // 3. Peak picking with moving average threshold
  const movingAvgRadius = 15;
  const thresholdMultiplier = 1.2 + (1 - sensitivity) * 1.5;
  const minHopDistance = Math.floor((minInterval * sampleRate) / hopSize);

  const rawBeats: { hop: number; timeSec: number; energy: number }[] = [];
  let lastBeatHop = -minHopDistance;

  for (let i = movingAvgRadius; i < numHops - movingAvgRadius; i++) {
    let localAvg = 0;
    for (let j = i - movingAvgRadius; j <= i + movingAvgRadius; j++) {
      localAvg += flux[j] ?? 0;
    }
    localAvg /= movingAvgRadius * 2 + 1;

    const currentFlux = flux[i] ?? 0;
    const isPeak =
      currentFlux > (flux[i - 1] ?? 0) &&
      currentFlux > (flux[i + 1] ?? 0) &&
      currentFlux > localAvg * thresholdMultiplier;

    if (isPeak && i - lastBeatHop >= minHopDistance) {
      const timeSec = (i * hopSize) / sampleRate;
      const energy = energies[i] ?? 0.5;
      rawBeats.push({ hop: i, timeSec, energy });
      lastBeatHop = i;
    }
  }

  // 4. Estimate BPM from median beat interval
  let bpm = 120;
  if (rawBeats.length >= 2) {
    const intervals: number[] = [];
    for (let k = 1; k < rawBeats.length; k++) {
      intervals.push(rawBeats[k]!.timeSec - rawBeats[k - 1]!.timeSec);
    }
    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)] ?? 0.5;
    if (medianInterval > 0) {
      bpm = Math.round(60 / medianInterval);
      // Clamp to realistic musical BPM range
      while (bpm < 70) bpm *= 2;
      while (bpm > 180) bpm = Math.round(bpm / 2);
    }
  }

  const beats: BeatMarker[] = rawBeats.map((b, idx) => ({
    timeSec: b.timeSec,
    frame: Math.round(b.timeSec * fps),
    energy: Math.min(1, Math.max(0, b.energy)),
    isDownbeat: idx % 4 === 0,
  }));

  return {
    bpm,
    beats,
    totalBeats: beats.length,
    durationSec,
  };
}

/**
 * Pure function: Automatically cuts clips on a video track to match musical beat markers.
 */
export function cutTrackToBeats(
  project: Project,
  videoTrackId: string,
  beatFrames: Frames[],
): Project {
  if (beatFrames.length === 0) return project;

  let currentProject = project;
  const sortedBeats = [...beatFrames].sort((a, b) => a - b);

  for (const beatFrame of sortedBeats) {
    const targetClip = currentProject.clips.find(
      (c) => c.trackId === videoTrackId && beatFrame > c.start && beatFrame < c.start + c.duration,
    );

    if (targetClip) {
      const splitOffset = beatFrame - targetClip.start;
      const leftDuration = splitOffset;
      const rightDuration = targetClip.duration - splitOffset;

      if (leftDuration >= 3 && rightDuration >= 3) {
        const leftClip = { ...targetClip, duration: leftDuration };
        const rightClip = {
          ...targetClip,
          id: `clip_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          start: beatFrame,
          duration: rightDuration,
          offset: targetClip.offset + Math.round(leftDuration * targetClip.speed),
        };

        const updatedClips = currentProject.clips
          .filter((c) => c.id !== targetClip.id)
          .concat([leftClip, rightClip]);

        currentProject = {
          ...currentProject,
          clips: updatedClips,
        };
      }
    }
  }

  return currentProject;
}
