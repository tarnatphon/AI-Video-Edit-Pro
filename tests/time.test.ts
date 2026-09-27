import { describe, expect, it } from 'vitest';
import { clamp, formatBytes, formatDuration, formatRulerLabel, formatTimecode, framesToSeconds, secondsToFrames } from '../src/core/time';

describe('time utilities', () => {
  it('converts between seconds and frames with rounding', () => {
    expect(secondsToFrames(1, 30)).toBe(30);
    expect(secondsToFrames(0.5, 25)).toBe(13);
    expect(secondsToFrames(Number.POSITIVE_INFINITY, 30)).toBe(0);
    expect(framesToSeconds(45, 30)).toBe(1.5);
  });

  it('formats SMPTE timecode', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00:00');
    expect(formatTimecode(29, 30)).toBe('00:00:00:29');
    expect(formatTimecode(30, 30)).toBe('00:00:01:00');
    expect(formatTimecode(3661 * 24 + 5, 24)).toBe('01:01:01:05');
    expect(formatTimecode(-10, 30)).toBe('00:00:00:00');
    expect(formatTimecode(59.9, 30)).toBe('00:00:01:29');
  });

  it('formats durations and ruler labels', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3723)).toBe('1:02:03');
    expect(formatDuration(Number.NaN)).toBe('--:--');
    expect(formatRulerLabel(90)).toBe('1:30');
    expect(formatRulerLabel(0.5)).toBe('0:00.5');
  });

  it('formats bytes and clamps', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(50 * 1024 * 1024)).toBe('50 MB');
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});
