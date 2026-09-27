import { newId } from './id';
import { DEFAULT_TEXT_STYLE, DEFAULT_TRANSFORM, type Clip, type MediaAsset, type Project, type Track } from './types';

export const DEFAULT_IMAGE_SECONDS = 5;
export const DEFAULT_TEXT_SECONDS = 5;

export function createDefaultTracks(): Track[] {
  const make = (kind: Track['kind'], name: string): Track => ({
    id: newId('trk'),
    kind,
    name,
    muted: false,
    locked: false,
    hidden: false,
  });
  // Top -> bottom, exactly as displayed.
  return [make('video', 'V2'), make('video', 'V1'), make('audio', 'A1')];
}

export function createProject(name = 'Untitled Project'): Project {
  const now = Date.now();
  return {
    id: newId('prj'),
    name,
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: createDefaultTracks(),
    clips: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createClipFromAsset(asset: MediaAsset, trackId: string, start: number, fps: number): Clip {
  const duration =
    asset.kind === 'image' ? DEFAULT_IMAGE_SECONDS * fps : Math.max(1, Math.round(asset.duration * fps));
  return {
    id: newId('clip'),
    trackId,
    kind: asset.kind,
    assetId: asset.id,
    name: asset.name,
    start: Math.max(0, Math.round(start)),
    duration,
    offset: 0,
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...DEFAULT_TRANSFORM },
    effects: [],
    text: null,
  };
}

export function createTextClip(trackId: string, start: number, fps: number, content = 'Title'): Clip {
  return {
    id: newId('clip'),
    trackId,
    kind: 'text',
    assetId: null,
    name: content,
    start: Math.max(0, Math.round(start)),
    duration: DEFAULT_TEXT_SECONDS * fps,
    offset: 0,
    speed: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    transform: { ...DEFAULT_TRANSFORM },
    effects: [],
    text: { ...DEFAULT_TEXT_STYLE, content },
  };
}

/**
 * Default destination track for a clip kind: the bottom-most video track (V1) for visuals,
 * the top-most audio track (A1) for audio. Locked tracks are skipped.
 */
export function defaultTrackFor(project: Project, kind: Clip['kind']): Track | undefined {
  if (kind === 'audio') return project.tracks.find((t) => t.kind === 'audio' && !t.locked);
  const videoTracks = project.tracks.filter((t) => t.kind === 'video' && !t.locked);
  return videoTracks[videoTracks.length - 1];
}

/** Titles go on the top-most video track so they render above footage. */
export function topVideoTrack(project: Project): Track | undefined {
  return project.tracks.find((t) => t.kind === 'video' && !t.locked);
}
