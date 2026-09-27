import { DEFAULT_TRANSFORM, type Clip, type MediaAsset, type Project, type Track } from '../src/core/types';

export const V2: Track = { id: 'v2', kind: 'video', name: 'V2', muted: false, locked: false, hidden: false };
export const V1: Track = { id: 'v1', kind: 'video', name: 'V1', muted: false, locked: false, hidden: false };
export const A1: Track = { id: 'a1', kind: 'audio', name: 'A1', muted: false, locked: false, hidden: false };

export function makeProject(clips: Clip[] = [], tracks: Track[] = [V2, V1, A1]): Project {
  return {
    id: 'p1',
    name: 'Test',
    fps: 30,
    width: 1920,
    height: 1080,
    tracks,
    clips,
    createdAt: 0,
    updatedAt: 0,
  };
}

export function makeClip(partial: Partial<Clip> & Pick<Clip, 'id' | 'start' | 'duration'>): Clip {
  return {
    trackId: 'v1',
    kind: 'video',
    assetId: 'asset1',
    name: partial.id,
    offset: 0,
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...DEFAULT_TRANSFORM },
    effects: [],
    text: null,
    ...partial,
  };
}

export function makeAsset(partial: Partial<MediaAsset> & Pick<MediaAsset, 'id' | 'duration'>): MediaAsset {
  return {
    name: partial.id,
    kind: 'video',
    mimeType: 'video/mp4',
    size: 1,
    url: 'blob:test',
    width: 1920,
    height: 1080,
    hasAudio: true,
    thumbnail: null,
    waveform: null,
    storage: { kind: 'memory' },
    missing: false,
    ...partial,
  };
}

/** Asserts the non-overlap invariant on every track. */
export function assertNoOverlaps(project: Project): void {
  for (const track of project.tracks) {
    const clips = project.clips.filter((c) => c.trackId === track.id).sort((a, b) => a.start - b.start);
    for (let i = 1; i < clips.length; i++) {
      const prev = clips[i - 1]!;
      const curr = clips[i]!;
      if (curr.start < prev.start + prev.duration) {
        throw new Error(`Overlap on ${track.name}: ${prev.id} [${prev.start},${prev.start + prev.duration}) vs ${curr.id} @${curr.start}`);
      }
    }
  }
}
