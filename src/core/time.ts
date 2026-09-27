import type { Frames } from './types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Convert seconds to the nearest integer frame count. */
export function secondsToFrames(seconds: number, fps: number): Frames {
  if (!Number.isFinite(seconds)) return 0;
  return Math.round(seconds * fps);
}

export function framesToSeconds(frames: Frames, fps: number): number {
  return frames / fps;
}

/**
 * Format frames as SMPTE-style timecode `HH:MM:SS:FF`.
 * Negative values are clamped to zero; fractional frames are floored.
 */
export function formatTimecode(frames: Frames, fps: number): string {
  const f = Math.max(0, Math.floor(frames));
  const roundedFps = Math.max(1, Math.round(fps));
  const totalSeconds = Math.floor(f / roundedFps);
  const ff = f % roundedFps;
  const hh = Math.floor(totalSeconds / 3600);
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}:${pad2(ff)}`;
}

/** Compact duration for media lists, e.g. `1:05` or `1:02:03`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--';
  const total = Math.round(seconds);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return hh > 0 ? `${hh}:${pad2(mm)}:${pad2(ss)}` : `${mm}:${pad2(ss)}`;
}

/** Format seconds as a short label for timeline rulers, e.g. `0:00`, `1:30`, `1:02:03`, `0:00.5`. */
export function formatRulerLabel(seconds: number): string {
  const whole = Math.floor(seconds);
  const frac = seconds - whole;
  const base = formatDuration(whole);
  if (frac > 0.0001) {
    return `${base}.${Math.round(frac * 10)}`;
  }
  return base;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}
