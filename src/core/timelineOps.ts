/**
 * Pure, side-effect-free timeline operations.
 *
 * Every function takes a `Project` (plus whatever context it needs) and returns either the SAME
 * reference when nothing changed, or a new `Project` with structural sharing. This makes the
 * undo/redo history cheap (snapshots share unchanged clips) and the store trivial to reason about.
 *
 * Invariants guaranteed by these operations:
 *  1. Clips on the same track never overlap.
 *  2. `clip.duration >= MIN_CLIP_FRAMES`, `clip.start >= 0`, `clip.offset >= 0`.
 *  3. Video/audio clips never extend beyond their source media (`offset + duration*speed <= source`).
 *  4. Audio clips only live on audio tracks; video/image/text clips only on video tracks.
 *  5. Clips on locked tracks are never modified.
 */

import { clamp } from './time';
import type {
  Clip,
  ClipKind,
  Frames,
  MediaAsset,
  Project,
  Track,
  TrackKind,
  TrimEdge,
} from './types';

export const MIN_CLIP_FRAMES: Frames = 1;
export const MIN_SPEED = 0.1;
export const MAX_SPEED = 8;

export type AssetMap = Readonly<Record<string, MediaAsset>>;

/* ------------------------------------------------------------------------------------------------
 * Queries
 * --------------------------------------------------------------------------------------------- */

export function clipEnd(clip: Pick<Clip, 'start' | 'duration'>): Frames {
  return clip.start + clip.duration;
}

export function overlaps(a: Pick<Clip, 'start' | 'duration'>, b: Pick<Clip, 'start' | 'duration'>): boolean {
  return a.start < clipEnd(b) && b.start < clipEnd(a);
}

export function isKindCompatible(clipKind: ClipKind, trackKind: TrackKind): boolean {
  return trackKind === 'audio' ? clipKind === 'audio' : clipKind !== 'audio';
}

export function getTrack(project: Project, trackId: string): Track | undefined {
  return project.tracks.find((t) => t.id === trackId);
}

export function getClip(project: Project, clipId: string): Clip | undefined {
  return project.clips.find((c) => c.id === clipId);
}

/** Clips on a track sorted by start, optionally excluding one clip id. */
export function trackClips(project: Project, trackId: string, excludeId?: string): Clip[] {
  return project.clips
    .filter((c) => c.trackId === trackId && c.id !== excludeId)
    .sort((a, b) => a.start - b.start);
}

/** Total length of the sequence in frames (0 when empty). */
export function projectDuration(project: Project): Frames {
  let end = 0;
  for (const clip of project.clips) end = Math.max(end, clipEnd(clip));
  return end;
}

export function clipsAt(project: Project, frame: Frames): Clip[] {
  return project.clips.filter((c) => c.start <= frame && frame < clipEnd(c));
}

export function activeClipOnTrack(project: Project, trackId: string, frame: Frames): Clip | undefined {
  return project.clips.find((c) => c.trackId === trackId && c.start <= frame && frame < clipEnd(c));
}

/** Length of the source media in project frames, or null when unbounded (image/text/unknown). */
export function sourceLengthFrames(clip: Clip, assets: AssetMap, fps: number): Frames | null {
  if (clip.kind !== 'video' && clip.kind !== 'audio') return null;
  if (!clip.assetId) return null;
  const asset = assets[clip.assetId];
  if (!asset || !Number.isFinite(asset.duration) || asset.duration <= 0) return null;
  return Math.max(MIN_CLIP_FRAMES, Math.round(asset.duration * fps));
}

/** Longest duration this clip may have at its current offset/speed without exceeding its source. */
export function maxClipDuration(clip: Clip, assets: AssetMap, fps: number, speed = clip.speed): Frames {
  const source = sourceLengthFrames(clip, assets, fps);
  if (source === null) return Number.POSITIVE_INFINITY;
  return Math.max(MIN_CLIP_FRAMES, Math.floor((source - clip.offset) / speed));
}

/** Source time (seconds) that should be displayed for `frame` of the timeline. */
export function sourceTimeAt(clip: Clip, frame: Frames, fps: number): number {
  return (clip.offset + (frame - clip.start) * clip.speed) / fps;
}

/** Opacity multiplier produced by fade in/out at `frame` (1 when outside fades). */
export function fadeFactor(clip: Clip, frame: Frames): number {
  const local = frame - clip.start;
  let factor = 1;
  if (clip.fadeIn > 0 && local < clip.fadeIn) factor = Math.min(factor, local / clip.fadeIn);
  const untilEnd = clip.duration - local;
  if (clip.fadeOut > 0 && untilEnd < clip.fadeOut) factor = Math.min(factor, untilEnd / clip.fadeOut);
  return clamp(factor, 0, 1);
}

/* ------------------------------------------------------------------------------------------------
 * Collision resolution
 * --------------------------------------------------------------------------------------------- */

/**
 * Returns the non-overlapping start position closest to `requested` for a clip of `duration`
 * frames amongst `others` (which must not overlap each other). Ties prefer the later position.
 */
export function findFreePosition(others: readonly Clip[], requested: Frames, duration: Frames): Frames {
  const req = Math.max(0, Math.round(requested));
  const fits = (start: Frames): boolean =>
    start >= 0 && others.every((o) => !(start < clipEnd(o) && o.start < start + duration));

  if (fits(req)) return req;

  let best: Frames | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const other of others) {
    for (const candidate of [clipEnd(other), other.start - duration]) {
      if (!fits(candidate)) continue;
      const distance = Math.abs(candidate - req);
      if (distance < bestDistance || (distance === bestDistance && best !== null && candidate > best)) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  if (best !== null) return best;
  // Unreachable in practice (the end of the last clip always fits) but keeps the function total.
  return others.reduce((max, o) => Math.max(max, clipEnd(o)), 0);
}

/* ------------------------------------------------------------------------------------------------
 * Mutations (return same reference when nothing changes)
 * --------------------------------------------------------------------------------------------- */

function replaceClip(project: Project, clip: Clip): Project {
  return { ...project, clips: project.clips.map((c) => (c.id === clip.id ? clip : c)) };
}

function isLocked(project: Project, trackId: string): boolean {
  return getTrack(project, trackId)?.locked ?? true;
}

export function addClip(project: Project, clip: Clip): Project {
  const track = getTrack(project, clip.trackId);
  if (!track || track.locked || !isKindCompatible(clip.kind, track.kind)) return project;
  if (project.clips.some((c) => c.id === clip.id)) return project;

  const duration = Math.max(MIN_CLIP_FRAMES, Math.round(clip.duration));
  const start = findFreePosition(trackClips(project, clip.trackId), clip.start, duration);
  const safeClip: Clip = {
    ...clip,
    start,
    duration,
    offset: Math.max(0, Math.round(clip.offset)),
    fadeIn: clamp(Math.round(clip.fadeIn), 0, duration),
    fadeOut: clamp(Math.round(clip.fadeOut), 0, duration),
  };
  return { ...project, clips: [...project.clips, safeClip] };
}

export function moveClip(project: Project, clipId: string, targetStart: Frames, targetTrackId?: string): Project {
  const clip = getClip(project, clipId);
  if (!clip) return project;
  const trackId = targetTrackId ?? clip.trackId;
  const track = getTrack(project, trackId);
  if (!track || track.locked || !isKindCompatible(clip.kind, track.kind)) return project;
  if (isLocked(project, clip.trackId)) return project;

  const start = findFreePosition(trackClips(project, trackId, clipId), targetStart, clip.duration);
  if (start === clip.start && trackId === clip.trackId) return project;
  return replaceClip(project, { ...clip, start, trackId });
}

export function trimClip(
  project: Project,
  assets: AssetMap,
  clipId: string,
  edge: TrimEdge,
  targetFrame: Frames,
): Project {
  const clip = getClip(project, clipId);
  if (!clip || isLocked(project, clip.trackId)) return project;

  const others = trackClips(project, clip.trackId, clipId);
  const target = Math.round(targetFrame);
  const end = clipEnd(clip);

  if (edge === 'start') {
    const prevEnd = others.filter((o) => clipEnd(o) <= clip.start).reduce((m, o) => Math.max(m, clipEnd(o)), 0);
    const bounded = clip.kind === 'video' || clip.kind === 'audio';
    const minBySource = bounded ? clip.start - Math.floor(clip.offset / clip.speed) : 0;
    const minStart = Math.max(0, prevEnd, minBySource);
    const maxStart = end - MIN_CLIP_FRAMES;
    const newStart = clamp(target, minStart, maxStart);
    if (newStart === clip.start) return project;

    const delta = newStart - clip.start;
    const newDuration = end - newStart;
    const newOffset = Math.max(0, clip.offset + Math.round(delta * clip.speed));
    return replaceClip(project, {
      ...clip,
      start: newStart,
      duration: newDuration,
      offset: newOffset,
      fadeIn: Math.min(clip.fadeIn, newDuration),
      fadeOut: Math.min(clip.fadeOut, newDuration),
    });
  }

  const nextStart = others
    .filter((o) => o.start >= end)
    .reduce((m, o) => Math.min(m, o.start), Number.POSITIVE_INFINITY);
  const maxEnd = Math.min(nextStart, clip.start + maxClipDuration(clip, assets, project.fps));
  const minEnd = clip.start + MIN_CLIP_FRAMES;
  const newEnd = clamp(target, minEnd, Math.max(minEnd, maxEnd));
  if (newEnd === end) return project;

  const newDuration = newEnd - clip.start;
  return replaceClip(project, {
    ...clip,
    duration: newDuration,
    fadeIn: Math.min(clip.fadeIn, newDuration),
    fadeOut: Math.min(clip.fadeOut, newDuration),
  });
}

/** Blade: split `clipId` at timeline frame `at`. The right-hand part receives `newId`. */
export function splitClip(project: Project, clipId: string, at: Frames, newId: string): Project {
  const clip = getClip(project, clipId);
  if (!clip || isLocked(project, clip.trackId)) return project;
  const frame = Math.round(at);
  const end = clipEnd(clip);
  if (frame <= clip.start || frame >= end) return project;
  if (project.clips.some((c) => c.id === newId)) return project;

  const leftDuration = frame - clip.start;
  const rightDuration = end - frame;
  const left: Clip = {
    ...clip,
    duration: leftDuration,
    fadeIn: Math.min(clip.fadeIn, leftDuration),
    fadeOut: 0,
  };
  const right: Clip = {
    ...clip,
    id: newId,
    start: frame,
    duration: rightDuration,
    offset: clip.offset + Math.round(leftDuration * clip.speed),
    fadeIn: 0,
    fadeOut: Math.min(clip.fadeOut, rightDuration),
    transform: { ...clip.transform },
    effects: clip.effects.map((e) => ({ ...e })),
    text: clip.text ? { ...clip.text } : null,
  };

  const index = project.clips.findIndex((c) => c.id === clipId);
  const clips = [...project.clips];
  clips.splice(index, 1, left, right);
  return { ...project, clips };
}

export function removeClips(project: Project, clipIds: Iterable<string>): Project {
  const ids = new Set(clipIds);
  const clips = project.clips.filter((c) => !(ids.has(c.id) && !isLocked(project, c.trackId)));
  if (clips.length === project.clips.length) return project;
  return { ...project, clips };
}

/**
 * Ripple delete: remove the clips and close the gaps they leave by shifting every later clip on
 * the same track left by the removed duration (Final Cut style "magnetic" delete).
 */
export function rippleDelete(project: Project, clipIds: Iterable<string>): Project {
  const ids = new Set(clipIds);
  const removed = project.clips.filter((c) => ids.has(c.id) && !isLocked(project, c.trackId));
  if (removed.length === 0) return project;
  const removedIds = new Set(removed.map((c) => c.id));

  let clips = project.clips.filter((c) => !removedIds.has(c.id));
  // Process the latest removals first so earlier shifts also carry already-shifted clips.
  const ordered = [...removed].sort((a, b) => b.start - a.start);
  for (const gone of ordered) {
    const goneEnd = clipEnd(gone);
    clips = clips.map((c) =>
      c.trackId === gone.trackId && c.start >= goneEnd ? { ...c, start: c.start - gone.duration } : c,
    );
  }
  return { ...project, clips };
}

/** Duplicate a clip directly after itself (or at the nearest free slot). */
export function duplicateClip(project: Project, clipId: string, newId: string): Project {
  const clip = getClip(project, clipId);
  if (!clip || isLocked(project, clip.trackId)) return project;
  if (project.clips.some((c) => c.id === newId)) return project;
  const start = findFreePosition(trackClips(project, clip.trackId), clipEnd(clip), clip.duration);
  const copy: Clip = {
    ...clip,
    id: newId,
    start,
    transform: { ...clip.transform },
    effects: clip.effects.map((e) => ({ ...e })),
    text: clip.text ? { ...clip.text } : null,
  };
  return { ...project, clips: [...project.clips, copy] };
}

export type ClipPatch = Partial<
  Pick<Clip, 'name' | 'volume' | 'muted' | 'fadeIn' | 'fadeOut' | 'transform' | 'effects' | 'text' | 'transitionIn' | 'transitionOut' | 'keyframes'>
>;

/** Patch non-structural clip properties (timing is handled by dedicated operations). */
export function updateClip(project: Project, clipId: string, patch: ClipPatch): Project {
  const clip = getClip(project, clipId);
  if (!clip || isLocked(project, clip.trackId)) return project;

  const next: Clip = { ...clip, ...patch };
  next.volume = clamp(next.volume, 0, 2);
  next.fadeIn = clamp(Math.round(next.fadeIn), 0, next.duration);
  next.fadeOut = clamp(Math.round(next.fadeOut), 0, next.duration);
  next.transform = {
    ...next.transform,
    scale: clamp(next.transform.scale, 0.01, 20),
    opacity: clamp(next.transform.opacity, 0, 1),
  };
  return replaceClip(project, next);
}

/**
 * Change playback speed while keeping the clip's in-point and start. The timeline duration is
 * rescaled (`duration * oldSpeed / newSpeed`) but never grows into the next clip or past the
 * end of the source media.
 */
export function setClipSpeed(project: Project, assets: AssetMap, clipId: string, speed: number): Project {
  const clip = getClip(project, clipId);
  if (!clip || isLocked(project, clip.trackId)) return project;
  const newSpeed = clamp(speed, MIN_SPEED, MAX_SPEED);
  if (newSpeed === clip.speed) return project;

  const others = trackClips(project, clip.trackId, clipId);
  const nextStart = others
    .filter((o) => o.start >= clipEnd(clip))
    .reduce((m, o) => Math.min(m, o.start), Number.POSITIVE_INFINITY);
  const maxByNeighbour = nextStart - clip.start;
  const maxBySource = maxClipDuration(clip, assets, project.fps, newSpeed);
  const wanted = Math.round((clip.duration * clip.speed) / newSpeed);
  const duration = Math.max(MIN_CLIP_FRAMES, Math.min(wanted, maxByNeighbour, maxBySource));

  return replaceClip(project, {
    ...clip,
    speed: newSpeed,
    duration,
    fadeIn: Math.min(clip.fadeIn, duration),
    fadeOut: Math.min(clip.fadeOut, duration),
  });
}

/* ------------------------------------------------------------------------------------------------
 * Tracks
 * --------------------------------------------------------------------------------------------- */

/** Video tracks are inserted at the top, audio tracks appended at the bottom. */
export function addTrack(project: Project, kind: TrackKind, id: string): Project {
  if (project.tracks.some((t) => t.id === id)) return project;
  const count = project.tracks.filter((t) => t.kind === kind).length;
  const track: Track = {
    id,
    kind,
    name: `${kind === 'video' ? 'V' : 'A'}${count + 1}`,
    muted: false,
    locked: false,
    hidden: false,
  };
  const tracks = kind === 'video' ? [track, ...project.tracks] : [...project.tracks, track];
  return { ...project, tracks };
}

/** Removes a track and all of its clips. The last track of each kind cannot be removed. */
export function removeTrack(project: Project, trackId: string): Project {
  const track = getTrack(project, trackId);
  if (!track) return project;
  if (project.tracks.filter((t) => t.kind === track.kind).length <= 1) return project;
  return {
    ...project,
    tracks: project.tracks.filter((t) => t.id !== trackId),
    clips: project.clips.filter((c) => c.trackId !== trackId),
  };
}

export function updateTrack(project: Project, trackId: string, patch: Partial<Omit<Track, 'id' | 'kind'>>): Project {
  const track = getTrack(project, trackId);
  if (!track) return project;
  return { ...project, tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)) };
}

/* ------------------------------------------------------------------------------------------------
 * Project settings
 * --------------------------------------------------------------------------------------------- */

/**
 * Re-quantise every clip to a new frame rate. Rounding could in theory create overlaps, so clips
 * are re-packed per track in start order to preserve invariant #1.
 */
export function changeFps(project: Project, newFps: number): Project {
  if (!Number.isFinite(newFps) || newFps <= 0 || newFps === project.fps) return project;
  const ratio = newFps / project.fps;
  const scaled: Clip[] = project.clips.map((c) => ({
    ...c,
    start: Math.max(0, Math.round(c.start * ratio)),
    duration: Math.max(MIN_CLIP_FRAMES, Math.round(c.duration * ratio)),
    offset: Math.max(0, Math.round(c.offset * ratio)),
    fadeIn: Math.max(0, Math.round(c.fadeIn * ratio)),
    fadeOut: Math.max(0, Math.round(c.fadeOut * ratio)),
  }));

  const lastEndByTrack = new Map<string, Frames>();
  const packed = [...scaled]
    .sort((a, b) => a.start - b.start)
    .map((c) => {
      const minStart = lastEndByTrack.get(c.trackId) ?? 0;
      const start = Math.max(c.start, minStart);
      lastEndByTrack.set(c.trackId, start + c.duration);
      return start === c.start ? c : { ...c, start };
    });

  // Keep the original clip order in the array for stable React keys.
  const byId = new Map(packed.map((c) => [c.id, c]));
  return { ...project, fps: newFps, clips: project.clips.map((c) => byId.get(c.id) ?? c) };
}

export function setResolution(project: Project, width: number, height: number): Project {
  const w = Math.round(width);
  const h = Math.round(height);
  if (w < 16 || h < 16 || (w === project.width && h === project.height)) return project;
  return { ...project, width: w, height: h };
}
