import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { MAX_PX_PER_SECOND, MIN_PX_PER_SECOND, selectDuration, useEditorStore } from '../../core/store';
import { clamp } from '../../core/time';
import { clipEnd } from '../../core/timelineOps';
import type { Frames } from '../../core/types';
import { importFiles } from '../../engine/importer';
import { getEngine } from '../../engine/playback';
import { useIsCoarsePointer } from '../hooks/useMediaQuery';
import { ASSET_DRAG_TYPE } from '../media/MediaLibrary';
import { TimelineClip } from './TimelineClip';
import { TimelineRuler } from './TimelineRuler';
import { TimelineToolbar } from './TimelineToolbar';
import { TrackHeader } from './TrackHeader';
import { DRAG_THRESHOLD_PX, HEADER_W, RULER_H, TimelineContext, TRACK_HEIGHT, type TimelineContextValue } from './timelineContext';

interface TouchPointer {
  x: number;
  y: number;
}

interface PanState {
  scrollLeft: number;
  scrollTop: number;
  x: number;
  y: number;
}

interface PinchState {
  distance: number;
  pxPerSecond: number;
}

interface PressState {
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  moved: boolean;
  /** Mouse/pen scrubbing in empty lane space. */
  scrubbing: boolean;
}

export function Timeline() {
  const project = useEditorStore((s) => s.project);
  const assets = useEditorStore((s) => s.assets);
  const pxPerSecond = useEditorStore((s) => s.pxPerSecond);
  const playhead = useEditorStore((s) => s.playhead);
  const isPlaying = useEditorStore((s) => s.isPlaying);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const duration = useEditorStore(selectDuration);
  const isCoarsePointer = useIsCoarsePointer();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const laneRefs = useRef(new Map<string, HTMLDivElement>());
  const pointers = useRef(new Map<number, TouchPointer>());
  const pan = useRef<PanState | null>(null);
  const pinch = useRef<PinchState | null>(null);
  const press = useRef<PressState | null>(null);
  const pendingScrollLeft = useRef<number | null>(null);

  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [scrollLeft, setScrollLeft] = useState(0);
  const [snapGuide, setSnapGuide] = useState<Frames | null>(null);
  const [dropHint, setDropHint] = useState(false);

  const fps = project.fps;
  const pxPerFrame = pxPerSecond / fps;
  const laneViewportWidth = Math.max(0, viewport.width - HEADER_W);
  const laneWidth = Math.max(laneViewportWidth, (duration / fps) * pxPerSecond + Math.max(laneViewportWidth * 0.6, 10 * pxPerSecond));

  /* ------------------------------------------------------------------ measurements */

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const measure = (): void => setViewport({ width: scroller.clientWidth, height: scroller.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (scroller) setScrollLeft(scroller.scrollLeft);
  }, []);

  // Apply the scroll offset computed by an anchored zoom once the wider content has rendered.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || pendingScrollLeft.current === null) return;
    scroller.scrollLeft = Math.max(0, pendingScrollLeft.current);
    pendingScrollLeft.current = null;
    setScrollLeft(scroller.scrollLeft);
  }, [pxPerSecond]);

  /* ------------------------------------------------------------------ zoom */

  const zoomAt = useCallback(
    (nextPxPerSecond: number, clientX: number | null) => {
      const scroller = scrollerRef.current;
      const state = useEditorStore.getState();
      const clamped = clamp(nextPxPerSecond, MIN_PX_PER_SECOND, MAX_PX_PER_SECOND);
      if (clamped === state.pxPerSecond) return;
      if (scroller) {
        const rect = scroller.getBoundingClientRect();
        const anchorPx = clientX === null ? laneViewportWidth / 2 : clamp(clientX - rect.left - HEADER_W, 0, laneViewportWidth);
        const anchorSeconds = (scroller.scrollLeft + anchorPx) / state.pxPerSecond;
        pendingScrollLeft.current = anchorSeconds * clamped - anchorPx;
      }
      state.setPxPerSecond(clamped);
    },
    [laneViewportWidth],
  );

  // Wheel: ⌘/Ctrl + wheel (and trackpad pinch) zooms; plain wheel scrolls horizontally; Alt scrolls vertically.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onWheel = (event: WheelEvent): void => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const factor = Math.exp(-event.deltaY * 0.01);
        zoomAt(useEditorStore.getState().pxPerSecond * factor, event.clientX);
        return;
      }
      if (event.altKey) return;
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault();
        scroller.scrollLeft += event.deltaY;
      }
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    return () => scroller.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  /* ------------------------------------------------------------------ playhead follow */

  useEffect(() => {
    if (!isPlaying) return;
    const scroller = scrollerRef.current;
    if (!scroller || laneViewportWidth <= 0) return;
    const x = playhead * pxPerFrame;
    const left = scroller.scrollLeft;
    if (x < left || x > left + laneViewportWidth - 24) {
      scroller.scrollLeft = Math.max(0, x - 48);
    }
  }, [playhead, isPlaying, pxPerFrame, laneViewportWidth]);

  /* ------------------------------------------------------------------ helpers */

  const frameFromClientX = useCallback(
    (clientX: number): Frames => {
      const scroller = scrollerRef.current;
      if (!scroller) return 0;
      const rect = scroller.getBoundingClientRect();
      const laneX = scroller.scrollLeft + (clientX - rect.left) - HEADER_W;
      return Math.max(0, Math.round(laneX / pxPerFrame));
    },
    [pxPerFrame],
  );

  const trackAt = useCallback((clientY: number): string | null => {
    for (const [trackId, element] of laneRefs.current) {
      const rect = element.getBoundingClientRect();
      if (clientY >= rect.top && clientY < rect.bottom) return trackId;
    }
    return null;
  }, []);

  const scrubTo = useCallback((frame: Frames) => {
    getEngine().seek(frame);
  }, []);

  const context = useMemo<TimelineContextValue>(
    () => ({ pxPerFrame, fps, trackAt, setSnapGuide, isCoarsePointer }),
    [pxPerFrame, fps, trackAt, isCoarsePointer],
  );

  /* ------------------------------------------------------------------ scroller gestures (empty space) */

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    if (event.pointerType === 'touch') {
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      scroller.setPointerCapture(event.pointerId);
      if (pointers.current.size === 1) {
        pan.current = { scrollLeft: scroller.scrollLeft, scrollTop: scroller.scrollTop, x: event.clientX, y: event.clientY };
        pinch.current = null;
        press.current = { pointerId: event.pointerId, pointerType: 'touch', x: event.clientX, y: event.clientY, moved: false, scrubbing: false };
      } else if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        pinch.current = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), pxPerSecond: useEditorStore.getState().pxPerSecond };
        pan.current = null;
        press.current = null;
      }
      return;
    }

    // Mouse / pen in empty lane space: click sets the playhead, drag scrubs.
    const rect = scroller.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    const onScrollbar = localX >= scroller.clientWidth || localY >= scroller.clientHeight;
    const inLanes = !onScrollbar && localX >= HEADER_W && localY >= RULER_H;
    if (!inLanes) return;
    scroller.setPointerCapture(event.pointerId);
    press.current = { pointerId: event.pointerId, pointerType: event.pointerType, x: event.clientX, y: event.clientY, moved: false, scrubbing: true };
    useEditorStore.getState().clearSelection();
    scrubTo(frameFromClientX(event.clientX));
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    if (event.pointerType === 'touch') {
      if (!pointers.current.has(event.pointerId)) return;
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (pointers.current.size >= 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()];
        const distance = Math.hypot(a!.x - b!.x, a!.y - b!.y);
        if (pinch.current.distance > 0) {
          zoomAt(pinch.current.pxPerSecond * (distance / pinch.current.distance), (a!.x + b!.x) / 2);
        }
        return;
      }

      if (pan.current) {
        const dx = event.clientX - pan.current.x;
        const dy = event.clientY - pan.current.y;
        if (press.current && !press.current.moved && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
          press.current.moved = true;
        }
        scroller.scrollLeft = pan.current.scrollLeft - dx;
        scroller.scrollTop = pan.current.scrollTop - dy;
      }
      return;
    }

    const state = press.current;
    if (!state || state.pointerId !== event.pointerId || !state.scrubbing) return;
    if (!state.moved && Math.abs(event.clientX - state.x) < DRAG_THRESHOLD_PX) return;
    state.moved = true;
    scrubTo(frameFromClientX(event.clientX));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const scroller = scrollerRef.current;
    if (scroller?.hasPointerCapture(event.pointerId)) scroller.releasePointerCapture(event.pointerId);

    if (event.pointerType === 'touch') {
      pointers.current.delete(event.pointerId);
      const tap = press.current;
      if (tap && tap.pointerId === event.pointerId && !tap.moved && pointers.current.size === 0) {
        const rect = scroller?.getBoundingClientRect();
        if (rect && event.clientX - rect.left >= HEADER_W && event.clientY - rect.top >= RULER_H) {
          useEditorStore.getState().clearSelection();
          scrubTo(frameFromClientX(event.clientX));
        }
      }
      if (pointers.current.size === 1 && scroller) {
        const [remaining] = [...pointers.current.values()];
        pan.current = { scrollLeft: scroller.scrollLeft, scrollTop: scroller.scrollTop, x: remaining!.x, y: remaining!.y };
        pinch.current = null;
      } else if (pointers.current.size === 0) {
        pan.current = null;
        pinch.current = null;
      }
      if (tap && tap.pointerId === event.pointerId) press.current = null;
      return;
    }

    if (press.current?.pointerId === event.pointerId) press.current = null;
  };

  /* ------------------------------------------------------------------ drag & drop from library / OS */

  const onDragOver = (event: DragEvent<HTMLDivElement>): void => {
    const types = event.dataTransfer.types;
    if (types.includes(ASSET_DRAG_TYPE) || types.includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (!dropHint) setDropHint(true);
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDropHint(false);
    const frame = frameFromClientX(event.clientX);
    const trackId = trackAt(event.clientY);
    const store = useEditorStore.getState();

    const assetId = event.dataTransfer.getData(ASSET_DRAG_TYPE);
    if (assetId) {
      const preferred = trackId ? store.project.tracks.find((t) => t.id === trackId) : undefined;
      const asset = store.assets[assetId];
      const compatible = preferred && asset && (asset.kind === 'audio' ? preferred.kind === 'audio' : preferred.kind === 'video');
      store.addClipFromAsset(assetId, compatible ? { trackId: preferred.id, start: frame } : { start: frame });
      return;
    }

    if (event.dataTransfer.files.length > 0) {
      void importFiles(Array.from(event.dataTransfer.files)).then((outcome) => {
        let cursor = frame;
        for (const id of outcome.imported) {
          const clipId = useEditorStore.getState().addClipFromAsset(id, { start: cursor });
          const clip = clipId ? useEditorStore.getState().project.clips.find((c) => c.id === clipId) : undefined;
          if (clip) cursor = clipEnd(clip);
        }
      });
    }
  };

  /* ------------------------------------------------------------------ render */

  const visibleStart = scrollLeft / pxPerFrame - 200 / pxPerFrame;
  const visibleEnd = (scrollLeft + laneViewportWidth + 200) / pxPerFrame;
  const selected = useMemo(() => new Set(selectedClipIds), [selectedClipIds]);
  const totalTrackHeight = project.tracks.reduce((sum, t) => sum + TRACK_HEIGHT[t.kind], 0);
  const playheadX = HEADER_W + playhead * pxPerFrame;

  return (
    <TimelineContext.Provider value={context}>
      <div className="flex h-full min-h-0 flex-col bg-neutral-950">
        <TimelineToolbar onZoom={(factor) => zoomAt(pxPerSecond * factor, null)} />
        <div
          ref={scrollerRef}
          className={`timeline-scroller thin-scrollbar relative flex-1 overflow-auto ${dropHint ? 'ring-2 ring-inset ring-accent' : ''}`}
          onScroll={onScroll}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDragOver={onDragOver}
          onDragLeave={() => setDropHint(false)}
          onDrop={onDrop}
        >
          <div className="relative" style={{ width: HEADER_W + laneWidth, minHeight: '100%' }}>
            {/* Ruler row (sticky top) */}
            <div className="sticky top-0 z-30 flex" style={{ height: RULER_H }}>
              <div className="sticky left-0 z-40 shrink-0 border-r border-b border-line bg-panel" style={{ width: HEADER_W }} />
              <div className="relative flex-1 overflow-hidden border-b border-line bg-panel">
                <TimelineRuler
                  scrollLeft={scrollLeft}
                  viewportWidth={laneViewportWidth}
                  pxPerSecond={pxPerSecond}
                  fps={fps}
                  playheadFrame={playhead}
                  durationFrames={duration}
                  onScrub={scrubTo}
                />
              </div>
            </div>

            {/* Tracks */}
            {project.tracks.map((track) => {
              const height = TRACK_HEIGHT[track.kind];
              const trackClipList = project.clips.filter((c) => c.trackId === track.id);
              return (
                <div key={track.id} className="flex" style={{ height }}>
                  <TrackHeader track={track} height={height} isEmpty={trackClipList.length === 0} />
                  <div
                    ref={(el) => {
                      if (el) laneRefs.current.set(track.id, el);
                      else laneRefs.current.delete(track.id);
                    }}
                    data-track-id={track.id}
                    className={`relative flex-1 border-b border-line ${track.kind === 'video' ? 'bg-neutral-900/40' : 'bg-neutral-900/20'} ${
                      track.locked ? 'bg-[repeating-linear-gradient(45deg,transparent,transparent_10px,rgba(255,255,255,0.03)_10px,rgba(255,255,255,0.03)_20px)]' : ''
                    }`}
                  >
                    {trackClipList
                      .filter((c) => clipEnd(c) >= visibleStart && c.start <= visibleEnd)
                      .map((clip) => (
                        <TimelineClip
                          key={clip.id}
                          clip={clip}
                          asset={clip.assetId ? assets[clip.assetId] : undefined}
                          selected={selected.has(clip.id)}
                          locked={track.locked}
                        />
                      ))}
                  </div>
                </div>
              );
            })}

            {/* Snap guide */}
            {snapGuide !== null && (
              <div
                className="pointer-events-none absolute z-10 w-px bg-amber-300"
                style={{ left: HEADER_W + snapGuide * pxPerFrame, top: RULER_H, height: totalTrackHeight }}
              />
            )}

            {/* Playhead */}
            <div
              className="pointer-events-none absolute z-10 w-px bg-rose-500"
              style={{ left: playheadX, top: RULER_H, height: totalTrackHeight }}
            />
          </div>
        </div>
      </div>
    </TimelineContext.Provider>
  );
}
