/**
 * Pure timeline operations for Audio Extraction, Linking, and Auto-Ducking.
 */

import { newId } from './id';
import { addClip, addTrack, clipEnd, getClip, getTrack, type AssetMap } from './timelineOps';
import type { Clip, Frames, Project } from './types';

/**
 * Extract audio from a video clip into a dedicated audio track (A1 / A2) and mute the original video clip.
 */
export function extractAudioFromClip(
  project: Project,
  _assets: AssetMap,
  clipId: string,
  targetTrackId?: string,
): { project: Project; audioClipId: string | null } {
  const clip = getClip(project, clipId);
  if (!clip || clip.kind !== 'video' || !clip.assetId) {
    return { project, audioClipId: null };
  }

  let nextProject = project;
  let trackId = targetTrackId;

  // Find or create an audio track
  if (!trackId || !getTrack(nextProject, trackId)) {
    const audioTrack = nextProject.tracks.find((t) => t.kind === 'audio' && !t.locked);
    if (audioTrack) {
      trackId = audioTrack.id;
    } else {
      const newTrackId = newId('trk');
      nextProject = addTrack(nextProject, 'audio', newTrackId);
      trackId = newTrackId;
    }
  }

  const audioClipId = newId('clip');
  const audioClip: Clip = {
    id: audioClipId,
    trackId,
    kind: 'audio',
    assetId: clip.assetId,
    name: `${clip.name} (Audio)`,
    start: clip.start,
    duration: clip.duration,
    offset: clip.offset,
    speed: clip.speed,
    volume: clip.volume,
    muted: false,
    fadeIn: clip.fadeIn,
    fadeOut: clip.fadeOut,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    text: null,
  };

  // Mute the original video clip
  const updatedClips = nextProject.clips.map((c) =>
    c.id === clipId ? { ...c, muted: true, volume: 0 } : c,
  );
  nextProject = { ...nextProject, clips: updatedClips };

  // Add the newly created audio clip to the audio track
  nextProject = addClip(nextProject, audioClip);

  return { project: nextProject, audioClipId };
}

/**
 * Apply automatic audio ducking: lowers volume on music clips during time ranges where speech clips are active.
 */
export function applyAudioDucking(
  project: Project,
  speechTrackId: string,
  musicTrackId: string,
  duckGain = 0.25, // lower volume to 25% during speech
): Project {
  const speechTrack = getTrack(project, speechTrackId);
  const musicTrack = getTrack(project, musicTrackId);
  if (!speechTrack || !musicTrack || musicTrack.locked) return project;

  const speechClips = project.clips.filter((c) => c.trackId === speechTrackId && !c.muted);
  const musicClips = project.clips.filter((c) => c.trackId === musicTrackId);

  if (speechClips.length === 0 || musicClips.length === 0) return project;

  // Find speech intervals in frames
  const speechIntervals: { start: Frames; end: Frames }[] = speechClips
    .map((c) => ({ start: c.start, end: clipEnd(c) }))
    .sort((a, b) => a.start - b.start);

  const updatedClips = project.clips.map((clip) => {
    if (clip.trackId !== musicTrackId) return clip;
    const clipStart = clip.start;
    const clipStop = clipEnd(clip);

    // Check if any speech overlaps with this music clip
    const hasOverlap = speechIntervals.some(
      (sp) => sp.start < clipStop && clipStart < sp.end,
    );

    if (hasOverlap) {
      return { ...clip, volume: Number((clip.volume * duckGain).toFixed(2)) };
    }
    return clip;
  });

  return { ...project, clips: updatedClips };
}
