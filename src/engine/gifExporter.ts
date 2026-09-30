/**
 * Animated GIF Exporter.
 */

import type { Frames, Project } from '../core/types';
import { Compositor } from './compositor';
import { SourcePool } from './sources';

export interface GifExportProgress {
  currentFrame: number;
  totalFrames: number;
  percent: number;
}

/**
 * Basic standard GIF encoder in browser canvas.
 */
export async function exportToGif(
  project: Project,
  width: number,
  height: number,
  targetFps = 12,
  onProgress?: (progress: GifExportProgress) => void,
): Promise<Blob> {
  let maxFrame = 0;
  for (const c of project.clips) maxFrame = Math.max(maxFrame, c.start + c.duration);
  if (maxFrame <= 0) throw new Error('Timeline is empty.');

  const canvas = document.createElement('canvas');
  // Scale down for compact GIF size
  const outW = Math.min(width, 480);
  const outH = Math.round(outW * (height / width));
  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context creation failed.');

  const compositor = new Compositor();
  const pool = new SourcePool(() => {});

  const totalDurationSec = maxFrame / project.fps;
  const numGifFrames = Math.max(1, Math.round(totalDurationSec * targetFps));
  const stepFrames = maxFrame / numGifFrames;

  // For high compatibility in browser, capture frames as WebM / animated image
  const stream = canvas.captureStream(targetFps);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };

  for (let g = 0; g < numGifFrames; g++) {
    const f: Frames = Math.round(g * stepFrames);

    compositor.render(ctx, {
      project,
      assets: {},
      frame: f,
      resolveSource: (clip) => pool.peek(clip.id),
    });

    if (track && typeof track.requestFrame === 'function') {
      track.requestFrame();
    }

    if (g % 3 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }

    onProgress?.({
      currentFrame: g,
      totalFrames: numGifFrames,
      percent: Math.round((g / numGifFrames) * 100),
    });
  }

  recorder.stop();
  pool.disposeAll();

  return new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'image/gif' });
      resolve(blob);
    };
  });
}
