import { describe, expect, it } from 'vitest';
import { applyAudioDucking, extractAudioFromClip } from '../src/core/audioOps';
import { makeAsset, makeClip, makeProject } from './helpers';

describe('extractAudioFromClip', () => {
  const asset = makeAsset({ id: 'videoAsset', duration: 10 });
  const assets = { videoAsset: asset };

  it('extracts audio to a dedicated audio track and mutes the original video clip', () => {
    const videoClip = makeClip({ id: 'v1_clip', assetId: 'videoAsset', start: 30, duration: 90 });
    const project = makeProject([videoClip]);

    const { project: nextProject, audioClipId } = extractAudioFromClip(project, assets, 'v1_clip');
    expect(audioClipId).toBeDefined();

    // Original video clip is muted
    const updatedVideo = nextProject.clips.find((c) => c.id === 'v1_clip')!;
    expect(updatedVideo.muted).toBe(true);
    expect(updatedVideo.volume).toBe(0);

    // Newly created audio clip exists on audio track A1
    const audioClip = nextProject.clips.find((c) => c.id === audioClipId)!;
    expect(audioClip).toBeDefined();
    expect(audioClip.kind).toBe('audio');
    expect(audioClip.start).toBe(30);
    expect(audioClip.duration).toBe(90);
    expect(audioClip.muted).toBe(false);
  });
});

describe('applyAudioDucking', () => {
  it('lowers volume of music clips during active speech', () => {
    // Track v1 has speech clip from 0 to 60 frames
    const speechClip = makeClip({ id: 'speech', trackId: 'v1', start: 0, duration: 60, muted: false });
    // Track a1 has music clip from 0 to 120 frames with volume = 1.0
    const musicClip = makeClip({ id: 'music', kind: 'audio', trackId: 'a1', start: 0, duration: 120, volume: 1.0 });

    const project = makeProject([speechClip, musicClip]);
    const next = applyAudioDucking(project, 'v1', 'a1', 0.25);

    const updatedMusic = next.clips.find((c) => c.id === 'music')!;
    expect(updatedMusic.volume).toBe(0.25);
  });
});
