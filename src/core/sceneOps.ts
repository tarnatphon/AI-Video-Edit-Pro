/**
 * Pure timeline operations for AI Scene / Shot detection.
 */

import { newId } from './id';
import type { SceneInterval } from './scene';
import { getClip, getTrack } from './timelineOps';
import type { Clip, Project } from './types';

/**
 * Split a clip on the timeline into sub-clips based on detected scene boundaries.
 */
export function splitClipIntoScenes(
  project: Project,
  clipId: string,
  scenes: readonly SceneInterval[],
): Project {
  const clip = getClip(project, clipId);
  if (!clip || scenes.length <= 1) return project;
  const track = getTrack(project, clip.trackId);
  if (!track || track.locked) return project;

  const fps = project.fps;
  const clipSourceStartSec = clip.offset / fps;
  const clipSourceEndSec = (clip.offset + clip.duration * clip.speed) / fps;

  // Filter scenes that fall within the clip's active source bounds
  const validScenes = scenes
    .map((s) => ({
      startSec: Math.max(clipSourceStartSec, s.startSec),
      endSec: Math.min(clipSourceEndSec, s.endSec),
    }))
    .filter((s) => s.endSec - s.startSec > 0.05)
    .sort((a, b) => a.startSec - b.startSec);

  if (validScenes.length <= 1) return project;

  const generatedClips: Clip[] = [];

  for (let i = 0; i < validScenes.length; i++) {
    const sc = validScenes[i]!;
    const deltaFromSourceStart = (sc.startSec - clipSourceStartSec) / clip.speed;
    const segStartFrame = clip.start + Math.round(deltaFromSourceStart * fps);
    const segOffsetFrames = Math.max(0, Math.round(sc.startSec * fps));
    const segSourceDurationFrames = Math.max(1, Math.round((sc.endSec - sc.startSec) * fps));
    const segTimelineDurationFrames = Math.max(1, Math.round(segSourceDurationFrames / clip.speed));

    const subClip: Clip = {
      ...clip,
      id: i === 0 ? clip.id : newId('clip'),
      name: `${clip.name} (Scene ${i + 1})`,
      start: segStartFrame,
      duration: segTimelineDurationFrames,
      offset: segOffsetFrames,
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
