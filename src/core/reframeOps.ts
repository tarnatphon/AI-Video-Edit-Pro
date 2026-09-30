/**
 * Pure timeline operations for Smart Reframe.
 */

import { newId } from './id';
import { calculateReframeTransform, type ReframeMode } from './reframe';
import { addTrack, setResolution, type AssetMap } from './timelineOps';
import type { Clip, Project } from './types';

/**
 * Reframe entire project to target resolution with selected mode.
 */
export function reframeProject(
  project: Project,
  assets: AssetMap,
  targetWidth: number,
  targetHeight: number,
  mode: ReframeMode,
  focusX = 0.5,
  focusY = 0.5,
): Project {
  let nextProject = setResolution(project, targetWidth, targetHeight);

  if (mode === 'blur-background') {
    // Add a background video track at the bottom of video tracks
    const bgTrackId = newId('trk');
    nextProject = addTrack(nextProject, 'video', bgTrackId);
    // Position background track just behind main video
    const videoTracks = nextProject.tracks.filter((t) => t.kind === 'video');
    const bgTrack = videoTracks.find((t) => t.id === bgTrackId);
    if (bgTrack) bgTrack.name = 'V-Blur';

    const bgClips: Clip[] = [];
    const mainClips: Clip[] = [];

    for (const clip of nextProject.clips) {
      if (clip.kind === 'video' || clip.kind === 'image') {
        const asset = clip.assetId ? assets[clip.assetId] : undefined;
        const srcW = asset?.width || 1920;
        const srcH = asset?.height || 1080;

        // Background blurred clip: scales to fill, blur effect added
        const bgTransform = calculateReframeTransform(srcW, srcH, targetWidth, targetHeight, 'auto-crop', 0.5, 0.5);
        const bgClip: Clip = {
          ...clip,
          id: newId('clip'),
          trackId: bgTrackId,
          name: `${clip.name} (Blur BG)`,
          volume: 0,
          muted: true,
          transform: {
            ...bgTransform,
            scale: bgTransform.scale * 1.1, // slightly extra zoom
            opacity: 0.65,
          },
          effects: [
            ...clip.effects,
            { id: newId('fx'), type: 'blur', value: 25, enabled: true },
          ],
        };
        bgClips.push(bgClip);

        // Foreground clip fits inside cleanly
        mainClips.push({
          ...clip,
          transform: {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            opacity: 1,
          },
        });
      } else {
        mainClips.push(clip);
      }
    }

    return {
      ...nextProject,
      clips: [...bgClips, ...mainClips],
    };
  }

  // 'auto-crop' or 'fit-letterbox'
  const updatedClips = nextProject.clips.map((clip) => {
    if (clip.kind !== 'video' && clip.kind !== 'image') return clip;
    const asset = clip.assetId ? assets[clip.assetId] : undefined;
    const srcW = asset?.width || 1920;
    const srcH = asset?.height || 1080;

    const transform = calculateReframeTransform(
      srcW,
      srcH,
      targetWidth,
      targetHeight,
      mode,
      focusX,
      focusY,
    );

    return {
      ...clip,
      transform,
    };
  });

  return {
    ...nextProject,
    clips: updatedClips,
  };
}
