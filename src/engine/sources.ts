/**
 * Frame sources: decode media into something `drawImage` accepts.
 *
 * The default implementation uses hardware-accelerated `<video>` / `<audio>` / `<img>` elements
 * because they work on every platform we target (Chrome, Edge, Firefox, Safari on macOS + iPadOS,
 * Android). The `FrameSource` interface is deliberately small so that a WebCodecs-based decoder
 * (`VideoDecoder` + MP4 demuxer) can be dropped in later without touching the compositor.
 */

import { clamp } from '../core/time';
import type { MediaAsset, MediaKind } from '../core/types';

/** How far (seconds) a playing element may drift from the timeline before we hard-seek it. */
const RESYNC_TOLERANCE = 0.12;
/** Seek precision when paused / scrubbing (seconds). */
const SEEK_TOLERANCE = 0.008;
/** If a seek never reports `seeked` (rare browser bug) reset the flag after this many ms. */
const SEEK_WATCHDOG_MS = 1500;
/** Max idle (paused, not bound to a clip) sources kept per asset. */
const IDLE_PER_ASSET = 2;

export interface FrameSource {
  readonly assetId: string;
  readonly kind: MediaKind;
  readonly url: string;
  /** True when a frame can be drawn right now. */
  ready(): boolean;
  image(): CanvasImageSource | null;
  naturalWidth(): number;
  naturalHeight(): number;
  /** Align the source with the timeline. `sourceTime` in seconds, `rate` = clip speed. */
  sync(sourceTime: number, playing: boolean, rate: number): void;
  /** The clip left the playhead: stop playback but keep decoded state around. */
  deactivate(): void;
  mediaElement(): HTMLMediaElement | null;
  /** Call synchronously inside a user gesture to satisfy autoplay policies (iOS Safari). */
  unlock(): void;
  dispose(): void;
}

abstract class MediaElementSource<T extends HTMLMediaElement> implements FrameSource {
  protected readonly el: T;
  private loaded = false;
  private seeking = false;
  private seekStartedAt = 0;
  private pendingSeek: number | null = null;
  private playRequest: Promise<void> | null = null;
  private wantPlaying = false;
  private unlocked = false;
  private disposed = false;

  protected constructor(
    readonly assetId: string,
    readonly url: string,
    el: T,
    private readonly notify: () => void,
  ) {
    this.el = el;
    el.preload = 'auto';
    el.controls = false;
    el.loop = false;
    el.src = url;
    el.addEventListener('loadeddata', this.handleLoaded);
    el.addEventListener('seeked', this.handleSeeked);
    el.addEventListener('error', this.handleError);
    el.load();
  }

  abstract readonly kind: MediaKind;
  abstract image(): CanvasImageSource | null;
  abstract naturalWidth(): number;
  abstract naturalHeight(): number;

  private readonly handleLoaded = (): void => {
    this.loaded = true;
    this.notify();
  };

  private readonly handleSeeked = (): void => {
    this.seeking = false;
    this.notify();
    if (this.pendingSeek !== null) {
      const next = this.pendingSeek;
      this.pendingSeek = null;
      this.seekTo(next);
    }
  };

  private readonly handleError = (): void => {
    this.loaded = false;
    this.notify();
  };

  ready(): boolean {
    return !this.disposed && this.loaded && this.el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
  }

  mediaElement(): HTMLMediaElement | null {
    return this.el;
  }

  private seekTo(time: number): void {
    if (this.seeking) {
      this.pendingSeek = time;
      return;
    }
    this.seeking = true;
    this.seekStartedAt = performance.now();
    try {
      this.el.currentTime = time;
    } catch {
      this.seeking = false;
    }
  }

  private clampToMedia(time: number): number {
    const duration = this.el.duration;
    if (Number.isFinite(duration) && duration > 0) return clamp(time, 0, Math.max(0, duration - 0.001));
    return Math.max(0, time);
  }

  sync(sourceTime: number, playing: boolean, rate: number): void {
    if (this.disposed) return;
    const el = this.el;
    const target = this.clampToMedia(sourceTime);

    if (this.seeking && performance.now() - this.seekStartedAt > SEEK_WATCHDOG_MS) {
      this.seeking = false;
    }

    this.wantPlaying = playing;
    if (playing) {
      const wantedRate = clamp(rate, 0.0625, 16);
      if (Math.abs(el.playbackRate - wantedRate) > 1e-3) el.playbackRate = wantedRate;
      if (Math.abs(el.currentTime - target) > RESYNC_TOLERANCE) this.seekTo(target);
      if (el.paused && this.playRequest === null) {
        const request = el.play();
        if (request) {
          this.playRequest = request
            .catch(() => undefined)
            .finally(() => {
              this.playRequest = null;
            });
        }
      }
      return;
    }

    if (!el.paused) el.pause();
    if (Math.abs(el.currentTime - target) > SEEK_TOLERANCE) this.seekTo(target);
  }

  deactivate(): void {
    this.wantPlaying = false;
    if (!this.disposed && !this.el.paused) this.el.pause();
  }

  unlock(): void {
    if (this.unlocked || this.disposed) return;
    this.unlocked = true;
    const el = this.el;
    const request = el.play();
    if (!request) return;
    request
      .then(() => {
        if (!this.wantPlaying) el.pause();
      })
      .catch(() => {
        this.unlocked = false;
      });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const el = this.el;
    el.removeEventListener('loadeddata', this.handleLoaded);
    el.removeEventListener('seeked', this.handleSeeked);
    el.removeEventListener('error', this.handleError);
    el.pause();
    el.removeAttribute('src');
    el.load();
  }
}

export class VideoElementSource extends MediaElementSource<HTMLVideoElement> {
  readonly kind = 'video' as const;

  constructor(assetId: string, url: string, notify: () => void) {
    const el = document.createElement('video');
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    el.disableRemotePlayback = true;
    super(assetId, url, el, notify);
  }

  image(): CanvasImageSource | null {
    return this.ready() ? this.el : null;
  }

  naturalWidth(): number {
    return this.el.videoWidth;
  }

  naturalHeight(): number {
    return this.el.videoHeight;
  }
}

export class AudioElementSource extends MediaElementSource<HTMLAudioElement> {
  readonly kind = 'audio' as const;

  constructor(assetId: string, url: string, notify: () => void) {
    super(assetId, url, document.createElement('audio'), notify);
  }

  image(): CanvasImageSource | null {
    return null;
  }

  naturalWidth(): number {
    return 0;
  }

  naturalHeight(): number {
    return 0;
  }
}

export class ImageSource implements FrameSource {
  readonly kind = 'image' as const;
  private readonly el: HTMLImageElement;
  private disposed = false;

  constructor(
    readonly assetId: string,
    readonly url: string,
    notify: () => void,
  ) {
    const el = new Image();
    el.decoding = 'async';
    el.addEventListener('load', notify);
    el.src = url;
    this.el = el;
  }

  ready(): boolean {
    return !this.disposed && this.el.complete && this.el.naturalWidth > 0;
  }

  image(): CanvasImageSource | null {
    return this.ready() ? this.el : null;
  }

  naturalWidth(): number {
    return this.el.naturalWidth;
  }

  naturalHeight(): number {
    return this.el.naturalHeight;
  }

  sync(): void {
    /* static */
  }

  deactivate(): void {
    /* static */
  }

  mediaElement(): HTMLMediaElement | null {
    return null;
  }

  unlock(): void {
    /* nothing to unlock */
  }

  dispose(): void {
    this.disposed = true;
    this.el.src = '';
  }
}

export function createSource(asset: MediaAsset, notify: () => void): FrameSource {
  switch (asset.kind) {
    case 'video':
      return new VideoElementSource(asset.id, asset.url, notify);
    case 'audio':
      return new AudioElementSource(asset.id, asset.url, notify);
    case 'image':
      return new ImageSource(asset.id, asset.url, notify);
  }
}

/**
 * Binds sources to *clips* while they are under the playhead, recycling them per asset.
 * Two clips of the same asset can be active at once (e.g. picture-in-picture) — each gets its
 * own element. Memory is bounded by `IDLE_PER_ASSET`.
 */
export class SourcePool {
  private readonly byClip = new Map<string, FrameSource>();
  private readonly idle = new Map<string, FrameSource[]>();

  constructor(private readonly notify: () => void) {}

  acquire(clipId: string, asset: MediaAsset): FrameSource | null {
    if (!asset.url) return null;
    const existing = this.byClip.get(clipId);
    if (existing) {
      if (existing.assetId === asset.id && existing.url === asset.url) return existing;
      this.release(clipId);
    }

    const idleList = this.idle.get(asset.id);
    let source: FrameSource | undefined;
    if (idleList) {
      const index = idleList.findIndex((s) => s.url === asset.url);
      if (index >= 0) source = idleList.splice(index, 1)[0];
      if (idleList.length === 0) this.idle.delete(asset.id);
    }
    source ??= createSource(asset, this.notify);
    this.byClip.set(clipId, source);
    return source;
  }

  /** The source currently bound to a clip (only active clips have one). */
  peek(clipId: string): FrameSource | null {
    return this.byClip.get(clipId) ?? null;
  }

  release(clipId: string): void {
    const source = this.byClip.get(clipId);
    if (!source) return;
    this.byClip.delete(clipId);
    source.deactivate();
    const list = this.idle.get(source.assetId) ?? [];
    if (list.length >= IDLE_PER_ASSET) {
      source.dispose();
      return;
    }
    list.push(source);
    this.idle.set(source.assetId, list);
  }

  releaseAllExcept(activeClipIds: ReadonlySet<string>): void {
    for (const clipId of [...this.byClip.keys()]) {
      if (!activeClipIds.has(clipId)) this.release(clipId);
    }
  }

  /** Drop sources whose asset disappeared or changed URL. */
  prune(assets: Readonly<Record<string, MediaAsset>>): void {
    const stale = (source: FrameSource): boolean => {
      const asset = assets[source.assetId];
      return !asset || asset.url !== source.url;
    };
    for (const [clipId, source] of [...this.byClip]) {
      if (stale(source)) {
        this.byClip.delete(clipId);
        source.dispose();
      }
    }
    for (const [assetId, list] of [...this.idle]) {
      const keep = list.filter((s) => {
        if (stale(s)) {
          s.dispose();
          return false;
        }
        return true;
      });
      if (keep.length === 0) this.idle.delete(assetId);
      else this.idle.set(assetId, keep);
    }
  }

  unlockAll(): void {
    for (const source of this.all()) source.unlock();
  }

  all(): FrameSource[] {
    const result = [...this.byClip.values()];
    for (const list of this.idle.values()) result.push(...list);
    return result;
  }

  disposeAll(): void {
    for (const source of this.all()) source.dispose();
    this.byClip.clear();
    this.idle.clear();
  }
}
