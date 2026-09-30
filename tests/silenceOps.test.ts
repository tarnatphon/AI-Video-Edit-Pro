import { describe, expect, it } from 'vitest';
import type { SpeechInterval } from '../src/core/silence';
import { removeSilenceFromClip } from '../src/core/silenceOps';
import { makeClip, makeProject } from './helpers';

describe('removeSilenceFromClip (timeline ops)', () => {
  const assets = {};

  it('cuts silence and ripples later clips in ripple mode', () => {
    // Project fps = 30
    // Clip A: start = 0, duration = 150 frames (5s)
    // Clip B: start = 200, duration = 60 frames (2s)
    const clipA = makeClip({ id: 'a', start: 0, duration: 150, offset: 0 });
    const clipB = makeClip({ id: 'b', start: 200, duration: 60, offset: 300 });
    const project = makeProject([clipA, clipB]);

    // Speech from 0-1s (0-30f) and 3-5s (90-150f). Silence from 1-3s (60 frames).
    const speech: SpeechInterval[] = [
      { start: 0, end: 1, duration: 1 },
      { start: 3, end: 5, duration: 2 },
    ];

    const next = removeSilenceFromClip(project, assets, 'a', speech, 'ripple');

    // Speech segments:
    // Seg 1: 0 to 30 frames (duration 30)
    // Seg 2: 30 to 90 frames (duration 60)
    // Total duration of A's speech = 90 frames (saved 60 frames = 2s)
    const clipsOnV1 = next.clips.filter((c) => c.trackId === 'v1');
    expect(clipsOnV1.length).toBe(3); // 2 speech clips + clip B

    const seg1 = clipsOnV1.find((c) => c.id === 'a')!;
    expect(seg1.start).toBe(0);
    expect(seg1.duration).toBe(30);
    expect(seg1.offset).toBe(0);

    const seg2 = clipsOnV1.find((c) => c.offset === 90)!;
    expect(seg2.start).toBe(30);
    expect(seg2.duration).toBe(60);

    // Clip B should be shifted left by 60 frames (from 200 to 140)
    const updatedB = next.clips.find((c) => c.id === 'b')!;
    expect(updatedB.start).toBe(140);
  });

  it('splits clips in place without rippling in split mode', () => {
    const clip = makeClip({ id: 'a', start: 0, duration: 150, offset: 0 });
    const project = makeProject([clip]);

    const speech: SpeechInterval[] = [
      { start: 0, end: 1, duration: 1 },
      { start: 3, end: 5, duration: 2 },
    ];

    const next = removeSilenceFromClip(project, assets, 'a', speech, 'split');
    // Should have 3 clips: speech 0-1s, silence 1-3s, speech 3-5s
    expect(next.clips.length).toBe(3);
    expect(next.clips[0]!.duration).toBe(30);
    expect(next.clips[1]!.duration).toBe(60);
    expect(next.clips[2]!.duration).toBe(60);
  });

  it('mutes silent segments in mute mode', () => {
    const clip = makeClip({ id: 'a', start: 0, duration: 150, offset: 0, volume: 1, muted: false });
    const project = makeProject([clip]);

    const speech: SpeechInterval[] = [
      { start: 0, end: 1, duration: 1 },
      { start: 3, end: 5, duration: 2 },
    ];

    const next = removeSilenceFromClip(project, assets, 'a', speech, 'mute');
    expect(next.clips.length).toBe(3);

    const silenceClip = next.clips.find((c) => c.offset === 30)!;
    expect(silenceClip.volume).toBe(0);
    expect(silenceClip.muted).toBe(true);

    const speechClip = next.clips.find((c) => c.offset === 0)!;
    expect(speechClip.volume).toBe(1);
    expect(speechClip.muted).toBe(false);
  });

  it('returns same project when entire clip is speech', () => {
    const clip = makeClip({ id: 'a', start: 0, duration: 90, offset: 0 });
    const project = makeProject([clip]);
    const speech: SpeechInterval[] = [{ start: 0, end: 3, duration: 3 }];
    expect(removeSilenceFromClip(project, assets, 'a', speech, 'ripple')).toBe(project);
  });
});
