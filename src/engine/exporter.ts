/**
 * Real-time export (MVP): plays the sequence once while a `MediaRecorder` captures the
 * full-resolution composite canvas + the Web Audio mix. Produces MP4 on Safari and WebM on
 * Chromium/Firefox. A frame-exact WebCodecs/mp4-muxer pipeline is the planned upgrade path.
 */

import { useEditorStore } from '../core/store';
import { projectDuration } from '../core/timelineOps';
import type { PlaybackEngine } from './playback';

export interface ExportResult {
  blob: Blob;
  extension: string;
  mimeType: string;
}

export interface ExportOptions {
  /** Longest side is capped to this many pixels to keep real-time encoding smooth. */
  maxDimension?: number;
  videoBitsPerSecond?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function exportSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

export function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const candidate of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate)) return candidate;
    } catch {
      /* continue */
    }
  }
  return null;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export async function exportRealtime(engine: PlaybackEngine, options: ExportOptions = {}): Promise<ExportResult> {
  if (!exportSupported()) throw new Error('This browser cannot record video (MediaRecorder unavailable).');
  const mimeType = pickMimeType();
  if (!mimeType) throw new Error('No supported video container found for recording.');

  // Synchronous part (still inside the user's click) — unlock audio + media elements.
  engine.unlockMedia();

  const store = useEditorStore;
  const initial = store.getState();
  const duration = projectDuration(initial.project);
  if (duration === 0) throw new Error('The timeline is empty.');

  const maxDimension = options.maxDimension ?? 1920;
  const scale = Math.min(1, maxDimension / Math.max(initial.project.width, initial.project.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round((initial.project.width * scale) / 2) * 2);
  canvas.height = Math.max(2, Math.round((initial.project.height * scale) / 2) * 2);

  const stream = canvas.captureStream(initial.project.fps);
  const audio = engine.mixer.captureStream();
  if (audio) for (const track of audio.getAudioTracks()) stream.addTrack(track);

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: options.videoBitsPerSecond ?? 12_000_000,
    audioBitsPerSecond: 192_000,
  });
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.addEventListener('stop', () => resolve(), { once: true });
    recorder.addEventListener('error', () => reject(new Error('Recording failed.')), { once: true });
  });

  engine.pause();
  engine.seek(0);
  engine.attachCanvas(canvas);
  await nextFrame();
  await nextFrame();

  const unsubscribeProgress = store.subscribe((state) => {
    options.onProgress?.(Math.min(1, state.playhead / duration));
  });

  let cleanupAbort: (() => void) | undefined;
  try {
    recorder.start(250);
    engine.play();
    if (!store.getState().isPlaying) throw new Error('Playback could not start.');

    await new Promise<void>((resolve, reject) => {
      const offEnded = engine.onEnded(() => {
        offEnded();
        resolve();
      });
      const onAbort = (): void => {
        offEnded();
        reject(new DOMException('Export cancelled', 'AbortError'));
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });
      cleanupAbort = () => options.signal?.removeEventListener('abort', onAbort);
    });

    // Let the last frame reach the recorder before stopping.
    await nextFrame();
    recorder.stop();
    await stopped;
  } finally {
    cleanupAbort?.();
    unsubscribeProgress();
    engine.pause();
    engine.detachCanvas(canvas);
    if (recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    // Only stop the canvas capture; the mixer's audio track is shared with future exports.
    for (const track of stream.getVideoTracks()) track.stop();
  }

  const container = mimeType.split(';')[0] ?? 'video/webm';
  return {
    blob: new Blob(chunks, { type: container }),
    extension: container.includes('mp4') ? 'mp4' : 'webm',
    mimeType: container,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
