import { memo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { collectSnapTargets, snapClipMove, snapFrame, snapThresholdFrames } from '../../core/snapping';
import { useEditorStore } from '../../core/store';
import { clipEnd } from '../../core/timelineOps';
import type { Clip, Frames, MediaAsset } from '../../core/types';
import { DRAG_THRESHOLD_PX, SNAP_PX, useTimelineContext } from './timelineContext';
import { WaveformCanvas } from './WaveformCanvas';

type DragMode = 'move' | 'trim-start' | 'trim-end';

interface DragState {
  pointerId: number;
  mode: DragMode;
  startX: number;
  startY: number;
  origin: { start: Frames; duration: Frames; trackId: string };
  moved: boolean;
}

interface TimelineClipProps {
  clip: Clip;
  asset: MediaAsset | undefined;
  selected: boolean;
  locked: boolean;
}

const KIND_STYLE: Record<Clip['kind'], { bg: string; text: string; wave: string }> = {
  video: { bg: 'bg-indigo-950/90', text: 'text-indigo-100', wave: 'rgba(165,180,252,0.55)' },
  image: { bg: 'bg-amber-950/90', text: 'text-amber-100', wave: '' },
  text: { bg: 'bg-fuchsia-950/90', text: 'text-fuchsia-100', wave: '' },
  audio: { bg: 'bg-emerald-950/90', text: 'text-emerald-100', wave: 'rgba(110,231,183,0.75)' },
};

export const TimelineClip = memo(function TimelineClip({ clip, asset, selected, locked }: TimelineClipProps) {
  const { pxPerFrame, fps, trackAt, setSnapGuide, isCoarsePointer } = useTimelineContext();
  const drag = useRef<DragState | null>(null);

  const left = clip.start * pxPerFrame;
  const width = Math.max(2, clip.duration * pxPerFrame);
  const handleWidth = Math.min(isCoarsePointer ? 22 : 10, Math.max(4, width / 4));
  const style = KIND_STYLE[clip.kind];

  const finishDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    drag.current = null;
    setSnapGuide(null);
    useEditorStore.getState().endTransaction();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.stopPropagation();
    const store = useEditorStore.getState();

    if (event.shiftKey || event.metaKey || event.ctrlKey) store.toggleSelect(clip.id);
    else if (!store.selectedClipIds.includes(clip.id)) store.select([clip.id]);

    if (locked) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const mode: DragMode = localX < handleWidth ? 'trim-start' : localX > rect.width - handleWidth ? 'trim-end' : 'move';

    drag.current = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: { start: clip.start, duration: clip.duration, trackId: clip.trackId },
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    store.beginTransaction();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    if (!state.moved) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      state.moved = true;
    }

    const store = useEditorStore.getState();
    const dFrames = Math.round(dx / pxPerFrame);
    const snapping = store.snappingEnabled;
    const targets = snapping ? collectSnapTargets(store.project, new Set([clip.id]), store.playhead) : [];
    const threshold = snapThresholdFrames(SNAP_PX, pxPerFrame);
    const { origin } = state;

    if (state.mode === 'move') {
      let start = Math.max(0, origin.start + dFrames);
      let guide: Frames | null = null;
      if (snapping) {
        const snapped = snapClipMove(start, origin.duration, targets, threshold);
        start = Math.max(0, snapped.frame);
        guide = snapped.target;
      }
      const hoveredTrack = trackAt(event.clientY);
      store.moveClip(clip.id, start, hoveredTrack ?? undefined);
      setSnapGuide(guide);
      return;
    }

    const edgeOrigin = state.mode === 'trim-start' ? origin.start : origin.start + origin.duration;
    let frame = edgeOrigin + dFrames;
    let guide: Frames | null = null;
    if (snapping) {
      const snapped = snapFrame(frame, targets, threshold);
      frame = snapped.frame;
      guide = snapped.target;
    }
    store.trimClip(clip.id, state.mode === 'trim-start' ? 'start' : 'end', frame);
    setSnapGuide(guide);
  };

  const sourceStart = clip.offset / fps;
  const sourceEnd = (clip.offset + clip.duration * clip.speed) / fps;
  const fadeInPx = clip.fadeIn * pxPerFrame;
  const fadeOutPx = clip.fadeOut * pxPerFrame;
  const showWave = (clip.kind === 'audio' || clip.kind === 'video') && asset?.waveform && asset.waveform.length > 0;

  // Transition widths
  const transInPx = clip.transitionIn && clip.transitionIn.type !== 'none'
    ? Math.min(width * 0.45, (clip.transitionIn.duration || 15) * pxPerFrame)
    : 0;
  const transOutPx = clip.transitionOut && clip.transitionOut.type !== 'none'
    ? Math.min(width * 0.45, (clip.transitionOut.duration || 15) * pxPerFrame)
    : 0;

  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={clip.name}
      aria-pressed={selected}
      data-clip-id={clip.id}
      className={`group absolute top-1 bottom-1 overflow-hidden rounded-md border ${style.bg} ${
        selected ? 'z-10 border-white shadow-lg shadow-black/50 ring-2 ring-accent' : 'border-black/50'
      } ${locked ? 'cursor-not-allowed opacity-70' : 'cursor-grab active:cursor-grabbing'}`}
      style={{ left, width, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={finishDrag}
      title={`${clip.name} · ${clip.start}–${clipEnd(clip)}f`}
    >
      {clip.kind === 'video' && asset?.thumbnail && (
        <div
          className="absolute inset-0 opacity-50"
          style={{ backgroundImage: `url(${asset.thumbnail})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }}
        />
      )}
      {clip.kind === 'image' && asset?.thumbnail && (
        <div
          className="absolute inset-0 opacity-50"
          style={{ backgroundImage: `url(${asset.thumbnail})`, backgroundSize: 'auto 100%', backgroundRepeat: 'repeat-x' }}
        />
      )}
      {showWave && asset?.waveform && (
        <div className={`absolute inset-x-0 ${clip.kind === 'video' ? 'bottom-0 h-1/2' : 'inset-y-0'}`}>
          <WaveformCanvas
            peaks={asset.waveform}
            assetDuration={asset.duration}
            sourceStart={sourceStart}
            sourceEnd={sourceEnd}
            width={Math.min(width, 4096)}
            height={clip.kind === 'video' ? 24 : 44}
            color={style.wave}
          />
        </div>
      )}

      {/* Visual Transition In badge */}
      {transInPx > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center bg-purple-500/30 border-r border-purple-400 px-1 text-[9px] font-bold text-purple-200"
          style={{ width: transInPx }}
        >
          <span className="truncate">⚡ {clip.transitionIn?.type}</span>
        </div>
      )}

      {/* Visual Transition Out badge */}
      {transOutPx > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 flex items-center justify-end bg-purple-500/30 border-l border-purple-400 px-1 text-[9px] font-bold text-purple-200"
          style={{ width: transOutPx }}
        >
          <span className="truncate">{clip.transitionOut?.type} ⚡</span>
        </div>
      )}

      {fadeInPx > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{ width: fadeInPx, background: 'linear-gradient(to right, rgba(0,0,0,0.75), rgba(0,0,0,0))' }}
        />
      )}
      {fadeOutPx > 0 && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0"
          style={{ width: fadeOutPx, background: 'linear-gradient(to left, rgba(0,0,0,0.75), rgba(0,0,0,0))' }}
        />
      )}

      <div className={`pointer-events-none absolute inset-x-0 top-0 truncate px-1.5 py-0.5 text-[11px] font-medium ${style.text}`}>
        {clip.kind === 'text' ? `T · ${clip.text?.content ?? clip.name}` : clip.name}
        {clip.speed !== 1 && <span className="ml-1 text-white/60">{clip.speed}×</span>}
        {clip.muted && <span className="ml-1 text-white/60">🔇</span>}
      </div>

      {!locked && (
        <>
          <div
            className={`clip-handle absolute inset-y-0 left-0 ${selected ? 'bg-white/30' : 'bg-transparent group-hover:bg-white/20'}`}
            style={{ width: handleWidth }}
          />
          <div
            className={`clip-handle absolute inset-y-0 right-0 ${selected ? 'bg-white/30' : 'bg-transparent group-hover:bg-white/20'}`}
            style={{ width: handleWidth }}
          />
        </>
      )}
    </div>
  );
});
