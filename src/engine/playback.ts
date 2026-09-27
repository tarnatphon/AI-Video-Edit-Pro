/**
 * PlaybackEngine — the real-time clock + scheduler of the editor.
 *
 *  - Owns a `requestAnimationFrame` loop that (a) advances the playhead from a monotonic clock
 *    (`performance.now`) so playback speed never depends on render cost, (b) keeps every active
 *    media element aligned with the timeline, and (c) composites the current frame onto all
 *    attached canvases (preview + export).
 *  - Reads/writes editor state through the Zustand store, so UI and engine never drift apart.
 */

import { useEditorStore } from '../core/store';
import { activeClipOnTrack, projectDuration, sourceTimeAt } from '../core/timelineOps';
import type { Frames, MediaAsset, Project } from '../core/types';
import { AudioMixer } from './audioMixer';
import { Compositor } from './compositor';
import { SourcePool } from './sources';

type Store = typeof useEditorStore;

interface Clock {
  startedAt: number;
  startFrame: Frames;
}

export class PlaybackEngine {
  readonly mixer = new AudioMixer();
  private readonly compositor = new Compositor();
  private readonly pool: SourcePool;
  private readonly canvases = new Set<HTMLCanvasElement>();
  private readonly endedListeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private rafId: number | null = null;
  private dirty = true;
  private clock: Clock | null = null;
  private lastEngineFrame: Frames | null = null;
  private disposed = false;

  constructor(private readonly store: Store) {
    this.pool = new SourcePool(() => this.markDirty());
    this.unsubscribe = store.subscribe((state, prev) => {
      if (state.sessionVersion !== prev.sessionVersion) this.pool.disposeAll();
      else if (state.assets !== prev.assets) this.pool.prune(state.assets);

      if (state.project !== prev.project || state.playhead !== prev.playhead || state.assets !== prev.assets) {
        this.markDirty();
      }
      if (state.isPlaying !== prev.isPlaying) {
        if (state.isPlaying) this.startClock(state.playhead);
        else {
          this.clock = null;
          this.lastEngineFrame = null;
        }
      }
    });
    this.rafId = requestAnimationFrame(this.loop);
  }

  /* ----------------------------------- Canvases ----------------------------------- */

  attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvases.add(canvas);
    this.markDirty();
  }

  detachCanvas(canvas: HTMLCanvasElement): void {
    this.canvases.delete(canvas);
  }

  markDirty(): void {
    this.dirty = true;
  }

  /* ----------------------------------- Transport ---------------------------------- */

  /** Unlock audio + media elements. Call synchronously inside a user gesture. */
  unlockMedia(): void {
    this.mixer.ensure();
    this.pool.unlockAll();
  }

  play(): void {
    const state = this.store.getState();
    const duration = projectDuration(state.project);
    if (duration === 0) return;
    this.unlockMedia();
    if (state.playhead >= duration) state.setPlayhead(0);
    state.setPlaying(true);
  }

  pause(): void {
    this.store.getState().setPlaying(false);
  }

  toggle(): void {
    if (this.store.getState().isPlaying) this.pause();
    else this.play();
  }

  seek(frame: Frames): void {
    this.store.getState().setPlayhead(frame);
  }

  stepFrames(delta: Frames): void {
    const state = this.store.getState();
    state.setPlaying(false);
    const duration = projectDuration(state.project);
    state.setPlayhead(Math.min(Math.max(0, state.playhead + delta), Math.max(0, duration)));
  }

  /** Subscribe to "playback reached the end". Returns an unsubscribe function. */
  onEnded(listener: () => void): () => void {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  }

  /* ------------------------------------- Loop ------------------------------------- */

  private startClock(frame: Frames): void {
    this.clock = { startedAt: performance.now(), startFrame: frame };
    this.lastEngineFrame = frame;
  }

  private readonly loop = (now: number): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);

    const state = this.store.getState();
    const { project, assets } = state;
    let frame = state.playhead;

    if (state.isPlaying) {
      // An external seek (scrub while playing) re-bases the clock.
      if (!this.clock || (this.lastEngineFrame !== null && state.playhead !== this.lastEngineFrame)) {
        this.startClock(state.playhead);
      }
      const clock = this.clock!;
      const elapsed = (now - clock.startedAt) / 1000;
      frame = clock.startFrame + Math.floor(elapsed * project.fps);
      const end = projectDuration(project);

      if (frame >= end) {
        this.clock = null;
        this.lastEngineFrame = null;
        state.setPlayhead(end);
        state.setPlaying(false);
        this.syncSources(project, assets, end, false);
        this.renderAll(project, assets, end);
        this.dirty = false;
        for (const listener of [...this.endedListeners]) listener();
        return;
      }

      if (frame !== state.playhead) {
        this.lastEngineFrame = frame;
        state.setPlayhead(frame);
      }
    }

    this.syncSources(project, assets, frame, state.isPlaying);
    if (this.dirty || state.isPlaying) {
      this.renderAll(project, assets, frame);
      this.dirty = false;
    }
  };

  private syncSources(project: Project, assets: Readonly<Record<string, MediaAsset>>, frame: Frames, playing: boolean): void {
    const active = new Set<string>();
    for (const track of project.tracks) {
      const clip = activeClipOnTrack(project, track.id, frame);
      if (!clip || clip.kind === 'text' || !clip.assetId) continue;
      const asset = assets[clip.assetId];
      if (!asset || asset.missing || !asset.url) continue;
      const source = this.pool.acquire(clip.id, asset);
      if (!source) continue;
      active.add(clip.id);

      const element = source.mediaElement();
      if (element) {
        const audible = playing && !track.muted && !clip.muted;
        this.mixer.setElementGain(element, audible ? clip.volume : 0);
      }
      source.sync(sourceTimeAt(clip, frame, project.fps), playing, clip.speed);
    }
    this.pool.releaseAllExcept(active);
  }

  private renderAll(project: Project, assets: Readonly<Record<string, MediaAsset>>, frame: Frames): void {
    if (this.canvases.size === 0) return;
    const input = {
      project,
      assets,
      frame,
      resolveSource: (clip: { id: string }) => this.pool.peek(clip.id),
    };
    for (const canvas of this.canvases) {
      const ctx = canvas.getContext('2d');
      if (ctx) this.compositor.render(ctx, input);
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.unsubscribe();
    this.pool.disposeAll();
    this.mixer.dispose();
    this.canvases.clear();
    this.endedListeners.clear();
  }
}

let engine: PlaybackEngine | null = null;

/** Lazily created singleton (browser only). */
export function getEngine(): PlaybackEngine {
  engine ??= new PlaybackEngine(useEditorStore);
  return engine;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    engine?.dispose();
    engine = null;
  });
}
