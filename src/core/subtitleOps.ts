/**
 * Pure timeline operations for placing and managing subtitle clips.
 */

import { newId } from './id';
import type { SubtitleSegment, SubtitleStylePreset } from './subtitles';
import { addTrack, getTrack } from './timelineOps';
import type { Clip, Project } from './types';

/**
 * Find an existing track suitable for subtitles or create a dedicated 'Subtitles' video track at the top.
 */
export function findOrCreateSubtitleTrack(project: Project): { project: Project; trackId: string } {
  // Check if a dedicated subtitle track exists
  const existingSubTrack = project.tracks.find(
    (t) => t.kind === 'video' && t.name.toLowerCase().includes('sub'),
  );
  if (existingSubTrack && !existingSubTrack.locked) {
    return { project, trackId: existingSubTrack.id };
  }

  // Create a new top video track named 'Subtitles'
  const newTrackId = newId('trk');
  const updatedProject = addTrack(project, 'video', newTrackId);
  const updatedTracks = updatedProject.tracks.map((t) =>
    t.id === newTrackId ? { ...t, name: 'Subtitles' } : t,
  );

  return { project: { ...updatedProject, tracks: updatedTracks }, trackId: newTrackId };
}

/**
 * Apply subtitle segments to the project timeline as styled Text clips.
 */
export function applySubtitlesToTimeline(
  project: Project,
  segments: readonly SubtitleSegment[],
  preset: SubtitleStylePreset,
  targetTrackId?: string,
  replaceExisting = true,
): { project: Project; trackId: string; createdClipIds: string[] } {
  if (segments.length === 0) {
    return { project, trackId: targetTrackId ?? '', createdClipIds: [] };
  }

  let currentProject = project;
  let trackId = targetTrackId;

  if (!trackId || !getTrack(currentProject, trackId)) {
    const res = findOrCreateSubtitleTrack(currentProject);
    currentProject = res.project;
    trackId = res.trackId;
  }

  const track = getTrack(currentProject, trackId);
  if (!track || track.locked) {
    return { project, trackId: trackId ?? '', createdClipIds: [] };
  }

  const fps = currentProject.fps;
  const sortedSegments = [...segments].sort((a, b) => a.start - b.start);

  // If replacing existing clips on the subtitle track
  let baseClips = currentProject.clips;
  if (replaceExisting) {
    baseClips = baseClips.filter((c) => c.trackId !== trackId);
  }

  const createdClips: Clip[] = [];
  const createdClipIds: string[] = [];

  let lastEndFrame = 0;

  for (const seg of sortedSegments) {
    const rawStartFrame = Math.round(seg.start * fps);
    const rawDuration = Math.max(1, Math.round((seg.end - seg.start) * fps));
    const startFrame = Math.max(rawStartFrame, lastEndFrame);

    const clipId = newId('clip');
    const name = seg.text.length > 20 ? seg.text.slice(0, 20) + '…' : seg.text;

    const clip: Clip = {
      id: clipId,
      trackId,
      kind: 'text',
      assetId: null,
      name,
      start: startFrame,
      duration: rawDuration,
      offset: 0,
      speed: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
      transform: {
        x: 0,
        y: preset.yOffset,
        scale: 1,
        rotation: 0,
        opacity: 1,
      },
      effects: [],
      text: {
        content: seg.text,
        fontFamily: preset.fontFamily,
        fontSize: preset.fontSize,
        color: preset.color,
        bold: preset.bold,
        italic: preset.italic,
        align: preset.align,
        background: preset.background,
      },
    };

    createdClips.push(clip);
    createdClipIds.push(clipId);
    lastEndFrame = startFrame + rawDuration;
  }

  return {
    project: { ...currentProject, clips: [...baseClips, ...createdClips] },
    trackId,
    createdClipIds,
  };
}

/**
 * Remove all subtitle/text clips from a given track.
 */
export function clearSubtitlesFromTrack(project: Project, trackId: string): Project {
  return {
    ...project,
    clips: project.clips.filter((c) => c.trackId !== trackId),
  };
}
