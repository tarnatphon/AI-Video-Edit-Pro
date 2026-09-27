/**
 * Media probing: duration, dimensions and a thumbnail — using the browser's own decoders.
 */

import type { MediaKind } from '../core/types';

export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  thumbnail: string | null;
  hasAudio: boolean;
}

const THUMB_W = 160;
const THUMB_H = 90;
const METADATA_TIMEOUT_MS = 20_000;
const SEEK_TIMEOUT_MS = 8_000;

const EXTENSION_KIND: Record<string, MediaKind> = {
  mp4: 'video', m4v: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video', ogv: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', ogg: 'audio', oga: 'audio', flac: 'audio', opus: 'audio',
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', avif: 'image', bmp: 'image', heic: 'image',
};

export function detectKind(file: File): MediaKind | null {
  const type = file.type.toLowerCase();
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type.startsWith('image/')) return 'image';
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_KIND[ext] ?? null;
}

function waitFor<T extends EventTarget>(target: T, okEvent: string, timeoutMs: number, errorEvent = 'error'): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      target.removeEventListener(okEvent, onOk);
      target.removeEventListener(errorEvent, onError);
      window.clearTimeout(timer);
    };
    const onOk = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error(`${errorEvent} while waiting for ${okEvent}`));
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${okEvent}`));
    }, timeoutMs);
    target.addEventListener(okEvent, onOk, { once: true });
    target.addEventListener(errorEvent, onError, { once: true });
  });
}

/** MediaRecorder-produced WebM files report `Infinity`; seeking far ahead forces the real value. */
async function resolveDuration(el: HTMLMediaElement): Promise<number> {
  if (Number.isFinite(el.duration) && el.duration > 0) return el.duration;
  try {
    const settled = waitFor(el, 'durationchange', 4_000);
    el.currentTime = 1e101;
    await settled;
  } catch {
    /* fall through */
  }
  const duration = el.duration;
  el.currentTime = 0;
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function makeThumbnail(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): string | null {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    draw(ctx, THUMB_W, THUMB_H);
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return null;
  }
}

function drawContain(ctx: CanvasRenderingContext2D, image: CanvasImageSource, iw: number, ih: number, w: number, h: number): void {
  if (iw <= 0 || ih <= 0) return;
  const fit = Math.min(w / iw, h / ih);
  const dw = iw * fit;
  const dh = ih * fit;
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

async function probeVideo(url: string): Promise<ProbeResult> {
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.src = url;
  try {
    await waitFor(video, 'loadedmetadata', METADATA_TIMEOUT_MS);
    const duration = await resolveDuration(video);
    const width = video.videoWidth;
    const height = video.videoHeight;

    let thumbnail: string | null = null;
    try {
      const seekTo = Math.min(1, duration * 0.1);
      const seeked = waitFor(video, 'seeked', SEEK_TIMEOUT_MS);
      video.currentTime = seekTo;
      await seeked;
      thumbnail = makeThumbnail((ctx, w, h) => drawContain(ctx, video, width, height, w, h));
    } catch {
      thumbnail = null;
    }

    return { duration, width, height, thumbnail, hasAudio: true };
  } finally {
    video.removeAttribute('src');
    video.load();
  }
}

async function probeAudio(url: string): Promise<ProbeResult> {
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = url;
  try {
    await waitFor(audio, 'loadedmetadata', METADATA_TIMEOUT_MS);
    const duration = await resolveDuration(audio);
    return { duration, width: 0, height: 0, thumbnail: null, hasAudio: true };
  } finally {
    audio.removeAttribute('src');
    audio.load();
  }
}

async function probeImage(url: string): Promise<ProbeResult> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await waitFor(image, 'load', METADATA_TIMEOUT_MS);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const thumbnail = makeThumbnail((ctx, w, h) => drawContain(ctx, image, width, height, w, h));
  return { duration: 0, width, height, thumbnail, hasAudio: false };
}

export function probeMedia(kind: MediaKind, url: string): Promise<ProbeResult> {
  switch (kind) {
    case 'video':
      return probeVideo(url);
    case 'audio':
      return probeAudio(url);
    case 'image':
      return probeImage(url);
  }
}
