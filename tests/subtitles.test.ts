import { describe, expect, it } from 'vitest';
import {
  exportToSRT,
  exportToVTT,
  formatSrtTimestamp,
  formatVttTimestamp,
  parseSRT,
  parseTimestamp,
  parseVTT,
  type SubtitleSegment,
} from '../src/core/subtitles';

describe('subtitle timestamp formatting & parsing', () => {
  it('formats SRT timestamp accurately', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000');
    expect(formatSrtTimestamp(1.5)).toBe('00:00:01,500');
    expect(formatSrtTimestamp(65.123)).toBe('00:01:05,123');
    expect(formatSrtTimestamp(3665.456)).toBe('01:01:05,456');
  });

  it('formats VTT timestamp accurately', () => {
    expect(formatVttTimestamp(1.5)).toBe('00:00:01.500');
    expect(formatVttTimestamp(65.123)).toBe('00:01:05.123');
  });

  it('parses timestamps in different formats', () => {
    expect(parseTimestamp('00:01:05,123')).toBeCloseTo(65.123);
    expect(parseTimestamp('00:01:05.123')).toBeCloseTo(65.123);
    expect(parseTimestamp('01:05.123')).toBeCloseTo(65.123);
    expect(parseTimestamp('65.123')).toBeCloseTo(65.123);
  });
});

describe('parseSRT & parseVTT', () => {
  const sampleSRT = `
1
00:00:01,000 --> 00:00:04,000
Hello world

2
00:00:05,500 --> 00:00:08,200
This is AI Video Edit Pro
`;

  it('parses SRT into SubtitleSegments', () => {
    const segments = parseSRT(sampleSRT);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      start: 1,
      end: 4,
      text: 'Hello world',
    });
    expect(segments[1]).toMatchObject({
      start: 5.5,
      end: 8.2,
      text: 'This is AI Video Edit Pro',
    });
  });

  const sampleVTT = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Hello from WebVTT

2
00:00:05.000 --> 00:00:07.500
Multi-line
caption text
`;

  it('parses WebVTT into SubtitleSegments', () => {
    const segments = parseVTT(sampleVTT);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({
      start: 1,
      end: 4,
      text: 'Hello from WebVTT',
    });
    expect(segments[1]!.text).toBe('Multi-line\ncaption text');
  });
});

describe('exportToSRT & exportToVTT', () => {
  const segments: SubtitleSegment[] = [
    { id: '1', start: 1.0, end: 3.5, text: 'First line' },
    { id: '2', start: 4.0, end: 6.25, text: 'Second line' },
  ];

  it('exports valid SRT content', () => {
    const srt = exportToSRT(segments);
    expect(srt).toContain('1\n00:00:01,000 --> 00:00:03,500\nFirst line');
    expect(srt).toContain('2\n00:00:04,000 --> 00:00:06,250\nSecond line');
  });

  it('exports valid WebVTT content', () => {
    const vtt = exportToVTT(segments);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toContain('00:00:01.000 --> 00:00:03.500');
  });
});
