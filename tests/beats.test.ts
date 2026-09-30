import { describe, expect, it } from 'vitest';
import { cutTrackToBeats, detectBeatsFromSamples } from '../src/core/beats';
import { makeClip, makeProject } from './helpers';

describe('detectBeatsFromSamples', () => {
  it('detects rhythmic pulses and calculates estimated tempo (BPM)', () => {
    const sampleRate = 44100;
    // 2 seconds of audio with a kick drum pulse every 0.5s (120 BPM)
    const samples = new Float32Array(sampleRate * 2);
    for (let beat = 0; beat < 4; beat++) {
      const beatCenter = Math.floor(beat * 0.5 * sampleRate);
      for (let i = 0; i < 1000; i++) {
        if (beatCenter + i < samples.length) {
          samples[beatCenter + i] = 0.9 * Math.sin(i * 0.1);
        }
      }
    }

    const res = detectBeatsFromSamples(samples, sampleRate, { sensitivity: 0.6, fps: 30 });
    expect(res.beats.length).toBeGreaterThanOrEqual(2);
    expect(res.bpm).toBeGreaterThan(90);
    expect(res.bpm).toBeLessThan(160);
  });
});

describe('cutTrackToBeats', () => {
  it('splits video clip on timeline matching musical beat frames', () => {
    // 1 video clip from frame 0 to 120 (4 seconds at 30 fps)
    const videoClip = makeClip({ id: 'v1_clip', trackId: 'v1', start: 0, duration: 120 });
    const project = makeProject([videoClip]);

    // Beat frames at 30, 60, 90
    const beatFrames = [30, 60, 90];
    const updated = cutTrackToBeats(project, 'v1', beatFrames);

    // Should now have 4 split clips
    const trackClips = updated.clips.filter((c) => c.trackId === 'v1');
    expect(trackClips.length).toBe(4);
    expect(trackClips[0]!.duration).toBe(30);
    expect(trackClips[1]!.start).toBe(30);
    expect(trackClips[1]!.duration).toBe(30);
  });
});
