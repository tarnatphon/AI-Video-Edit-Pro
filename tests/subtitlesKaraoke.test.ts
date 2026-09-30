import { describe, expect, it } from 'vitest';
import {
  convertSubtitlesToVoiceoverScript,
  parseSRT,
  type SubtitleSegment,
} from '../src/core/subtitles';

describe('Karaoke Subtitles & Voiceover conversion', () => {
  const sampleSRT = `
1
00:00:01,000 --> 00:00:03,000
AI Video Edit Pro

2
00:00:03,500 --> 00:00:05,000
Easy fast editor
`;

  it('generates word timestamps on parsed SRT', () => {
    const segments = parseSRT(sampleSRT);
    expect(segments).toHaveLength(2);
    expect(segments[0]!.words).toBeDefined();
    expect(segments[0]!.words!.length).toBe(4); // "AI", "Video", "Edit", "Pro"
  });

  it('converts subtitle segments into a continuous voiceover script', () => {
    const segments: SubtitleSegment[] = [
      { id: '1', start: 1, end: 3, text: 'Hello everyone' },
      { id: '2', start: 3.5, end: 5, text: 'welcome to the video' },
    ];

    const script = convertSubtitlesToVoiceoverScript(segments);
    expect(script).toBe('Hello everyone welcome to the video');
  });
});
