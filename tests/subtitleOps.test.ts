import { describe, expect, it } from 'vitest';
import { SUBTITLE_PRESETS, type SubtitleSegment } from '../src/core/subtitles';
import {
  applySubtitlesToTimeline,
  clearSubtitlesFromTrack,
  findOrCreateSubtitleTrack,
} from '../src/core/subtitleOps';
import { makeProject } from './helpers';

describe('applySubtitlesToTimeline', () => {
  const segments: SubtitleSegment[] = [
    { id: 's1', start: 1.0, end: 3.0, text: 'Hello subtitle' },
    { id: 's2', start: 4.5, end: 6.0, text: 'Second caption' },
  ];

  it('creates a subtitle track and places styled text clips', () => {
    const project = makeProject(); // default tracks: v1, a1
    const preset = SUBTITLE_PRESETS[0]!; // TikTok preset

    const res = applySubtitlesToTimeline(project, segments, preset);
    expect(res.createdClipIds).toHaveLength(2);

    const subTrack = res.project.tracks.find((t) => t.id === res.trackId);
    expect(subTrack).toBeDefined();

    const clips = res.project.clips.filter((c) => c.trackId === res.trackId);
    expect(clips).toHaveLength(2);

    // Project fps = 30
    // Segment 1: start 1s = frame 30, duration 2s = 60 frames
    expect(clips[0]!.start).toBe(30);
    expect(clips[0]!.duration).toBe(60);
    expect(clips[0]!.text?.content).toBe('Hello subtitle');
    expect(clips[0]!.text?.color).toBe(preset.color);
    expect(clips[0]!.transform.y).toBe(preset.yOffset);

    // Segment 2: start 4.5s = frame 135, duration 1.5s = 45 frames
    expect(clips[1]!.start).toBe(135);
    expect(clips[1]!.duration).toBe(45);
    expect(clips[1]!.text?.content).toBe('Second caption');
  });

  it('finds or creates a dedicated subtitle track', () => {
    const project = makeProject();
    const res = findOrCreateSubtitleTrack(project);
    expect(res.trackId).toBeDefined();
    const createdTrack = res.project.tracks.find((t) => t.id === res.trackId);
    expect(createdTrack?.name).toBe('Subtitles');

    // Calling it again on the project with a subtitle track should return the existing track
    const second = findOrCreateSubtitleTrack(res.project);
    expect(second.trackId).toBe(res.trackId);
  });

  it('clears subtitles from a track', () => {
    const project = makeProject();
    const res = applySubtitlesToTimeline(project, segments, SUBTITLE_PRESETS[0]!);
    expect(res.project.clips.length).toBe(2);

    const cleared = clearSubtitlesFromTrack(res.project, res.trackId);
    expect(cleared.clips.filter((c) => c.trackId === res.trackId)).toHaveLength(0);
  });
});
