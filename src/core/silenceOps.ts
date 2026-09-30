/**
 * Pure timeline operations for AI silence removal / smart jump cuts.
 *
 * Guaranteed invariants:
 *  - Integer frame timing at project FPS.
 *  - Preserves transform, effects, and text properties on speech sub-clips.
 *  - Non-overlapping clips.
 *  - Ripple delete shifts later clips on the same track by the exact duration saved.
 *  - Structural sharing / pure mutations.
 */

import { newId } from './id';
import type { SpeechInterval } from './silence';
import { clipEnd, getClip, getTrack, type AssetMap } from './timelineOps';
import type { Clip, Project } from './types';

export type SilenceCutMode = 'ripple' | 'split' | 'mute';

/**
 * Cut silence from a single clip and return a new Project.
 */
export function removeSilenceFromClip(
  project: Project,
  _assets: AssetMap,
  clipId: string,
  speechIntervals: readonly SpeechInterval[],
  mode: SilenceCutMode = 'ripple',
): Project {
  const clip = getClip(project, clipId);
  if (!clip) return project;
  const track = getTrack(project, clip.trackId);
  if (!track || track.locked) return project;
  if (clip.duration <= 1) return project;

  const fps = project.fps;
  const clipSourceStartSec = clip.offset / fps;
  const clipSourceEndSec = (clip.offset + clip.duration * clip.speed) / fps;

  // Find all speech intervals overlapping with the active portion of the clip
  const validSpeech = speechIntervals
    .map((sp) => ({
      startSec: Math.max(clipSourceStartSec, sp.start),
      endSec: Math.min(clipSourceEndSec, sp.end),
    }))
    .filter((sp) => sp.endSec - sp.startSec > 0.01)
    .sort((a, b) => a.startSec - b.startSec);

  // If entire clip is speech, no cut needed
  if (
    validSpeech.length === 1 &&
    validSpeech[0]!.startSec <= clipSourceStartSec + 0.01 &&
    validSpeech[0]!.endSec >= clipSourceEndSec - 0.01
  ) {
    return project;
  }

  // Derive complementary silence intervals within the clip's time range
  const validSilence: { startSec: number; endSec: number }[] = [];
  let currentSec = clipSourceStartSec;

  for (const sp of validSpeech) {
    if (sp.startSec > currentSec + 0.01) {
      validSilence.push({ startSec: currentSec, endSec: sp.startSec });
    }
    currentSec = sp.endSec;
  }
  if (currentSec < clipSourceEndSec - 0.01) {
    validSilence.push({ startSec: currentSec, endSec: clipSourceEndSec });
  }

  // If no speech found (e.g. completely silent clip)
  if (validSpeech.length === 0) {
    if (mode === 'ripple') {
      // Remove clip completely and ripple
      const oldEnd = clipEnd(clip);
      const remainingClips = project.clips
        .filter((c) => c.id !== clip.id)
        .map((c) =>
          c.trackId === clip.trackId && c.start >= oldEnd
            ? { ...c, start: Math.max(0, c.start - clip.duration) }
            : c,
        );
      return { ...project, clips: remainingClips };
    }
    if (mode === 'mute') {
      return {
        ...project,
        clips: project.clips.map((c) =>
          c.id === clip.id ? { ...c, volume: 0, muted: true } : c,
        ),
      };
    }
    return project;
  }

  const generatedClips: Clip[] = [];

  if (mode === 'ripple') {
    // Pack speech segments back-to-back starting at original clip.start
    let currentTimelineFrame = clip.start;

    for (let i = 0; i < validSpeech.length; i++) {
      const sp = validSpeech[i]!;
      const segOffsetFrames = Math.max(0, Math.round(sp.startSec * fps));
      const segSourceDurationFrames = Math.max(1, Math.round((sp.endSec - sp.startSec) * fps));
      const segTimelineDurationFrames = Math.max(1, Math.round(segSourceDurationFrames / clip.speed));

      const subClip: Clip = {
        ...clip,
        id: i === 0 ? clip.id : newId('clip'),
        start: currentTimelineFrame,
        duration: segTimelineDurationFrames,
        offset: segOffsetFrames,
        fadeIn: 0,
        fadeOut: 0,
        transform: { ...clip.transform },
        effects: clip.effects.map((e) => ({ ...e })),
        text: clip.text ? { ...clip.text } : null,
      };

      generatedClips.push(subClip);
      currentTimelineFrame += segTimelineDurationFrames;
    }

    const totalNewDuration = currentTimelineFrame - clip.start;
    const durationSaved = clip.duration - totalNewDuration;
    const oldEnd = clipEnd(clip);

    const otherClips = project.clips
      .filter((c) => c.id !== clip.id)
      .map((c) => {
        if (c.trackId === clip.trackId && c.start >= oldEnd) {
          return { ...c, start: Math.max(0, c.start - durationSaved) };
        }
        return c;
      });

    return { ...project, clips: [...otherClips, ...generatedClips] };
  }

  // 'split' or 'mute' mode: Keep original positions on timeline
  const allSegments: { startSec: number; endSec: number; isSpeech: boolean }[] = [
    ...validSpeech.map((s) => ({ ...s, isSpeech: true })),
    ...validSilence.map((s) => ({ ...s, isSpeech: false })),
  ].sort((a, b) => a.startSec - b.startSec);

  for (let i = 0; i < allSegments.length; i++) {
    const seg = allSegments[i]!;
    const deltaFromSourceStart = (seg.startSec - clipSourceStartSec) / clip.speed;
    const segStartFrame = clip.start + Math.round(deltaFromSourceStart * fps);
    const segOffsetFrames = Math.max(0, Math.round(seg.startSec * fps));
    const segSourceDurationFrames = Math.max(1, Math.round((seg.endSec - seg.startSec) * fps));
    const segTimelineDurationFrames = Math.max(1, Math.round(segSourceDurationFrames / clip.speed));

    const subClip: Clip = {
      ...clip,
      id: i === 0 ? clip.id : newId('clip'),
      start: segStartFrame,
      duration: segTimelineDurationFrames,
      offset: segOffsetFrames,
      volume: !seg.isSpeech && mode === 'mute' ? 0 : clip.volume,
      muted: !seg.isSpeech && mode === 'mute' ? true : clip.muted,
      fadeIn: 0,
      fadeOut: 0,
      transform: { ...clip.transform },
      effects: clip.effects.map((e) => ({ ...e })),
      text: clip.text ? { ...clip.text } : null,
    };

    generatedClips.push(subClip);
  }

  const otherClips = project.clips.filter((c) => c.id !== clip.id);
  return { ...project, clips: [...otherClips, ...generatedClips] };
}

/**
 * Batch cut silence from multiple clips.
 */
export function removeSilenceFromClips(
  project: Project,
  assets: AssetMap,
  clipIds: readonly string[],
  speechMap: Map<string, SpeechInterval[]>,
  mode: SilenceCutMode = 'ripple',
): Project {
  let currentProject = project;
  // Process clips sorted in descending start order so earlier ripple shifts don't affect indices
  const sortedClips = [...currentProject.clips]
    .filter((c) => clipIds.includes(c.id))
    .sort((a, b) => b.start - a.start);

  for (const clip of sortedClips) {
    const speech = speechMap.get(clip.id);
    if (speech && speech.length > 0) {
      currentProject = removeSilenceFromClip(currentProject, assets, clip.id, speech, mode);
    }
  }

  return currentProject;
}
